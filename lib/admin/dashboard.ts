import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

/** Dashboard home (§14.1): KPIs, series and lists computed server-side from paid orders. */

export type RangePreset = "7d" | "30d" | "90d" | "custom";

export interface DashboardRange {
  preset: RangePreset;
  from: Date;
  to: Date;
  days: number;
  /** Daily buckets up to 31 days, weekly beyond. */
  bucket: "day" | "week";
  /** Why a requested custom range was not used (the page says so instead of silently showing 30 days, QA N1). */
  invalid?: "reversed" | "too_long" | "malformed";
}

export interface SeriesPoint { label: string; value: number }

/**
 * The KPI definitions (QA 2026-10-03 T4-02). Every money figure and count is
 * over one cohort: the orders PAID in the range (by `paidAt`), whatever
 * happened to them since. A paid order cancelled later (its money went back),
 * one refunded in full or in part, and a captured payment the store could not
 * fulfil all stay in; an order never paid is never in.
 *
 * - `orders` (Plačana naročila): how many orders were paid in the range.
 * - `grossCents` (Plačano, in the revenue tile's hint): their totals as paid,
 *   VAT and shipping included.
 * - `refundedCents` (Vrnjeno): what has gone back on those orders since —
 *   `Order.refundedCents`, so operator refunds, cancellations of paid orders,
 *   settled stock-outs and refunds made in the provider's dashboard (which
 *   have no Refund row) alike. A refund counts in the period its order was
 *   paid in, not on the day it was made.
 * - `revenueCents` (Prihodki): net, gross − refunded. The revenue series is
 *   the same net per order by the day (week) of payment, so its bars add up
 *   to the tile; the orders series counts the same orders.
 * - `aovCents` and `itemsPerOrder`: per order as paid (gross), before refunds.
 *   A captured payment still awaiting its refund counts in full until the
 *   refund completes: it is money received and not yet returned.
 */
export interface DashboardKpis {
  revenueCents: number;
  grossCents: number;
  refundedCents: number;
  orders: number;
  aovCents: number;
  itemsPerOrder: number;
}

export interface DashboardData {
  range: DashboardRange;
  kpis: DashboardKpis;
  revenueSeries: SeriesPoint[];
  ordersSeries: SeriesPoint[];
  revenueByProduct: SeriesPoint[];
  ordersByStatus: Array<{ status: string; count: number }>;
  /** `anonymized`: the e-mail is an erasure placeholder, shown as a neutral label (QA 2026-10-03 T4-07). */
  recentOrders: Array<{ number: string; email: string; anonymized: boolean; status: string; totalCents: number; createdAt: Date }>;
  lowStock: { threshold: number; variants: Array<{ sku: string; title: string; productTitle: string; stock: number; allowBackorder: boolean }> };
  pendingReviews: { count: number; items: Array<{ id: string; rating: number; productTitle: string; createdAt: Date }> };
  expiringCoupons: Array<{ code: string; endsAt: Date; usedCount: number; usageLimitTotal: number | null }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const MAX_RANGE_DAYS = 366;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function parseDashboardRange(
  query: { obdobje?: string | string[]; od?: string | string[]; do?: string | string[] },
  now = new Date(),
): DashboardRange {
  const preset = typeof query.obdobje === "string" ? query.obdobje : "30d";
  let invalid: DashboardRange["invalid"];
  if (preset === "custom") {
    const from = parseIsoDate(query.od);
    const to = parseIsoDate(query.do);
    if (!from || !to) invalid = "malformed";
    else if (from > to) invalid = "reversed";
    else {
      const days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS) + 1;
      if (days <= MAX_RANGE_DAYS) {
        return { preset: "custom", from: startOfDay(from), to: endOfDay(to), days, bucket: days <= 31 ? "day" : "week" };
      }
      invalid = "too_long";
    }
  }
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const to = endOfDay(now);
  const from = startOfDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  return {
    preset: preset === "7d" || preset === "90d" ? preset : "30d", from, to, days, bucket: days <= 31 ? "day" : "week",
    ...(invalid ? { invalid } : {}),
  };
}

function bucketStart(date: Date, bucket: "day" | "week"): Date {
  const start = startOfDay(date);
  if (bucket === "week") {
    const weekday = (start.getDay() + 6) % 7; // Monday = 0
    start.setDate(start.getDate() - weekday);
  }
  return start;
}

function shortDate(date: Date): string {
  return `${date.getDate()}. ${date.getMonth() + 1}.`;
}

/** Every bucket in the range, even empty ones, so the chart has no gaps. */
export function buildBuckets(range: DashboardRange): Array<{ key: number; label: string }> {
  const buckets: Array<{ key: number; label: string }> = [];
  let cursor = bucketStart(range.from, range.bucket);
  while (cursor <= range.to) {
    buckets.push({ key: cursor.getTime(), label: shortDate(cursor) });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + (range.bucket === "week" ? 7 : 1));
  }
  return buckets;
}

/** One paid order as the KPIs read it; `refunds` are its COMPLETED refunds, whose `lines` name the units that went back. */
export interface PaidOrderFacts {
  paidAt: Date | null;
  totalCents: number;
  refundedCents: number;
  items: Array<{ id: string; title: string; quantity: number; unitPriceCents: number }>;
  refunds: Array<{ lines: unknown }>;
}

/**
 * Units that went back per order line: every unit of an order refunded in
 * full (a cancellation, a settled stock-out, a provider-side full refund that
 * left no Refund row), otherwise the lines of its completed refunds. A
 * money-only refund (an adjustment, shipping) names no unit.
 */
function refundedUnits(order: PaidOrderFacts): Map<string, number> {
  const units = new Map<string, number>();
  if (order.totalCents > 0 && order.refundedCents >= order.totalCents) {
    for (const item of order.items) units.set(item.id, item.quantity);
    return units;
  }
  for (const refund of order.refunds) {
    if (!Array.isArray(refund.lines)) continue;
    for (const line of refund.lines as Array<{ orderItemId?: unknown; quantity?: unknown }>) {
      if (typeof line.orderItemId !== "string" || typeof line.quantity !== "number" || !(line.quantity > 0)) continue;
      units.set(line.orderItemId, (units.get(line.orderItemId) ?? 0) + line.quantity);
    }
  }
  return units;
}

/**
 * The KPIs, both series and the product chart from the orders paid in the
 * range (definitions at `DashboardKpis`). Pure, so the arithmetic is tested
 * without a database.
 *
 * The product chart is the line value (unit price × quantity, VAT included)
 * of the units kept: units refunded are taken out, so a cancelled or fully
 * refunded order adds nothing. Shipping, order-level coupon discounts and
 * money-only refund adjustments are not split by product, so its bars do not
 * add up to the revenue tile; products whose every unit went back are left out.
 */
export function summarisePaidOrders(orders: PaidOrderFacts[], range: DashboardRange): Pick<DashboardData, "kpis" | "revenueSeries" | "ordersSeries" | "revenueByProduct"> {
  const buckets = buildBuckets(range);
  const revenueByBucket = new Map(buckets.map((bucket) => [bucket.key, 0]));
  const ordersByBucket = new Map(buckets.map((bucket) => [bucket.key, 0]));
  const revenueByProduct = new Map<string, number>();
  let grossCents = 0;
  let refundedCents = 0;
  let itemCount = 0;
  for (const order of orders) {
    // Never more than was paid: the column is capped on write, the dashboard does not rely on it.
    const refunded = Math.min(order.totalCents, Math.max(0, order.refundedCents));
    const net = order.totalCents - refunded;
    grossCents += order.totalCents;
    refundedCents += refunded;
    const key = bucketStart(order.paidAt ?? range.from, range.bucket).getTime();
    if (revenueByBucket.has(key)) {
      revenueByBucket.set(key, (revenueByBucket.get(key) ?? 0) + net);
      ordersByBucket.set(key, (ordersByBucket.get(key) ?? 0) + 1);
    }
    const returned = refundedUnits(order);
    for (const item of order.items) {
      itemCount += item.quantity;
      const kept = item.quantity - Math.min(item.quantity, returned.get(item.id) ?? 0);
      if (kept > 0) revenueByProduct.set(item.title, (revenueByProduct.get(item.title) ?? 0) + item.unitPriceCents * kept);
    }
  }
  const ranked = [...revenueByProduct].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 8).map(([label, value]) => ({ label, value }));
  const rest = ranked.slice(8).reduce((sum, [, value]) => sum + value, 0);
  const count = orders.length;
  return {
    kpis: {
      revenueCents: grossCents - refundedCents,
      grossCents,
      refundedCents,
      orders: count,
      aovCents: count ? Math.round(grossCents / count) : 0,
      itemsPerOrder: count ? Math.round((itemCount / count) * 10) / 10 : 0,
    },
    revenueSeries: buckets.map((bucket) => ({ label: bucket.label, value: revenueByBucket.get(bucket.key) ?? 0 })),
    ordersSeries: buckets.map((bucket) => ({ label: bucket.label, value: ordersByBucket.get(bucket.key) ?? 0 })),
    revenueByProduct: rest > 0 ? [...top, { label: "__other__", value: rest }] : top,
  };
}

export async function loadDashboard(range: DashboardRange, now = new Date()): Promise<DashboardData> {
  const [orders, statusGroups, recentOrders, thresholdSetting, pendingCount, pendingItems, expiringCoupons] = await Promise.all([
    // Every order paid in the range, whatever its status now (T4-02: a cancelled paid order is still a paid order whose money went back).
    db.order.findMany({
      where: { paidAt: { gte: range.from, lte: range.to } },
      select: {
        paidAt: true, totalCents: true, refundedCents: true,
        items: { select: { id: true, title: true, quantity: true, unitPriceCents: true } },
        refunds: { where: { status: "COMPLETED" }, select: { lines: true } },
      },
    }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.findMany({
      orderBy: { createdAt: "desc" }, take: 8,
      select: { number: true, email: true, anonymizedAt: true, status: true, totalCents: true, createdAt: true },
    }),
    getSetting<unknown>("inventory.lowStockThreshold"),
    db.review.count({ where: { status: "PENDING" } }),
    db.review.findMany({
      where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 5,
      select: { id: true, rating: true, createdAt: true, product: { select: { title: true } } },
    }),
    db.coupon.findMany({
      where: { active: true, endsAt: { gte: now, lte: new Date(now.getTime() + 14 * DAY_MS) } },
      orderBy: { endsAt: "asc" }, take: 10,
      select: { code: true, endsAt: true, usedCount: true, usageLimitTotal: true },
    }),
  ]);

  const threshold = typeof thresholdSetting === "number" && Number.isInteger(thresholdSetting) && thresholdSetting >= 0
    ? thresholdSetting : DEFAULT_LOW_STOCK_THRESHOLD;
  const lowStockVariants = await db.variant.findMany({
    where: { stock: { lte: threshold }, product: { status: "ACTIVE" } },
    orderBy: [{ stock: "asc" }, { sku: "asc" }], take: 10,
    select: { sku: true, title: true, stock: true, allowBackorder: true, product: { select: { title: true } } },
  });

  return {
    range,
    ...summarisePaidOrders(orders, range),
    ordersByStatus: statusGroups.map((group) => ({ status: group.status, count: group._count._all })),
    recentOrders: recentOrders.map(({ anonymizedAt, ...order }) => ({ ...order, anonymized: anonymizedAt !== null })),
    lowStock: {
      threshold,
      variants: lowStockVariants.map((variant) => ({
        sku: variant.sku, title: variant.title, productTitle: variant.product.title, stock: variant.stock, allowBackorder: variant.allowBackorder,
      })),
    },
    pendingReviews: {
      count: pendingCount,
      items: pendingItems.map((review) => ({
        id: review.id, rating: review.rating, productTitle: review.product.title, createdAt: review.createdAt,
      })),
    },
    expiringCoupons: expiringCoupons.map((coupon) => ({ ...coupon, endsAt: coupon.endsAt ?? now })),
  };
}
