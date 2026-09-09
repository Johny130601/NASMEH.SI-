import { describe, expect, it } from "vitest";
import {
  evaluateCoupon,
  priceCartWithCoupon,
  type CouponInput,
  type CouponLine,
} from "@/lib/promo";
import type { PromoSettings } from "@/lib/promo";

const NOW = new Date("2026-09-09T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const SETTINGS: PromoSettings = {
  vatRatePercent: 22,
  freeShippingThresholdCents: 4500,
  shippingCostCents: 390,
};
const CTX = { email: "kupec@test.si", hasCodeAlready: false };

function line(overrides: Partial<CouponLine> = {}): CouponLine {
  return {
    variantId: "v1",
    sku: "S1",
    title: "Izdelek",
    quantity: 1,
    priceCents: 3499,
    compareAtPriceCents: null,
    vatRatePercent: 22,
    maxCartQuantity: 5,
    isBundle: false,
    product: { productId: "p1", collectionSlugs: ["beljenje"] },
    ...overrides,
  };
}

function coupon(overrides: Partial<CouponInput> = {}): CouponInput {
  return {
    code: "TEST10",
    type: "PERCENT",
    percentOff: 10,
    amountOffCents: null,
    minSpendCents: null,
    startsAt: null,
    endsAt: null,
    active: true,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    usedCount: 0,
    usedByCustomer: 0,
    eligibleProductIds: null,
    eligibleCollectionSlugs: null,
    eligibleEmails: null,
    excludedProductIds: [],
    ...overrides,
  };
}

describe("PERCENT coupons", () => {
  it("10 % on 10000 → 1000 discount", () => {
    const result = evaluateCoupon(
      coupon(),
      [line({ priceCents: 10000 })],
      CTX,
      NOW,
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.decision.discountCents).toBe(1000);
  });

  it("bundle lines are EXCLUDED from the discount base (terms)", () => {
    const result = evaluateCoupon(
      coupon(),
      [
        line({ priceCents: 10000 }),
        line({ variantId: "vB", isBundle: true, priceCents: 4999 }),
      ],
      CTX,
      NOW,
    );
    if (result.ok) {
      expect(result.decision.discountCents).toBe(1000); // 10 % of 10000 only
      expect(result.decision.discountedVariantIds).toEqual(["v1"]);
    } else throw new Error("expected ok");
  });

  it("already-discounted (compareAt) lines are EXCLUDED (terms)", () => {
    const result = evaluateCoupon(
      coupon(),
      [
        line({ priceCents: 10000 }),
        line({ variantId: "v2", priceCents: 1999, compareAtPriceCents: 2499 }),
      ],
      CTX,
      NOW,
    );
    if (result.ok) expect(result.decision.discountCents).toBe(1000);
    else throw new Error("expected ok");
  });

  it("0 % discount on empty base → not_eligible", () => {
    const result = evaluateCoupon(
      coupon(),
      [line({ isBundle: true })],
      CTX,
      NOW,
    );
    expect(result).toEqual({ ok: false, rejection: "not_eligible" });
  });
});

describe("FIXED (cart) coupons", () => {
  it("500 off 3499 → 500", () => {
    const result = evaluateCoupon(
      coupon({ type: "FIXED", percentOff: null, amountOffCents: 500 }),
      [line()],
      CTX,
      NOW,
    );
    if (result.ok) expect(result.decision.discountCents).toBe(500);
    else throw new Error("expected ok");
  });

  it("capped at the discount base (500 off 300 → 300)", () => {
    const result = evaluateCoupon(
      coupon({ type: "FIXED", percentOff: null, amountOffCents: 500 }),
      [line({ priceCents: 300 })],
      CTX,
      NOW,
    );
    if (result.ok) expect(result.decision.discountCents).toBe(300);
    else throw new Error("expected ok");
  });
});

describe("FIXED_PRODUCT coupons", () => {
  it("500 off ONE eligible line only", () => {
    const result = evaluateCoupon(
      coupon({
        type: "FIXED_PRODUCT",
        percentOff: null,
        amountOffCents: 500,
        eligibleProductIds: ["p2"],
      }),
      [
        line(),
        line({ variantId: "v2", priceCents: 1999, product: { productId: "p2", collectionSlugs: [] } }),
      ],
      CTX,
      NOW,
    );
    if (result.ok) {
      expect(result.decision.discountCents).toBe(500);
      expect(result.decision.discountedVariantIds).toEqual(["v2"]);
    } else throw new Error("expected ok");
  });

  it("no eligible line present → not_eligible", () => {
    const result = evaluateCoupon(
      coupon({
        type: "FIXED_PRODUCT",
        percentOff: null,
        amountOffCents: 500,
        eligibleProductIds: ["pX"],
      }),
      [line()],
      CTX,
      NOW,
    );
    expect(result).toEqual({ ok: false, rejection: "not_eligible" });
  });
});

describe("FREE_SHIPPING coupons", () => {
  it("flips shipping to 0 under threshold", () => {
    const result = priceCartWithCoupon(
      [line({ priceCents: 1999 })],
      SETTINGS,
      coupon({ type: "FREE_SHIPPING", percentOff: null }),
      CTX,
      NOW,
    );
    if ("appliedCoupon" in result) {
      expect(result.shippingCents).toBe(0);
      expect(result.freeShipping.reached).toBe(true);
    } else throw new Error("expected priced cart");
  });
});

describe("gates", () => {
  it("min_spend rejection (below minimum)", () => {
    expect(
      evaluateCoupon(
        coupon({ minSpendCents: 4500 }),
        [line({ priceCents: 1999 })],
        CTX,
        NOW,
      ),
    ).toEqual({ ok: false, rejection: "min_spend" });
  });

  it("min_spend met at exact boundary", () => {
    const result = evaluateCoupon(
      coupon({ minSpendCents: 4500 }),
      [line({ priceCents: 4500 })],
      CTX,
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("product eligibility scopes the discount", () => {
    const result = evaluateCoupon(
      coupon({ eligibleProductIds: ["p1"] }),
      [line(), line({ variantId: "v2", priceCents: 5000, product: { productId: "p2", collectionSlugs: [] } })],
      CTX,
      NOW,
    );
    if (result.ok) expect(result.decision.discountCents).toBe(350); // 10 % of 3499
    else throw new Error("expected ok");
  });

  it("collection eligibility scopes the discount", () => {
    const result = evaluateCoupon(
      coupon({ eligibleCollectionSlugs: ["paketi"] }),
      [
        line(),
        line({ variantId: "v2", priceCents: 5000, product: { productId: "p2", collectionSlugs: ["paketi"] } }),
      ],
      CTX,
      NOW,
    );
    if (result.ok) expect(result.decision.discountCents).toBe(500);
    else throw new Error("expected ok");
  });

  it("email eligibility → not_eligible for other customers", () => {
    expect(
      evaluateCoupon(
        coupon({ eligibleEmails: ["drug@test.si"] }),
        [line()],
        CTX,
        NOW,
      ),
    ).toEqual({ ok: false, rejection: "not_eligible" });
  });

  it("excluded product is skipped", () => {
    const result = evaluateCoupon(
      coupon({ excludedProductIds: ["p1"] }),
      [line()],
      CTX,
      NOW,
    );
    expect(result).toEqual({ ok: false, rejection: "not_eligible" });
  });

  it("date windows: not_started / expired / inside", () => {
    expect(
      evaluateCoupon(coupon({ startsAt: new Date(NOW.getTime() + DAY) }), [line()], CTX, NOW),
    ).toEqual({ ok: false, rejection: "not_started" });
    expect(
      evaluateCoupon(coupon({ endsAt: new Date(NOW.getTime() - DAY) }), [line()], CTX, NOW),
    ).toEqual({ ok: false, rejection: "expired" });
    const inside = evaluateCoupon(
      coupon({
        startsAt: new Date(NOW.getTime() - DAY),
        endsAt: new Date(NOW.getTime() + DAY),
      }),
      [line()],
      CTX,
      NOW,
    );
    expect(inside.ok).toBe(true);
  });

  it("inactive coupon → inactive", () => {
    expect(evaluateCoupon(coupon({ active: false }), [line()], CTX, NOW)).toEqual({
      ok: false,
      rejection: "inactive",
    });
  });

  it("total usage limit exhausted → usage_limit", () => {
    expect(
      evaluateCoupon(
        coupon({ usageLimitTotal: 100, usedCount: 100 }),
        [line()],
        CTX,
        NOW,
      ),
    ).toEqual({ ok: false, rejection: "usage_limit" });
  });

  it("per-customer limit exhausted → customer_limit", () => {
    expect(
      evaluateCoupon(
        coupon({ usageLimitPerCustomer: 1, usedByCustomer: 1 }),
        [line()],
        CTX,
        NOW,
      ),
    ).toEqual({ ok: false, rejection: "customer_limit" });
  });

  it("second code (stacking) → already_applied", () => {
    expect(
      evaluateCoupon(coupon(), [line()], { ...CTX, hasCodeAlready: true }, NOW),
    ).toEqual({ ok: false, rejection: "already_applied" });
  });

  it("missing coupon → not_found", () => {
    expect(evaluateCoupon(null, [line()], CTX, NOW)).toEqual({
      ok: false,
      rejection: "not_found",
    });
  });
});

describe("priceCartWithCoupon pipeline", () => {
  it("discount dropping subtotal below threshold RE-CHARGES shipping (re-check)", () => {
    // 4999 − 10 % (500) = 4499 < 4500 → shipping 390 back on
    const result = priceCartWithCoupon(
      [line({ priceCents: 4999 })],
      SETTINGS,
      coupon(),
      CTX,
      NOW,
    );
    if ("appliedCoupon" in result) {
      expect(result.discountCents).toBe(500);
      expect(result.subtotalCents).toBe(4999); // pre-discount (display)
      expect(result.shippingCents).toBe(390);
      expect(result.totalCents).toBe(4999 - 500 + 390);
      expect(result.freeShipping.reached).toBe(false);
    } else throw new Error("expected priced cart");
  });

  it("free-shipping code WINS over threshold loss", () => {
    const result = priceCartWithCoupon(
      [line({ priceCents: 4999 })],
      SETTINGS,
      coupon({ type: "FREE_SHIPPING", percentOff: null }),
      CTX,
      NOW,
    );
    if ("appliedCoupon" in result) {
      expect(result.shippingCents).toBe(0);
      expect(result.totalCents).toBe(4999);
    } else throw new Error("expected priced cart");
  });

  it("totals always recompute: total = subtotal − discount + shipping, VAT on total", () => {
    // 3499 − 350 = 3149 + 390 = 3539 → VAT 22 %: net 2901, tax 638
    const result = priceCartWithCoupon(
      [line()],
      SETTINGS,
      coupon(),
      CTX,
      NOW,
    );
    if ("appliedCoupon" in result) {
      expect(result.discountCents).toBe(350);
      expect(result.totalCents).toBe(3499 - 350 + 390);
      expect(result.vatCents).toBe(638);
      expect(result.appliedCoupon).toMatchObject({
        code: "TEST10",
        type: "PERCENT",
        percentOff: 10,
        discountCents: 350,
      });
    } else throw new Error("expected priced cart");
  });
});
