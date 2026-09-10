import { Prisma, type Order, type OrderItem, type Refund } from "@prisma/client";
import { db } from "@/lib/db";
import { adjustVariantStockInTx } from "@/lib/inventory/stock";
import { sendPendingRestockAlerts } from "@/lib/jobs/restock-alerts";
import { getPaymentProvider } from "@/lib/payments";
import { timelinePush } from "./transitions";
import { notifyOrderStatus } from "./status-mail";

/**
 * Operator refunds and cancellations (§14.7). Money moves through the
 * provider abstraction; the local order state is applied only after the
 * provider accepted the refund, keyed by the Refund row so a retry can never
 * refund twice. Restocking goes through the stock helper (rule 13).
 */

const TX = { maxWait: 10_000, timeout: 20_000 };
const REFUNDABLE_STATUSES: ReadonlySet<string> = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);

export type RefundError =
  | "not_found" | "not_refundable" | "pending" | "invalid_lines" | "amount" | "provider" | "provider_unavailable";

export interface RefundLineInput { orderItemId: string; quantity: number }

export interface RefundRequest {
  lines: RefundLineInput[];
  refundShipping: boolean;
  /** Signed correction in cents (e.g. to honour a coupon discount); may be zero. */
  adjustmentCents: number;
  reason: string;
  restock: boolean;
  actorId: string | null;
  actorName: string;
  /** A full refund normally ends in REFUNDED; a cancellation ends in CANCELLED. */
  finalStatus?: "REFUNDED" | "CANCELLED";
}

export type RefundPlan =
  | { ok: true; amountCents: number; vatCents: number; lines: RefundLineInput[]; full: boolean }
  | { ok: false; reason: RefundError };

export type RefundResult =
  | { ok: true; refundId: string; amountCents: number; full: boolean; status: string }
  | { ok: false; reason: RefundError };

/** VAT share of a VAT-inclusive amount, rounded to the cent. */
export function refundVatCents(amountCents: number, vatRatePercent: number): number {
  return Math.round((amountCents * vatRatePercent) / (100 + vatRatePercent));
}

/** Quantities already refunded per order line (pending and completed refunds count). */
export function refundedQuantities(refunds: Array<Pick<Refund, "status" | "lines">>): Map<string, number> {
  const map = new Map<string, number>();
  for (const refund of refunds) {
    if (refund.status === "FAILED" || !Array.isArray(refund.lines)) continue;
    for (const entry of refund.lines as Array<{ orderItemId?: unknown; quantity?: unknown }>) {
      if (typeof entry.orderItemId === "string" && typeof entry.quantity === "number") {
        map.set(entry.orderItemId, (map.get(entry.orderItemId) ?? 0) + entry.quantity);
      }
    }
  }
  return map;
}

/** Pure validation and arithmetic; the caller holds the order lock. */
export function planRefund(
  order: Pick<Order, "status" | "paidAt" | "totalCents" | "refundedCents" | "shippingCents" | "vatRatePercent">,
  items: Array<Pick<OrderItem, "id" | "quantity" | "unitPriceCents">>,
  refunds: Array<Pick<Refund, "status" | "lines" | "shippingRefunded">>,
  request: Pick<RefundRequest, "lines" | "refundShipping" | "adjustmentCents">,
): RefundPlan {
  if (!REFUNDABLE_STATUSES.has(order.status) || !order.paidAt) return { ok: false, reason: "not_refundable" };
  const prior = refundedQuantities(refunds);
  const lines: RefundLineInput[] = [];
  let lineCents = 0;
  for (const line of request.lines) {
    const item = items.find((candidate) => candidate.id === line.orderItemId);
    if (!item || !Number.isInteger(line.quantity) || line.quantity < 0) return { ok: false, reason: "invalid_lines" };
    if (line.quantity === 0) continue;
    if (line.quantity > item.quantity - (prior.get(item.id) ?? 0)) return { ok: false, reason: "invalid_lines" };
    lines.push({ orderItemId: item.id, quantity: line.quantity });
    lineCents += item.unitPriceCents * line.quantity;
  }
  const shippingAlreadyRefunded = refunds.some((refund) => refund.status !== "FAILED" && refund.shippingRefunded);
  if (request.refundShipping && (shippingAlreadyRefunded || order.shippingCents <= 0)) return { ok: false, reason: "invalid_lines" };
  if (!Number.isSafeInteger(request.adjustmentCents) || Math.abs(request.adjustmentCents) > order.totalCents) return { ok: false, reason: "amount" };
  if (lines.length === 0 && !request.refundShipping && request.adjustmentCents === 0) return { ok: false, reason: "invalid_lines" };
  const amountCents = lineCents + (request.refundShipping ? order.shippingCents : 0) + request.adjustmentCents;
  const remaining = order.totalCents - order.refundedCents;
  if (amountCents <= 0 || amountCents > remaining) return { ok: false, reason: "amount" };
  return { ok: true, amountCents, vatCents: refundVatCents(amountCents, order.vatRatePercent), lines, full: amountCents === remaining };
}

type OrderWithRefundState = Order & { items: OrderItem[]; refunds: Refund[] };

async function lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<OrderWithRefundState | null> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`);
  return tx.order.findUnique({ where: { id: orderId }, include: { items: true, refunds: true } });
}

function providerIntent(order: Order): string | null {
  if (order.paymentProvider === "paypal") return order.paypalOrderId;
  return order.stripePaymentIntentId;
}

/** Bundle lines restock their components; plain lines their variant. */
function restockTargets(item: OrderItem, quantity: number): Array<{ variantId: string; delta: number }> {
  const properties = item.properties as { bundleComponents?: Array<{ variantId?: unknown; quantity?: unknown }> } | null;
  if (properties?.bundleComponents && Array.isArray(properties.bundleComponents)) {
    return properties.bundleComponents.flatMap((component) =>
      typeof component.variantId === "string" && typeof component.quantity === "number"
        ? [{ variantId: component.variantId, delta: component.quantity * quantity }] : []);
  }
  return item.variantId ? [{ variantId: item.variantId, delta: quantity }] : [];
}

export async function refundOrder(orderId: string, request: RefundRequest): Promise<RefundResult> {
  const reason = request.reason.trim().slice(0, 500);
  // 1. Validate under the order lock and persist the intent before any money moves.
  const prepared = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) return { ok: false as const, reason: "not_found" as RefundError };
    if (order.refunds.some((refund) => refund.status === "PENDING")) return { ok: false as const, reason: "pending" as RefundError };
    const plan = planRefund(order, order.items, order.refunds, request);
    if (!plan.ok) return plan;
    const refund = await tx.refund.create({
      data: {
        orderId, provider: order.paymentProvider ?? "unknown", status: "PENDING",
        amountCents: plan.amountCents, vatCents: plan.vatCents, reason, restock: request.restock,
        shippingRefunded: request.refundShipping, lines: plan.lines as unknown as Prisma.InputJsonValue,
        actorId: request.actorId, actorName: request.actorName,
      },
    });
    return { ok: true as const, order, refund, plan };
  }, TX);
  if (!prepared.ok) return prepared;
  const { order, refund, plan } = prepared;

  // 2. Move the money; the Refund row id is the provider idempotency key.
  const providerName = order.paymentProvider;
  const provider = providerName === "stripe" || providerName === "paypal" || providerName === "test" ? getPaymentProvider(providerName) : null;
  const intentId = providerIntent(order);
  if (!provider?.refund || !intentId) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", lastError: "provider_unavailable" } });
    return { ok: false, reason: "provider_unavailable" };
  }
  let providerRefundId: string;
  try {
    providerRefundId = (await provider.refund({ intentId, amountCents: plan.amountCents, currency: order.currency, idempotencyKey: refund.id })).refundId;
  } catch (error) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", lastError: error instanceof Error ? error.name : "ProviderError" } });
    console.error("Refund refused by the provider", order.number);
    return { ok: false, reason: "provider" };
  }

  // 3. Apply locally: totals, status, restock, timeline.
  const applied = await db.$transaction(async (tx) => {
    const current = await lockOrder(tx, orderId);
    if (!current) throw new Error("order_vanished");
    const refundedCents = Math.min(current.totalCents, current.refundedCents + plan.amountCents);
    const full = refundedCents >= current.totalCents;
    const status = full ? (request.finalStatus ?? "REFUNDED") : current.status;
    await tx.refund.update({ where: { id: refund.id }, data: { status: "COMPLETED", providerRefundId, completedAt: new Date() } });
    let armed = 0;
    if (request.restock && current.stockDeducted) {
      for (const line of plan.lines) {
        const item = current.items.find((candidate) => candidate.id === line.orderItemId);
        if (!item) continue;
        for (const target of restockTargets(item, line.quantity)) {
          armed += (await adjustVariantStockInTx(tx, target.variantId, target.delta)).armedAlerts;
        }
      }
    }
    const event = status === "CANCELLED" ? "cancelled" : full ? "refunded" : "partially_refunded";
    await tx.order.update({
      where: { id: orderId },
      data: {
        refundedCents, status,
        ...(full ? { refundRequired: false, confirmationEmailPending: false } : {}),
        timeline: timelinePush(current, event, `cents:${plan.amountCents}:${request.actorName}`),
      },
    });
    return { full, status, armed };
  }, TX);

  if (applied.armed > 0) {
    try { await sendPendingRestockAlerts(); } catch (error) { console.error("Restock alerts remain queued", error); }
  }
  await notifyOrderStatus(orderId, applied.status === "CANCELLED" ? "cancelled" : "refunded", { amountCents: plan.amountCents });
  return { ok: true, refundId: refund.id, amountCents: plan.amountCents, full: applied.full, status: applied.status };
}

export type CancelResult =
  | { ok: true; refunded: boolean }
  | { ok: false; reason: "not_found" | "invalid_transition" | RefundError };

/**
 * PENDING → CANCELLED (nothing captured; a Stripe intent is voided best-effort).
 * PAID/PROCESSING → CANCELLED only through a full refund with restock.
 * Shipped or delivered orders are refunded, never cancelled.
 */
export async function cancelOrder(orderId: string, input: { actorId: string | null; actorName: string; reason: string }): Promise<CancelResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, refunds: true } });
  if (!order) return { ok: false, reason: "not_found" };
  const reason = input.reason.trim().slice(0, 500) || "cancelled";

  if (order.status === "PENDING" && !order.paidAt && !order.stockDeducted) {
    const cancelled = await db.$transaction(async (tx) => {
      const current = await lockOrder(tx, orderId);
      if (!current || current.status !== "PENDING" || current.paidAt || current.stockDeducted) return false;
      await tx.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED", confirmationEmailPending: false, timeline: timelinePush(current, "cancelled", `${reason}:${input.actorName}`) },
      });
      return true;
    }, TX);
    if (!cancelled) return { ok: false, reason: "invalid_transition" };
    const providerName = order.paymentProvider;
    const provider = providerName === "stripe" || providerName === "paypal" || providerName === "test" ? getPaymentProvider(providerName) : null;
    const intentId = providerIntent(order);
    if (provider?.voidIntent && intentId) {
      try { await provider.voidIntent(intentId); } catch { console.error("Payment intent void deferred", order.number); }
    }
    await notifyOrderStatus(orderId, "cancelled");
    return { ok: true, refunded: false };
  }

  if (order.status !== "PAID" && order.status !== "PROCESSING") return { ok: false, reason: "invalid_transition" };
  const remaining = order.totalCents - order.refundedCents;
  if (remaining <= 0) {
    await db.$transaction(async (tx) => {
      const current = await lockOrder(tx, orderId);
      if (!current || (current.status !== "PAID" && current.status !== "PROCESSING")) return;
      await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", timeline: timelinePush(current, "cancelled", `${reason}:${input.actorName}`) } });
    }, TX);
    return { ok: true, refunded: false };
  }
  const prior = refundedQuantities(order.refunds);
  const lines = order.items
    .map((item) => ({ orderItemId: item.id, quantity: item.quantity - (prior.get(item.id) ?? 0) }))
    .filter((line) => line.quantity > 0);
  const shippingAlreadyRefunded = order.refunds.some((refund) => refund.status !== "FAILED" && refund.shippingRefunded);
  const refundShipping = !shippingAlreadyRefunded && order.shippingCents > 0;
  const covered = lines.reduce((sum, line) => sum + (order.items.find((item) => item.id === line.orderItemId)?.unitPriceCents ?? 0) * line.quantity, 0)
    + (refundShipping ? order.shippingCents : 0);
  const result = await refundOrder(orderId, {
    lines, refundShipping, adjustmentCents: remaining - covered, reason, restock: true,
    actorId: input.actorId, actorName: input.actorName, finalStatus: "CANCELLED",
  });
  return result.ok ? { ok: true, refunded: true } : result;
}
