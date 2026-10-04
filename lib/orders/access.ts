import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getCartLines } from "@/lib/cart/server";
import { GUEST_CART_COOKIE } from "@/lib/cart/codec";
import {
  accessHash, cartDigest, ORDER_ACCESS_MAX_AGE_S, orderAccessCookieName,
  sessionOwnsOrder, signOrderReceipt, verifyOrderReceipt, type OrderReceipt,
} from "./access-token";

type AccessOrder = { number: string; checkoutKey: string | null; userId: string | null };
type AccessSession = { user?: { id?: string; role?: string } } | null;

export interface OrderCartSnapshot {
  principal: string | null;
  cartDigest: string;
  cartVersion: string;
  stable: boolean;
}

export async function getOrderReceipt(order: AccessOrder): Promise<OrderReceipt | null> {
  const raw = (await cookies()).get(orderAccessCookieName(order.number))?.value;
  return verifyOrderReceipt(raw, order, getEnv().AUTH_SECRET, new Date());
}

export async function hasOrderAccess(order: AccessOrder, session: AccessSession): Promise<boolean> {
  return sessionOwnsOrder(order, session) || (await getOrderReceipt(order)) !== null;
}

export async function currentCartVersion(userId: string | null): Promise<string> {
  if (!userId) return accessHash((await cookies()).get(GUEST_CART_COOKIE)?.value ?? "");
  const cart = await db.cart.findUnique({ where: { userId }, select: { id: true, updatedAt: true } });
  return cart ? `${cart.id}:${cart.updatedAt.toISOString()}` : "none";
}

/** Capture before order creation reaches any PSP network request. */
export async function captureOrderCart(): Promise<OrderCartSnapshot> {
  const principal = (await auth())?.user?.id ?? null;
  const before = await currentCartVersion(principal);
  const lines = await getCartLines(principal);
  const after = await currentCartVersion(principal);
  return { principal, cartDigest: cartDigest(lines), cartVersion: before, stable: before === after };
}

/** Only called after successful order creation/recovery with its original key. */
export async function grantOrderAccess(
  orderNumber: string,
  checkoutKey: string,
  options: { allowCartClear: boolean; expectedCart?: OrderCartSnapshot } = { allowCartClear: false },
): Promise<boolean> {
  const parsed = z.object({ orderNumber: z.string().min(1).max(80), checkoutKey: z.string().regex(/^[a-f0-9]{32}$/) })
    .safeParse({ orderNumber, checkoutKey });
  if (!parsed.success) return false;
  const order = await db.order.findUnique({ where: { number: parsed.data.orderNumber } });
  if (!order?.checkoutKey || order.checkoutKey.length !== checkoutKey.length ||
      !timingSafeEqual(Buffer.from(order.checkoutKey), Buffer.from(checkoutKey))) return false;
  const session = await auth();
  // A retry cannot rebind an old purchase to a newly assembled cart.
  if (await getOrderReceipt(order)) return true;
  if (order.userId && order.userId !== session?.user?.id) return false;
  const principal = session?.user?.id ?? null;
  const [lines, version] = await Promise.all([getCartLines(principal), currentCartVersion(principal)]);
  const digest = cartDigest(lines);
  const original = options.expectedCart;
  const mayClear = options.allowCartClear && original?.stable === true &&
    original.principal === principal && original.cartVersion === version && original.cartDigest === digest;
  const receipt: OrderReceipt = {
    v: 1, orderNumber, checkoutKeyHash: accessHash(checkoutKey), principal,
    allowCartClear: mayClear,
    cartDigest: original?.cartDigest ?? digest, cartVersion: original?.cartVersion ?? version,
    expiresAt: Date.now() + ORDER_ACCESS_MAX_AGE_S * 1000,
  };
  (await cookies()).set(orderAccessCookieName(orderNumber), signOrderReceipt(receipt, getEnv().AUTH_SECRET), {
    maxAge: ORDER_ACCESS_MAX_AGE_S,
    path: "/", httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return true;
}

/** How far back /checkout looks for an order this browser left unpaid. */
export const UNPAID_ORDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const RECEIPT_SCAN_LIMIT = 12;

/** The order number a receipt cookie names; the caller verifies it against the order itself. */
function receiptOrderNumber(raw: string): string | null {
  try {
    const parsed = z.object({ orderNumber: z.string().min(1).max(80) })
      .safeParse(JSON.parse(Buffer.from(raw.split(".")[0] ?? "", "base64url").toString("utf8")));
    return parsed.success ? parsed.data.orderNumber : null;
  } catch {
    return null;
  }
}

/**
 * The most recent order this browser (its signed receipts) or the signed-in shopper placed and
 * has not paid, within the last day. /checkout offers it back: a reload or Back during payment
 * used to lose the way to it, so shoppers placed a duplicate — and a once-per-customer code was
 * already spent on the first (QA 2026-10-03 T2-02).
 */
export async function findUnpaidOrderToResume(now = new Date()): Promise<{ number: string; totalCents: number } | null> {
  const since = new Date(now.getTime() - UNPAID_ORDER_LOOKBACK_MS);
  const jar = await cookies();
  const receipts = jar.getAll().filter((cookie) => cookie.name.startsWith("nasmeh_order_")).slice(0, RECEIPT_SCAN_LIMIT);
  const numbers = new Map<string, string>();
  for (const cookie of receipts) {
    const number = receiptOrderNumber(cookie.value);
    if (number && orderAccessCookieName(number) === cookie.name) numbers.set(number, cookie.value);
  }
  const userId = (await auth())?.user?.id ?? null;
  const candidates = await db.order.findMany({
    where: {
      status: "PENDING", paidAt: null, createdAt: { gte: since },
      OR: [{ number: { in: [...numbers.keys()] } }, ...(userId ? [{ userId }] : [])],
    },
    select: { number: true, checkoutKey: true, userId: true, totalCents: true },
    orderBy: { createdAt: "desc" },
    take: RECEIPT_SCAN_LIMIT,
  });
  const secret = getEnv().AUTH_SECRET;
  for (const order of candidates) {
    const owned = userId !== null && order.userId === userId;
    if (owned || verifyOrderReceipt(numbers.get(order.number), order, secret, now)) {
      return { number: order.number, totalCents: order.totalCents };
    }
  }
  return null;
}
