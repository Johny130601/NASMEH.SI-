import { Prisma, type Coupon } from "@prisma/client";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/seo";
import { dateToZonedDateTime, type CouponInput, type CouponValues } from "./coupons-schema";
import { likeEscaped } from "./like";

/** Coupon administration (§14.4): JSON mapping and queries; the form schema lives in coupons-schema.ts. */

export { COUPON_TYPES, STORE_TIME_ZONE, couponSchema, dateToZonedDateTime, zonedDateTimeToDate, type CouponFormType, type CouponInput, type CouponValues } from "./coupons-schema";

/** Prisma data for a validated form: only the value field of the type is kept; empty lists mean "all". */
export function toCouponData(values: CouponValues) {
  const eligibility: Record<string, string[]> = {};
  if (values.eligibleProductIds.length) eligibility.productIds = [...new Set(values.eligibleProductIds)];
  if (values.eligibleCollectionSlugs.length) eligibility.collectionSlugs = [...new Set(values.eligibleCollectionSlugs)];
  if (values.eligibleEmails.length) eligibility.emails = [...new Set(values.eligibleEmails)];
  const exclusions = values.excludedProductIds.length ? { productIds: [...new Set(values.excludedProductIds)] } : null;
  return {
    code: values.code,
    type: values.type,
    percentOff: values.type === "PERCENT" ? values.percentOff : null,
    amountOffCents: values.type === "FIXED" || values.type === "FIXED_PRODUCT" ? values.amountOffCents : null,
    usageLimitTotal: values.usageLimitTotal,
    usageLimitPerCustomer: values.usageLimitPerCustomer,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    minSpendCents: values.minSpendCents,
    eligibility: Object.keys(eligibility).length ? (eligibility as Prisma.InputJsonObject) : Prisma.DbNull,
    exclusions: exclusions ? (exclusions as Prisma.InputJsonObject) : Prisma.DbNull,
    stackable: false,
    active: values.active,
  };
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

/** Editor values from a stored row; a BXGY row (model only) is shown as PERCENT and cannot be saved as BXGY. */
export function couponToInput(coupon: Coupon): CouponInput {
  const eligibility = (coupon.eligibility ?? {}) as Record<string, unknown>;
  const exclusions = (coupon.exclusions ?? {}) as Record<string, unknown>;
  return {
    code: coupon.code,
    type: coupon.type === "BXGY" ? "PERCENT" : coupon.type,
    percentOff: coupon.percentOff,
    amountOffCents: coupon.amountOffCents,
    usageLimitTotal: coupon.usageLimitTotal,
    usageLimitPerCustomer: coupon.usageLimitPerCustomer,
    startsAt: dateToZonedDateTime(coupon.startsAt),
    endsAt: dateToZonedDateTime(coupon.endsAt),
    minSpendCents: coupon.minSpendCents,
    eligibleProductIds: strings(eligibility.productIds),
    eligibleCollectionSlugs: strings(eligibility.collectionSlugs),
    eligibleEmails: strings(eligibility.emails),
    excludedProductIds: strings(exclusions.productIds),
    active: coupon.active,
  };
}

/** Absolute auto-apply link (§7.2). */
export function couponLink(code: string): string {
  return `${siteUrl()}/koda/${encodeURIComponent(code)}`;
}

export interface CouponFilters { q: string; active: boolean | null }

export function parseCouponFilters(query: Record<string, string | string[] | undefined>): CouponFilters {
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value ?? "").trim();
  const state = single(query.stanje);
  return { q: single(query.q).toUpperCase().slice(0, 40), active: state === "aktivni" ? true : state === "neaktivni" ? false : null };
}

export const COUPON_LIST_LIMIT = 500;

export async function listCoupons(filters: CouponFilters) {
  return db.coupon.findMany({
    take: COUPON_LIST_LIMIT,
    where: {
      ...(filters.active === null ? {} : { active: filters.active }),
      ...(filters.q ? { code: { contains: likeEscaped(filters.q) } } : {}),
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { couponRedemptions: true } } },
  });
}

export async function couponOptions() {
  const [products, collections] = await Promise.all([
    db.product.findMany({ select: { id: true, title: true, status: true }, orderBy: { title: "asc" } }),
    db.collection.findMany({ select: { slug: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  return { products, collections };
}

export async function loadCoupon(id: string) {
  const coupon = await db.coupon.findUnique({
    where: { id },
    include: {
      couponRedemptions: { orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { number: true, totalCents: true, status: true } } } },
      _count: { select: { couponRedemptions: true } },
    },
  });
  if (!coupon) return null;
  return { ...coupon, ...(await couponOptions()) };
}

/** Whether a coupon still has no history and may be deleted instead of deactivated. */
export function couponIsUnused(coupon: { usedCount: number; _count: { couponRedemptions: number } }): boolean {
  return coupon.usedCount === 0 && coupon._count.couponRedemptions === 0;
}

/** Summary of the value column in the list. */
export function couponValueLabel(coupon: Pick<Coupon, "type" | "percentOff" | "amountOffCents">, formatEUR: (cents: number) => string): string {
  switch (coupon.type) {
    case "PERCENT": return `${coupon.percentOff ?? 0} %`;
    case "FIXED":
    case "FIXED_PRODUCT": return formatEUR(coupon.amountOffCents ?? 0);
    default: return "—";
  }
}
