import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { CouponInput } from "./coupons";

/**
 * Defense-in-depth: % coupons must be 1–100 (the Phase 7 admin form will
 * validate this at input; until then the resolve boundary rejects out-of-range
 * values by treating the coupon as inactive).
 */
export function isValidPercentOff(percentOff: number | null): boolean {
  return (
    percentOff !== null && Number.isInteger(percentOff) && percentOff >= 1 && percentOff <= 100
  );
}

/** I/O boundary: coupon code → typed CouponInput for the pure engine. */
export async function resolveCouponInput(
  code: string,
  customerEmail: string,
  client: Pick<Prisma.TransactionClient, "coupon" | "couponRedemption"> = db,
): Promise<CouponInput | null> {
  const coupon = await client.coupon.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  if (!coupon) return null;

  const invalidPercent =
    coupon.type === "PERCENT" && !isValidPercentOff(coupon.percentOff);

  const eligibility = (coupon.eligibility ?? {}) as {
    productIds?: string[];
    collectionSlugs?: string[];
    emails?: string[];
  };
  const exclusions = (coupon.exclusions ?? {}) as { productIds?: string[] };

  const usedByCustomer = await client.couponRedemption.count({
    where: { couponId: coupon.id, email: customerEmail.toLowerCase() },
  });

  return {
    code: coupon.code,
    type: coupon.type === "BXGY" ? "PERCENT" : coupon.type, // BXGY reserved — no logic (P2)
    percentOff: coupon.percentOff,
    amountOffCents: coupon.amountOffCents,
    minSpendCents: coupon.minSpendCents,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    active: coupon.active && !invalidPercent,
    usageLimitTotal: coupon.usageLimitTotal,
    usageLimitPerCustomer: coupon.usageLimitPerCustomer,
    usedCount: coupon.usedCount,
    usedByCustomer,
    eligibleProductIds: eligibility.productIds ?? null,
    eligibleCollectionSlugs: eligibility.collectionSlugs ?? null,
    eligibleEmails: eligibility.emails
      ? eligibility.emails.map((e) => e.toLowerCase())
      : null,
    excludedProductIds: exclusions.productIds ?? [],
  };
}
