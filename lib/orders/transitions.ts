import { Prisma, type Order } from "@prisma/client";
import { db } from "@/lib/db";
import { isTestMode } from "@/lib/turnstile";
import { getCompany, getInvoiceFooter } from "@/lib/settings";
import { buildInvoiceSnapshot, invoiceSnapshotJson } from "@/lib/invoice/snapshot";
import { configuredCarriers, getShippingMethods, normalizeTrackingNumber } from "@/lib/tracking";
import { deliverOrderConfirmation } from "./confirmation-delivery";
import { deductOrderInventory } from "./inventory";
import { deliverOrderShipped } from "./shipped-delivery";
import { notifyOrderStatus } from "./status-mail";
import { timelinePush } from "./timeline";

/** Re-exported so existing callers (and the unit tests that mock this module) keep one import. */
export { timelinePush };

export interface PaymentDetails { amountCents: number; currency: string }
export interface RefundDetails extends PaymentDetails { totalRefundedCents?: number }

export type TransitionResult =
  | { outcome: "paid" | "stockout"; orderNumber: string }
  | { outcome: "already_processed" | "already_paid" | "not_found" | "ignored" | "payment_mismatch" | "refund_in_flight" };

class RetryableTransition extends Error {
  constructor(readonly result: TransitionResult) {
    super(result.outcome);
  }
}

function paymentOrderWhere(provider: string, intentId: string): Prisma.OrderWhereInput {
  if (provider === "paypal") return { paymentProvider: "paypal", paypalOrderId: intentId };
  if (provider === "stripe") {
    return {
      paymentProvider: { in: isTestMode() ? ["stripe", "test"] : ["stripe"] },
      stripePaymentIntentId: intentId,
    };
  }
  return { id: "" }; // Unknown providers cannot resolve any order.
}

async function lockPaymentOrder(tx: Prisma.TransactionClient, provider: string, intentId: string) {
  const candidate = await tx.order.findFirst({
    where: paymentOrderWhere(provider, intentId),
    select: { id: true },
  });
  if (!candidate) throw new RetryableTransition({ outcome: "not_found" });
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE`);
  // Read AFTER acquiring the lock: concurrent events may have advanced status.
  const order = await tx.order.findFirst({
    where: { id: candidate.id, ...paymentOrderWhere(provider, intentId) },
  });
  if (!order) throw new RetryableTransition({ outcome: "not_found" });
  return order;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : "UnknownError");

function isProcessedEventDuplicate(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target : [];
  return (error.meta?.modelName === undefined || error.meta.modelName === "ProcessedEvent") &&
    fields.includes("eventId") && fields.every((field) => field === "eventId" || field === "provider");
}

/** The event marker, order state, timeline, invoice and stock commit together. */
async function applyEvent(
  provider: string,
  eventId: string,
  type: string,
  intentId: string,
  transition: (tx: Prisma.TransactionClient, order: Order) => Promise<TransitionResult>,
): Promise<TransitionResult> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.processedEvent.create({ data: { provider, eventId, type } });
      const order = await lockPaymentOrder(tx, provider, intentId);
      return transition(tx, order);
    }, { maxWait: 10_000, timeout: 20_000 });
  } catch (error) {
    if (error instanceof RetryableTransition) return error.result;
    if (isProcessedEventDuplicate(error)) return { outcome: "already_processed" };
    // A DB outage, failed inventory update or invoice uniqueness error must
    // propagate as a failed delivery. The whole transaction has rolled back.
    throw error;
  }
}

function validMoney(details: PaymentDetails, order: Order) {
  return Number.isSafeInteger(details.amountCents) && details.amountCents >= 0 &&
    details.currency.toUpperCase() === order.currency.toUpperCase();
}

/** Verified captured payment only. Later fulfillment/refund states never regress. */
export async function markOrderPaid(
  provider: string,
  eventId: string,
  intentId: string,
  details?: PaymentDetails,
): Promise<TransitionResult> {
  // Read before the transaction opens: a pooled read inside it would hold a second connection while the order row is locked.
  const [company, footer] = await Promise.all([getCompany(), getInvoiceFooter()]);
  const result = await applyEvent(provider, eventId, "payment.succeeded", intentId, async (tx, order) => {
    if ((!details && !isTestMode()) || (details && (!validMoney(details, order) || details.amountCents !== order.totalCents))) {
      throw new RetryableTransition({ outcome: "payment_mismatch" });
    }
    if (order.status === "CANCELLED" && !order.paidAt && !order.stockDeducted) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          paidAt: new Date(),
          refundRequired: true,
          fulfillmentIssue: "payment_received_after_cancellation",
          timeline: timelinePush(order, "payment_received_refund_required", "payment_received_after_cancellation"),
        },
      });
      return { outcome: "stockout", orderNumber: order.number };
    }
    // The buyer was erased while this order was still open (the admin refuses that now,
    // but an older erasure can still be met here). Issuing an invoice would freeze a
    // scrubbed buyer into the snapshot and queue a confirmation to nobody, so take the
    // money's arrival on the record and leave the money owed explicit instead.
    if (order.anonymizedAt) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          paidAt: new Date(),
          refundRequired: true,
          fulfillmentIssue: "payment_received_after_anonymisation",
          timeline: timelinePush(order, "payment_received_refund_required", "payment_received_after_anonymisation"),
        },
      });
      return { outcome: "stockout", orderNumber: order.number };
    }
    if (order.status !== "PENDING" || order.stockDeducted || order.paidAt) {
      return { outcome: "already_paid" };
    }

    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    const inventory = await deductOrderInventory(tx, items);
    if (!inventory.ok) {
      // Money was captured. Keep cancellation explicit about the money still
      // owed to the purchaser, rather than implying an unpaid cancellation.
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          paidAt: new Date(),
          refundRequired: true,
          fulfillmentIssue: inventory.reason,
          confirmationEmailPending: false,
          timeline: timelinePush(order, "payment_received_refund_required", inventory.reason),
        },
      });
      return { outcome: "stockout", orderNumber: order.number };
    }

    const now = new Date();
    // The invoice is issued here: seller, buyer and footer are frozen with the
    // number so later company edits or anonymisation cannot rewrite it. A
    // missing or invalid company Setting must not block a captured payment;
    // the confirmation delivery refuses to send an invoice without a seller.
    if (!company) console.error("Invoice issued without a seller snapshot: company Setting missing or invalid");
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAt: now,
        stockDeducted: true,
        refundRequired: false,
        fulfillmentIssue: null,
        invoiceNumber: order.number,
        invoiceIssuedAt: now,
        ...(company ? { invoiceSnapshot: invoiceSnapshotJson(buildInvoiceSnapshot(order, company, footer, now)) } : {}),
        confirmationEmailPending: true,
        // The order's own provider: a test-driver order is confirmed through the Stripe route (QA C2-F18).
        timeline: timelinePush(order, "paid", `provider:${order.paymentProvider ?? provider}`),
      },
    });
    // The checkout became a paid order: its abandoned-checkout capture has no purpose left (GDPR Art. 5(1)(c), (e)).
    if (order.checkoutKey) {
      await tx.abandonedCheckout.deleteMany({ where: { recoveryToken: order.checkoutKey } });
    }
    return { outcome: "paid", orderNumber: order.number };
  });

  if (["paid", "already_paid", "already_processed"].includes(result.outcome)) {
    // Delivery failure does not lose the payment update; the queue survives
    // process crashes and is retried by webhook redelivery and the daily job.
    try {
      const order = await db.order.findFirst({
        where: { ...paymentOrderWhere(provider, intentId), confirmationEmailPending: true },
        select: { id: true },
      });
      if (order) await deliverOrderConfirmation(order.id);
    } catch (error) {
      // Error objects can carry SMTP recipients or query values; log only the type.
      console.error("Order confirmation remains pending", errorName(error));
    }
  }
  return result;
}

/** Failed attempts can annotate a pending order without reversing captured payment. */
export async function markPaymentFailed(
  provider: string,
  eventId: string,
  intentId: string,
  reason?: string,
): Promise<TransitionResult> {
  return applyEvent(provider, eventId, "payment.failed", intentId, async (tx, order) => {
    if (order.status !== "PENDING" || order.paidAt) return { outcome: "ignored" };
    await tx.order.update({
      where: { id: order.id },
      data: { timeline: timelinePush(order, "payment_failed", reason ?? order.paymentProvider ?? provider) },
    });
    return { outcome: "ignored" };
  });
}

/** An uncaptured PSP cancellation is terminal; it cannot reverse paid stock. */
export async function markPaymentCancelled(
  provider: string,
  eventId: string,
  intentId: string,
): Promise<TransitionResult> {
  return applyEvent(provider, eventId, "payment.cancelled", intentId, async (tx, order) => {
    if (order.status !== "PENDING" || order.paidAt || order.stockDeducted) return { outcome: "ignored" };
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        confirmationEmailPending: false,
        timeline: timelinePush(order, "payment_cancelled", order.paymentProvider ?? provider),
      },
    });
    return { outcome: "ignored" };
  });
}

// ---------- Fulfilment (operator-driven, §12.3 / §14.7) ----------

export type FulfillmentResult =
  | { ok: true; orderNumber: string; status: "SHIPPED" | "DELIVERED" }
  | { ok: false; reason: "not_found" | "invalid_transition" | "missing_tracking" | "unknown_carrier" };

export interface ShipmentInput {
  carrier: string;
  trackingNumber: string;
  /** Who performed the transition (admin id, "job", "e2e"); recorded in the timeline. */
  actor: string;
}

const FULFILLMENT_TX = { maxWait: 10_000, timeout: 20_000 };

async function lockOrderById(tx: Prisma.TransactionClient, orderId: string): Promise<Order | null> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`);
  return tx.order.findUnique({ where: { id: orderId } });
}

/**
 * PAID/PROCESSING → SHIPPED. The carrier must be one the store ships with and
 * the tracking number is stored normalised. The first shipment stamps
 * `shippedAt`; the shipped email is queued durably and sent post-commit.
 */
export async function markOrderShipped(orderId: string, input: ShipmentInput): Promise<FulfillmentResult> {
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
  if (!trackingNumber) return { ok: false, reason: "missing_tracking" };
  const carrier = input.carrier.trim();
  if (!configuredCarriers(await getShippingMethods()).includes(carrier)) {
    return { ok: false, reason: "unknown_carrier" };
  }

  const result = await db.$transaction(async (tx): Promise<FulfillmentResult> => {
    const order = await lockOrderById(tx, orderId);
    if (!order) return { ok: false, reason: "not_found" };
    if (order.status !== "PAID" && order.status !== "PROCESSING") {
      return { ok: false, reason: "invalid_transition" };
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "SHIPPED",
        carrier,
        trackingNumber,
        shippedAt: order.shippedAt ?? new Date(),
        shippedEmailPending: true,
        shippedEmailLeaseUntil: null,
        shippedEmailLastError: null,
        timeline: timelinePush(order, "shipped", `${carrier}:${input.actor}`),
      },
    });
    return { ok: true, orderNumber: order.number, status: "SHIPPED" };
  }, FULFILLMENT_TX);

  if (result.ok) {
    // Delivery failure never loses the transition; the daily job retries.
    try {
      await deliverOrderShipped(orderId);
    } catch (error) {
      console.error("Shipped notification remains pending", errorName(error));
    }
  }
  return result;
}

/** SHIPPED → DELIVERED. The database trigger stamps `deliveredAt` once. */
export async function markOrderDelivered(orderId: string, input: { actor: string }): Promise<FulfillmentResult> {
  const result = await db.$transaction(async (tx): Promise<FulfillmentResult> => {
    const order = await lockOrderById(tx, orderId);
    if (!order) return { ok: false, reason: "not_found" };
    if (order.status !== "SHIPPED") return { ok: false, reason: "invalid_transition" };
    await tx.order.update({
      where: { id: order.id },
      data: { status: "DELIVERED", timeline: timelinePush(order, "delivered", input.actor) },
    });
    return { ok: true, orderNumber: order.number, status: "DELIVERED" };
  }, FULFILLMENT_TX);
  if (result.ok) await notifyOrderStatus(orderId, "delivered");
  return result;
}

export type ProcessingResult =
  | { ok: true; orderNumber: string; status: "PROCESSING" }
  | { ok: false; reason: "not_found" | "invalid_transition" };

/** PAID → PROCESSING (§14.7): the operator has started fulfilment; best-effort mail. */
export async function markOrderProcessing(orderId: string, input: { actor: string }): Promise<ProcessingResult> {
  const result = await db.$transaction(async (tx): Promise<ProcessingResult> => {
    const order = await lockOrderById(tx, orderId);
    if (!order) return { ok: false, reason: "not_found" };
    if (order.status !== "PAID" || order.refundRequired) return { ok: false, reason: "invalid_transition" };
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PROCESSING", timeline: timelinePush(order, "processing", input.actor) },
    });
    return { ok: true, orderNumber: order.number, status: "PROCESSING" };
  }, FULFILLMENT_TX);
  if (result.ok) await notifyOrderStatus(orderId, "processing");
  return result;
}

/** Partial refunds preserve fulfillment; only a full refund becomes REFUNDED. */
export async function markRefunded(
  provider: string,
  eventId: string,
  intentId: string,
  details?: RefundDetails,
): Promise<TransitionResult> {
  return applyEvent(provider, eventId, "charge.refunded", intentId, async (tx, order) => {
    if ((!details && !isTestMode()) || (details && !validMoney(details, order))) {
      throw new RetryableTransition({ outcome: "payment_mismatch" });
    }
    // An operator refund between its provider call and its local apply (lib/orders/refunds.ts
    // step 3) would be counted twice: defer the event, the provider retries it later, and by
    // then the row is COMPLETED (Stripe totals are cumulative, PayPal ids are skipped) or closed.
    const inFlight = await tx.refund.findFirst({ where: { orderId: order.id, status: "PENDING" }, select: { id: true } });
    if (inFlight) throw new RetryableTransition({ outcome: "refund_in_flight" });
    const refundedCents = details
      ? details.totalRefundedCents === undefined
        ? order.refundedCents + details.amountCents
        : Math.max(order.refundedCents, details.totalRefundedCents)
      : order.totalCents;
    if (!Number.isSafeInteger(refundedCents) || refundedCents < 0 || refundedCents > order.totalCents) {
      throw new RetryableTransition({ outcome: "payment_mismatch" });
    }
    if (refundedCents === order.refundedCents || order.status === "REFUNDED") return { outcome: "ignored" };
    const full = refundedCents === order.totalCents;
    await tx.order.update({
      where: { id: order.id },
      data: {
        refundedCents,
        ...(full ? {
          status: "REFUNDED",
          refundRequired: false,
          confirmationEmailPending: false,
        } : {}),
        timeline: timelinePush(order, full ? "refunded" : "partially_refunded", `cents:${refundedCents}`),
      },
    });
    return { outcome: "ignored" };
  });
}
