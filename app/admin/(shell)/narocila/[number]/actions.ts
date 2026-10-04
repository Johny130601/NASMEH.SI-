"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { deliverOrderConfirmation } from "@/lib/orders/confirmation-delivery";
import { deliverOrderShipped } from "@/lib/orders/shipped-delivery";
import { cancelOrder, refundCapturedPayment, refundOrder, type RefundError } from "@/lib/orders/refunds";
import { markOrderDelivered, markOrderProcessing, markOrderShipped } from "@/lib/orders/transitions";

const orderIdSchema = z.string().min(1).max(64);

export type OrderActionResult =
  | { ok: true; message: "processing" | "shipped" | "delivered" | "cancelled" | "refunded" | "settled" | "resent" | "resendQueued" | "noteSaved" }
  | { ok: false; message: "invalid" | "not_found" | "invalid_transition" | "missing_tracking" | "unknown_carrier" | "note_not_visible" | RefundError };

/**
 * Appends one entry to the order's activity log in a single statement, so a
 * concurrent webhook or mail-outcome append is never overwritten (QA N3: notes
 * and re-sent mails leave a trace).
 */
async function appendTimeline(orderId: string, event: string, detail: string) {
  const entry = JSON.stringify([{ at: new Date().toISOString(), event, detail }]);
  await db.$executeRaw`UPDATE "Order" SET "timeline" = CASE WHEN jsonb_typeof("timeline") = 'array' THEN "timeline" ELSE '[]'::jsonb END || ${entry}::jsonb WHERE "id" = ${orderId}`;
}

async function refresh(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { number: true } });
  revalidatePath("/admin/narocila");
  revalidatePath("/admin");
  if (order) {
    revalidatePath(`/admin/narocila/${order.number}`);
    revalidatePath(`/racun/narocilo/${order.number}`);
  }
}

export async function markProcessingAction(input: { orderId: string }): Promise<OrderActionResult> {
  const staff = await requirePermission("orders:fulfil");
  const parsed = z.object({ orderId: orderIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid" };
  const result = await markOrderProcessing(parsed.data.orderId, { actor: staff.email });
  await refresh(parsed.data.orderId);
  return result.ok ? { ok: true, message: "processing" } : { ok: false, message: result.reason };
}

export async function shipOrderAction(input: { orderId: string; carrier: string; trackingNumber: string }): Promise<OrderActionResult> {
  const staff = await requirePermission("orders:fulfil");
  const parsed = z.object({
    orderId: orderIdSchema, carrier: z.string().trim().min(1).max(80), trackingNumber: z.string().trim().min(1).max(60),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid" };
  const result = await markOrderShipped(parsed.data.orderId, {
    carrier: parsed.data.carrier, trackingNumber: parsed.data.trackingNumber, actor: staff.email,
  });
  await refresh(parsed.data.orderId);
  return result.ok ? { ok: true, message: "shipped" } : { ok: false, message: result.reason };
}

export async function markDeliveredAction(input: { orderId: string }): Promise<OrderActionResult> {
  const staff = await requirePermission("orders:fulfil");
  const parsed = z.object({ orderId: orderIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid" };
  const result = await markOrderDelivered(parsed.data.orderId, { actor: staff.email });
  await refresh(parsed.data.orderId);
  return result.ok ? { ok: true, message: "delivered" } : { ok: false, message: result.reason };
}

export async function cancelOrderAction(input: { orderId: string; reason: string }): Promise<OrderActionResult> {
  const staff = await requirePermission("orders:refund");
  const parsed = z.object({ orderId: orderIdSchema, reason: z.string().trim().min(1).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid" };
  const result = await cancelOrder(parsed.data.orderId, { actorId: staff.id, actorName: staff.email, reason: parsed.data.reason });
  await refresh(parsed.data.orderId);
  return result.ok ? { ok: true, message: "cancelled" } : { ok: false, message: result.reason };
}

export async function refundOrderAction(input: {
  orderId: string;
  lines: Array<{ orderItemId: string; quantity: number }>;
  refundShipping: boolean;
  adjustmentCents: number;
  reason: string;
  restock: boolean;
}): Promise<OrderActionResult> {
  const staff = await requirePermission("orders:refund");
  const parsed = z.object({
    orderId: orderIdSchema,
    lines: z.array(z.object({ orderItemId: z.string().min(1).max(64), quantity: z.number().int().min(0).max(1000) })).max(50),
    refundShipping: z.boolean(),
    adjustmentCents: z.number().int().min(-1_000_000).max(1_000_000),
    reason: z.string().trim().min(1).max(500),
    restock: z.boolean(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid" };
  const result = await refundOrder(parsed.data.orderId, {
    ...parsed.data, actorId: staff.id, actorName: staff.email,
  });
  await refresh(parsed.data.orderId);
  return result.ok ? { ok: true, message: result.status === "CANCELLED" ? "cancelled" : "refunded" } : { ok: false, message: result.reason };
}

/**
 * Settles the awaiting-refund queue (QA M3): a payment captured for an order
 * that could not be fulfilled goes back in full through the refund path
 * (lib/orders/refunds.ts, AGENTS §8.14), which clears `refundRequired`.
 */
export async function settleCapturedPaymentAction(input: { orderId: string; reason: string }): Promise<OrderActionResult> {
  const staff = await requirePermission("orders:refund");
  const parsed = z.object({ orderId: orderIdSchema, reason: z.string().trim().min(1).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid" };
  const result = await refundCapturedPayment(parsed.data.orderId, { actorId: staff.id, actorName: staff.email, reason: parsed.data.reason });
  await refresh(parsed.data.orderId);
  return result.ok ? { ok: true, message: "settled" } : { ok: false, message: result.reason };
}

export async function addOrderNoteAction(input: { orderId: string; body: string; visibleToCustomer: boolean }): Promise<OrderActionResult> {
  const staff = await requirePermission("orders:notes");
  const parsed = z.object({
    orderId: orderIdSchema, body: z.string().trim().min(1).max(4000), visibleToCustomer: z.boolean(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid" };
  const order = await db.order.findUnique({ where: { id: parsed.data.orderId }, select: { id: true, userId: true, anonymizedAt: true } });
  if (!order) return { ok: false, message: "not_found" };
  // A customer-visible note is read only on the account's order page (/racun/narocilo): a guest
  // order has no reader, nor has an erased buyer's, so "visible" would promise what never happens (QA 2026-10-03 T4-04).
  if (parsed.data.visibleToCustomer && (!order.userId || order.anonymizedAt)) return { ok: false, message: "note_not_visible" };
  await db.orderNote.create({
    data: {
      orderId: order.id, authorId: staff.id, authorName: staff.name ?? staff.email,
      body: parsed.data.body, visibleToCustomer: parsed.data.visibleToCustomer,
    },
  });
  // The entry names who wrote it, never the text: a note may quote the customer and is scrubbed on erasure, the log is not.
  await appendTimeline(order.id, "note_added", staff.email);
  await refresh(order.id);
  return { ok: true, message: "noteSaved" };
}

/** Re-queues the durable confirmation delivery and sends immediately when possible. */
export async function resendConfirmationAction(input: { orderId: string }): Promise<OrderActionResult> {
  const staff = await requirePermission("orders:notes");
  const parsed = z.object({ orderId: orderIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid" };
  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order) return { ok: false, message: "not_found" };
  // An anonymised order has no recipient left: delivery would only clear the flag again.
  if (order.anonymizedAt || !order.paidAt || !order.stockDeducted || order.refundRequired || ["CANCELLED", "REFUNDED"].includes(order.status)) {
    return { ok: false, message: "invalid_transition" };
  }
  await db.order.update({
    where: { id: order.id },
    data: { confirmationEmailPending: true, confirmationEmailSentAt: null, confirmationEmailLeaseUntil: null, confirmationEmailLastError: null },
  });
  const sent = await deliverOrderConfirmation(order.id);
  await appendTimeline(order.id, sent ? "confirmation_resent" : "confirmation_requeued", staff.email);
  await refresh(order.id);
  return { ok: true, message: sent ? "resent" : "resendQueued" };
}

export async function resendShippedAction(input: { orderId: string }): Promise<OrderActionResult> {
  const staff = await requirePermission("orders:notes");
  const parsed = z.object({ orderId: orderIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid" };
  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order) return { ok: false, message: "not_found" };
  if (order.anonymizedAt || !order.trackingNumber || !["SHIPPED", "DELIVERED"].includes(order.status)) return { ok: false, message: "invalid_transition" };
  await db.order.update({
    where: { id: order.id },
    data: { shippedEmailPending: true, shippedEmailSentAt: null, shippedEmailLeaseUntil: null, shippedEmailLastError: null },
  });
  const sent = await deliverOrderShipped(order.id);
  await appendTimeline(order.id, sent ? "shipped_resent" : "shipped_requeued", staff.email);
  await refresh(order.id);
  return { ok: true, message: sent ? "resent" : "resendQueued" };
}
