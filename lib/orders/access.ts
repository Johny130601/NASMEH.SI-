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
