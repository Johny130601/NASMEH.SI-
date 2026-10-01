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

export interface DashboardData {
  range: DashboardRange;
  kpis: { revenueCents: number; orders: number; aovCents: number; itemsPerOrder: number; refundedCents: number };
  revenueSeries: SeriesPoint[];
  ordersSeries: SeriesPoint[];
  revenueByProduct: SeriesPoint[];
  ordersByStatus: Array<{ status: string; count: number }>;
  recentOrders: Array<{ number: string; email: string; status: string; totalCents: number; createdAt: Date }>;
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

export async function loadDashboard(range: DashboardRange, now = new Date()): Promise<DashboardData> {
  const [orders, statusGroups, recentOrders, thresholdSetting, pendingCount, pendingItems, expiringCoupons] = await Promise.all([
    db.order.findMany({
      where: { paidAt: { gte: range.from, lte: range.to }, status: { not: "CANCELLED" } },
      select: {
        paidAt: true, totalCents: true, refundedCents: true,
        items: { select: { title: true, quantity: true, unitPriceCents: true } },
      },
    }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.findMany({
      orderBy: { createdAt: "desc" }, take: 8,
      select: { number: true, email: true, status: true, totalCents: true, createdAt: true },
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

  const buckets = buildBuckets(range);
  const revenueByBucket = new Map(buckets.map((bucket) => [bucket.key, 0]));
  const ordersByBucket = new Map(buckets.map((bucket) => [bucket.key, 0]));
  const revenueByProduct = new Map<string, number>();
  let revenueCents = 0;
  let refundedCents = 0;
  let itemCount = 0;
  for (const order of orders) {
    const net = order.totalCents - order.refundedCents;
    revenueCents += net;
    refundedCents += order.refundedCents;
    const key = bucketStart(order.paidAt ?? range.from, range.bucket).getTime();
    if (revenueByBucket.has(key)) {
      revenueByBucket.set(key, (revenueByBucket.get(key) ?? 0) + net);
      ordersByBucket.set(key, (ordersByBucket.get(key) ?? 0) + 1);
    }
    for (const item of order.items) {
      itemCount += item.quantity;
      revenueByProduct.set(item.title, (revenueByProduct.get(item.title) ?? 0) + item.unitPriceCents * item.quantity);
    }
  }
  const ranked = [...revenueByProduct].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 8).map(([label, value]) => ({ label, value }));
  const rest = ranked.slice(8).reduce((sum, [, value]) => sum + value, 0);

  return {
    range,
    kpis: {
      revenueCents,
      orders: orders.length,
      aovCents: orders.length ? Math.round(revenueCents / orders.length) : 0,
      itemsPerOrder: orders.length ? Math.round((itemCount / orders.length) * 10) / 10 : 0,
      refundedCents,
    },
    revenueSeries: buckets.map((bucket) => ({ label: bucket.label, value: revenueByBucket.get(bucket.key) ?? 0 })),
    ordersSeries: buckets.map((bucket) => ({ label: bucket.label, value: ordersByBucket.get(bucket.key) ?? 0 })),
    revenueByProduct: rest > 0 ? [...top, { label: "__other__", value: rest }] : top,
    ordersByStatus: statusGroups.map((group) => ({ status: group.status, count: group._count._all })),
    recentOrders,
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
