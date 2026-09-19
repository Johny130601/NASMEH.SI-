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
 *
 * Three steps, each resumable: (1) validate under the order lock and persist
 * the PENDING row, (2) move the money and store the provider's refund id,
 * (3) apply totals, status, restock and timeline. A row left PENDING by a
 * crash or a failed apply is finished by `resolvePendingRefunds` (the daily
 * job, and the next refund or cancellation of the same order). While a row is
 * PENDING the provider's refund webhook is deferred (`markRefunded`), so the
 * same money is never counted twice.
 */

const TX = { maxWait: 10_000, timeout: 20_000 };
/** A PENDING row younger than this may still be an operation in flight (provider calls time out well before). */
const IN_FLIGHT_GRACE_MS = 5 * 60_000;
const REFUNDABLE_STATUSES: ReadonlySet<string> = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);

export type RefundError =
  | "not_found" | "not_refundable" | "pending" | "invalid_lines" | "amount" | "provider" | "provider_unavailable"
  /** The provider accepted the refund but the local apply failed; the row keeps the provider's id and is finished later. */
  | "deferred";

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

interface AppliedRefund { orderId: string; amountCents: number; full: boolean; status: string; armed: number; skippedVariants: number }

function timelineWith(order: Order, entries: Array<{ event: string; detail?: string }>): Prisma.InputJsonValue {
  const result = entries.reduce<Order>(
    (acc, entry) => ({ ...acc, timeline: timelinePush(acc, entry.event, entry.detail) as unknown as Prisma.JsonValue }),
    order,
  );
  return result.timeline as Prisma.InputJsonValue;
}

/**
 * Step 3, idempotent: applies one PENDING row whose money the provider has
 * accepted — totals, status, restock, timeline — under the order lock. A row
 * that is no longer PENDING is left alone, so a retry or a webhook that
 * arrived in between never counts the money twice. A component variant
 * deleted since the order was placed is skipped and noted in the timeline
 * instead of failing the whole apply.
 */
export async function applyRefundInTx(tx: Prisma.TransactionClient, refundId: string): Promise<AppliedRefund | null> {
  const pointer = await tx.refund.findUnique({ where: { id: refundId }, select: { orderId: true } });
  if (!pointer) return null;
  const current = await lockOrder(tx, pointer.orderId);
  if (!current) return null;
  const row = current.refunds.find((candidate) => candidate.id === refundId);
  if (!row || row.status !== "PENDING") return null;
  const lines = Array.isArray(row.lines) ? (row.lines as unknown as RefundLineInput[]) : [];
  const refundedCents = Math.min(current.totalCents, current.refundedCents + row.amountCents);
  const full = refundedCents >= current.totalCents;
  const status = full ? (row.finalStatus === "CANCELLED" ? "CANCELLED" : "REFUNDED") : current.status;
  await tx.refund.update({ where: { id: row.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  let armed = 0;
  let skippedVariants = 0;
  if (row.restock && current.stockDeducted) {
    for (const line of lines) {
      const item = current.items.find((candidate) => candidate.id === line.orderItemId);
      if (!item) continue;
      for (const target of restockTargets(item, line.quantity)) {
        const variant = await tx.variant.findUnique({ where: { id: target.variantId }, select: { id: true } });
        if (!variant) { skippedVariants += 1; continue; }
        armed += (await adjustVariantStockInTx(tx, target.variantId, target.delta)).armedAlerts;
      }
    }
  }
  const event = status === "CANCELLED" ? "cancelled" : full ? "refunded" : "partially_refunded";
  const entries = [{ event, detail: `cents:${row.amountCents}:${row.actorName}` }];
  if (skippedVariants > 0) entries.push({ event: "restock_skipped", detail: `variants:${skippedVariants}:${row.actorName}` });
  await tx.order.update({
    where: { id: current.id },
    data: {
      refundedCents, status,
      ...(full ? { refundRequired: false, confirmationEmailPending: false } : {}),
      timeline: timelineWith(current, entries),
    },
  });
  return { orderId: current.id, amountCents: row.amountCents, full, status, armed, skippedVariants };
}

async function afterApply(applied: AppliedRefund) {
  if (applied.armed > 0) {
    try { await sendPendingRestockAlerts(); } catch (error) { console.error("Restock alerts remain queued", error instanceof Error ? error.name : "unknown"); }
  }
  await notifyOrderStatus(applied.orderId, applied.status === "CANCELLED" ? "cancelled" : "refunded", { amountCents: applied.amountCents });
}

export interface RefundResolution { applied: number; interrupted: number; failed: number }

/**
 * Finishes operator refunds whose apply step never ran (a crash, a database
 * error or a failed restock after the provider accepted the money). A row
 * carrying the provider's refund id is applied; a row without one, past the
 * in-flight grace period, is closed as FAILED (`interrupted`) with a timeline
 * entry — this code never moved its money, and if the provider did, the
 * refund webhook books it once the row is no longer PENDING. Money is never
 * moved here. Called by the daily job and before every new refund or
 * cancellation of an order.
 */
export async function resolvePendingRefunds(orderId?: string, now = new Date()): Promise<RefundResolution> {
  const result: RefundResolution = { applied: 0, interrupted: 0, failed: 0 };
  const rows = await db.refund.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - IN_FLIGHT_GRACE_MS) }, ...(orderId ? { orderId } : {}) },
    select: { id: true, orderId: true, providerRefundId: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  for (const row of rows) {
    try {
      if (row.providerRefundId) {
        const applied = await db.$transaction((tx) => applyRefundInTx(tx, row.id), TX);
        if (applied) { await afterApply(applied); result.applied += 1; }
        continue;
      }
      const closed = await db.$transaction(async (tx) => {
        const current = await lockOrder(tx, row.orderId);
        const pending = current?.refunds.find((candidate) => candidate.id === row.id);
        if (!current || !pending || pending.status !== "PENDING") return false;
        await tx.refund.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "interrupted" } });
        await tx.order.update({
          where: { id: current.id },
          data: { timeline: timelinePush(current, "refund_interrupted", `cents:${pending.amountCents}:${pending.actorName}`) },
        });
        return true;
      }, TX);
      if (closed) result.interrupted += 1;
    } catch (error) {
      result.failed += 1;
      console.error("Pending refund left unresolved", error instanceof Error ? error.name : "unknown");
    }
  }
  return result;
}

export async function refundOrder(orderId: string, request: RefundRequest): Promise<RefundResult> {
  const reason = request.reason.trim().slice(0, 500);
  await resolvePendingRefunds(orderId);
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
        actorId: request.actorId, actorName: request.actorName, finalStatus: request.finalStatus ?? null,
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

  // 3. Store the provider's id, then apply locally (idempotent, see applyRefundInTx).
  //    From here on the money has moved: a failure leaves the row PENDING for
  //    resolvePendingRefunds instead of pretending the refund did not happen.
  let applied: AppliedRefund | null;
  try {
    await db.refund.update({ where: { id: refund.id }, data: { providerRefundId } });
    applied = await db.$transaction((tx) => applyRefundInTx(tx, refund.id), TX);
  } catch (error) {
    console.error("Refund accepted by the provider but not yet applied", order.number, error instanceof Error ? error.name : "unknown");
    return { ok: false, reason: "deferred" };
  }
  if (!applied) {
    const state = await db.order.findUnique({ where: { id: orderId }, select: { status: true, totalCents: true, refundedCents: true } });
    return { ok: true, refundId: refund.id, amountCents: plan.amountCents, full: !!state && state.refundedCents >= state.totalCents, status: state?.status ?? "unknown" };
  }
  await afterApply(applied);
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
  await resolvePendingRefunds(orderId);
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
