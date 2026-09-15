import { vatBreakdown } from "@/lib/pricing";
import type { CartLineInput, PricedCart, PromoSettings } from "./types";
import { priceCart } from "./priceCart";

/**
 * Coupon engine (§9.1) — PURE (AGENTS §5.3/§8.4): typed data in, decision
 * out, `now` injected, zero I/O. Deterministic evaluation order:
 * line discounts → order discount → free shipping → threshold re-check.
 *
 * TERMS (hard rules): the discount base EXCLUDES bundle lines and
 * already-reduced lines (`reduced`: the history-backed reduction the
 * storefront displays, injected by the caller); shipping is excluded from %
 * calculations; one code per order (no stacking).
 */

export type CouponType = "PERCENT" | "FIXED" | "FIXED_PRODUCT" | "FREE_SHIPPING";

export interface CouponInput {
  code: string;
  type: CouponType;
  percentOff: number | null;
  amountOffCents: number | null;
  minSpendCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  usedByCustomer: number;
  /** null = applies to all products */
  eligibleProductIds: string[] | null;
  eligibleCollectionSlugs: string[] | null;
  eligibleEmails: string[] | null;
  excludedProductIds: string[];
}

export type CouponRejection =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "min_spend"
  | "usage_limit"
  | "customer_limit"
  | "not_eligible"
  | "already_applied";

export interface CouponContext {
  email: string;
  hasCodeAlready: boolean;
}

export interface CouponDecision {
  discountCents: number;
  freeShipping: boolean;
  discountedVariantIds: string[];
}

export type CouponEvaluation =
  | { ok: true; decision: CouponDecision }
  | { ok: false; rejection: CouponRejection };

interface LineProductInfo {
  productId: string;
  collectionSlugs: string[];
}

export type CouponLine = CartLineInput & { product: LineProductInfo };

/** Lines a discount may touch per the terms (no bundles, no sale items). */
function discountableLines(coupon: CouponInput, lines: CouponLine[]): CouponLine[] {
  return lines.filter((line) => {
    if (line.isBundle) return false; // terms: bundles excluded
    // terms: already-reduced excluded — the same Omnibus gate the storefront
    // shows, not a compare-at without a history-backed reduction
    if (line.reduced) return false;
    if (coupon.excludedProductIds.includes(line.product.productId)) return false;
    if (
      coupon.eligibleProductIds !== null &&
      !coupon.eligibleProductIds.includes(line.product.productId)
    )
      return false;
    if (
      coupon.eligibleCollectionSlugs !== null &&
      !line.product.collectionSlugs.some((slug) =>
        coupon.eligibleCollectionSlugs!.includes(slug),
      )
    )
      return false;
    return true;
  });
}

function lineTotal(line: CouponLine): number {
  return line.priceCents * line.quantity;
}

export function evaluateCoupon(
  coupon: CouponInput | null,
  lines: CouponLine[],
  ctx: CouponContext,
  now: Date,
): CouponEvaluation {
  if (!coupon) return { ok: false, rejection: "not_found" };
  if (ctx.hasCodeAlready) return { ok: false, rejection: "already_applied" };
  if (!coupon.active) return { ok: false, rejection: "inactive" };
  if (coupon.startsAt && now < coupon.startsAt)
    return { ok: false, rejection: "not_started" };
  if (coupon.endsAt && now > coupon.endsAt)
    return { ok: false, rejection: "expired" };
  if (
    coupon.usageLimitTotal !== null &&
    coupon.usedCount >= coupon.usageLimitTotal
  )
    return { ok: false, rejection: "usage_limit" };
  if (
    coupon.usageLimitPerCustomer !== null &&
    coupon.usedByCustomer >= coupon.usageLimitPerCustomer
  )
    return { ok: false, rejection: "customer_limit" };
  if (
    coupon.eligibleEmails !== null &&
    !coupon.eligibleEmails.includes(ctx.email.toLowerCase())
  )
    return { ok: false, rejection: "not_eligible" };

  const subtotalCents = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  if (coupon.minSpendCents !== null && subtotalCents < coupon.minSpendCents)
    return { ok: false, rejection: "min_spend" };

  const base = discountableLines(coupon, lines);
  const baseCents = base.reduce((sum, line) => sum + lineTotal(line), 0);

  switch (coupon.type) {
    case "FREE_SHIPPING":
      if (lines.length === 0) return { ok: false, rejection: "not_eligible" };
      return {
        ok: true,
        decision: { discountCents: 0, freeShipping: true, discountedVariantIds: [] },
      };

    case "PERCENT": {
      const percent = coupon.percentOff ?? 0;
      if (percent <= 0 || base.length === 0)
        return { ok: false, rejection: "not_eligible" };
      const discountCents = Math.round((baseCents * percent) / 100);
      if (discountCents <= 0) return { ok: false, rejection: "not_eligible" };
      return {
        ok: true,
        decision: {
          discountCents,
          freeShipping: false,
          discountedVariantIds: base.map((line) => line.variantId),
        },
      };
    }

    case "FIXED": {
      const amount = coupon.amountOffCents ?? 0;
      if (amount <= 0 || base.length === 0)
        return { ok: false, rejection: "not_eligible" };
      return {
        ok: true,
        decision: {
          discountCents: Math.min(amount, baseCents),
          freeShipping: false,
          discountedVariantIds: base.map((line) => line.variantId),
        },
      };
    }

    case "FIXED_PRODUCT": {
      const amount = coupon.amountOffCents ?? 0;
      if (amount <= 0 || base.length === 0)
        return { ok: false, rejection: "not_eligible" };
      // fixed amount off ONE eligible line (the first, deterministically)
      const target = base[0];
      return {
        ok: true,
        decision: {
          discountCents: Math.min(amount, lineTotal(target)),
          freeShipping: false,
          discountedVariantIds: [target.variantId],
        },
      };
    }
  }
}

export interface AppliedCoupon {
  code: string;
  type: CouponType;
  percentOff: number | null;
  amountOffCents: number | null;
  discountCents: number;
}

export interface CouponPricedCart extends PricedCart {
  discountCents: number;
  appliedCoupon: AppliedCoupon | null;
}

/**
 * Full pipeline: priceCart → coupon decision → deterministic order
 * (line discounts → order discount → free shipping → threshold re-check).
 */
export function priceCartWithCoupon(
  lines: CouponLine[],
  settings: PromoSettings,
  coupon: CouponInput | null,
  ctx: CouponContext,
  now: Date,
): CouponPricedCart | { ok: false; rejection: CouponRejection } {
  const evaluation = evaluateCoupon(coupon, lines, ctx, now);
  if (!evaluation.ok) return evaluation;

  const priced = priceCart(lines, settings, now);
  const { decision } = evaluation;

  const discountCents = Math.min(decision.discountCents, priced.subtotalCents);
  const discountedSubtotal = priced.subtotalCents - discountCents;

  // threshold re-check: a discount can push the cart BELOW free shipping
  const thresholdReached =
    discountedSubtotal > 0 && discountedSubtotal >= settings.freeShippingThresholdCents;
  const freeShipping = decision.freeShipping || thresholdReached;
  const shippingCents =
    discountedSubtotal === 0 || freeShipping ? 0 : settings.shippingCostCents;

  // subtotalCents stays PRE-discount (display); total = subtotal − discount + shipping
  const totalCents = discountedSubtotal + shippingCents;
  const { taxCents } = vatBreakdown(totalCents, settings.vatRatePercent);

  return {
    ...priced,
    shippingCents,
    totalCents,
    vatCents: taxCents,
    discountCents,
    appliedCoupon:
      discountCents > 0 || decision.freeShipping
        ? {
            code: coupon!.code,
            type: coupon!.type,
            percentOff: coupon!.percentOff,
            amountOffCents: coupon!.amountOffCents,
            discountCents,
          }
        : null,
    freeShipping: {
      reached: freeShipping,
      remainingCents: freeShipping
        ? 0
        : settings.freeShippingThresholdCents - discountedSubtotal,
      progressPercent: freeShipping
        ? 100
        : Math.max(
            5,
            Math.min(
              100,
              Math.round(
                (discountedSubtotal / settings.freeShippingThresholdCents) * 100,
              ),
            ),
        ),
    },
  };
}
