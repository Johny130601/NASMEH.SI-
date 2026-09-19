"use server";

import { headers } from "next/headers";
import type { Order } from "@prisma/client";
import { z } from "zod";
import { clientAddress } from "@/lib/client-address";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { deliveryEstimate, getShippingMethods, normalizeTrackingNumber, trackingUrl } from "@/lib/tracking";
import { tracking as copy } from "@/lib/copy/tracking";

/** Public tracking (§12.3) is an order-status oracle: challenge + per-client rate limit. */
const RATE_LIMIT = { limit: 20, windowMs: 10 * 60_000 };

export interface ShipmentView {
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingLink: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  estimate: string | null;
}

export interface OrderView extends ShipmentView {
  number: string;
  shippingMethod: string | null;
  itemCount: number;
  totalCents: number;
  createdAt: string;
}

export type TrackingResult<T> = { ok: true; data: T } | { ok: false; error: string };

const tokenSchema = z.string().max(2048).default("");

async function clientKey(mode: "number" | "order"): Promise<string> {
  return `track:${mode}:${clientAddress(await headers())}`;
}

/** Exceeding the limit reads exactly like a miss; a failed challenge is explicit. */
async function guard(mode: "number" | "order", token: string): Promise<string | null> {
  if (!checkRateLimit(await clientKey(mode), RATE_LIMIT.limit, RATE_LIMIT.windowMs).allowed) {
    return copy.errors.notFound;
  }
  if (!await verifyTurnstile(token)) return copy.errors.challenge;
  return null;
}

async function shipmentView(order: Order): Promise<ShipmentView> {
  const [trackingLink, methods] = await Promise.all([
    trackingUrl(order.carrier, order.trackingNumber),
    getShippingMethods(),
  ]);
  return {
    status: order.status,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    trackingLink,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    estimate: deliveryEstimate(order.shippingMethod, methods),
  };
}

/** Tracking-number mode returns shipment state only: no names, addresses or lines. */
export async function trackShipmentAction(input: {
  trackingNumber: string;
  turnstileToken: string;
}): Promise<TrackingResult<ShipmentView>> {
  const parsed = z.object({ trackingNumber: z.string().max(80), turnstileToken: tokenSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: copy.errors.notFound };
  const denied = await guard("number", parsed.data.turnstileToken);
  if (denied) return { ok: false, error: denied };
  const trackingNumber = normalizeTrackingNumber(parsed.data.trackingNumber);
  if (!trackingNumber) return { ok: false, error: copy.errors.notFound };
  try {
    const orders = await db.order.findMany({ where: { trackingNumber }, take: 2 });
    if (orders.length !== 1) {
      // Two orders sharing a number is a data error; never guess which to show.
      if (orders.length > 1) console.error("Tracking number is not unique");
      return { ok: false, error: copy.errors.notFound };
    }
    return { ok: true, data: await shipmentView(orders[0]) };
  } catch {
    return { ok: false, error: copy.errors.failed };
  }
}

/** Email + order-number mode: the purchaser's fuller view (§11.3). */
export async function trackOrderAction(input: {
  email: string;
  orderNumber: string;
  turnstileToken: string;
}): Promise<TrackingResult<OrderView>> {
  const parsed = z.object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    orderNumber: z.string().trim().toUpperCase().regex(/^NS-\d{4}-\d{5}$/),
    turnstileToken: tokenSchema,
  }).safeParse(input);
  const denied = await guard("order", parsed.success ? parsed.data.turnstileToken : tokenSchema.parse(input?.turnstileToken ?? ""));
  if (denied) return { ok: false, error: denied };
  if (!parsed.success) return { ok: false, error: copy.errors.notFound };
  try {
    const order = await db.order.findFirst({
      where: { number: parsed.data.orderNumber, email: parsed.data.email },
      include: { items: { select: { quantity: true } } },
    });
    if (!order) return { ok: false, error: copy.errors.notFound };
    return {
      ok: true,
      data: {
        ...(await shipmentView(order)),
        number: order.number,
        shippingMethod: order.shippingMethod,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        totalCents: order.totalCents,
        createdAt: order.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, error: copy.errors.failed };
  }
}
