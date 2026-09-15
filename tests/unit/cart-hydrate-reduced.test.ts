import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ variantFindMany: vi.fn(), historyFindMany: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    variant: { findMany: mocks.variantFindMany },
    priceHistory: { findMany: mocks.historyFindMany },
  },
}));

import { hydrateCartLines } from "@/lib/cart/hydrate";
import { evaluateCoupon, type CouponInput } from "@/lib/promo";

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

function variant(id: string, priceCents: number, compareAtPriceCents: number | null) {
  return {
    id,
    sku: id.toUpperCase(),
    title: id,
    priceCents,
    compareAtPriceCents,
    maxCartQuantity: 5,
    product: {
      id: `p-${id}`,
      slug: id,
      title: `Izdelek ${id}`,
      status: "ACTIVE",
      hiddenDeal: false,
      customFields: null,
      media: [],
      bundle: null,
      collections: [],
    },
  };
}

const TEST10: CouponInput = {
  code: "TEST10", type: "PERCENT", percentOff: 10, amountOffCents: null, minSpendCents: null, startsAt: null, endsAt: null,
  active: true, usageLimitTotal: null, usageLimitPerCustomer: null, usedCount: 0, usedByCustomer: 0,
  eligibleProductIds: null, eligibleCollectionSlugs: null, eligibleEmails: null, excludedProductIds: [],
};

describe("hydrateCartLines sets the coupon `reduced` flag from the Omnibus gate (S2)", () => {
  beforeEach(() => {
    mocks.variantFindMany.mockReset();
    mocks.historyFindMany.mockReset();
  });

  it("flags only the history-backed reduction; a bare compare-at stays couponable", async () => {
    mocks.variantFindMany.mockResolvedValue([
      variant("serum", 1999, 2499),
      variant("fresh", 1499, 2999),
      variant("plain", 3499, null),
    ]);
    mocks.historyFindMany.mockResolvedValue([
      { variantId: "serum", priceCents: 2499, compareAtPriceCents: null, createdAt: daysAgo(60) },
      { variantId: "serum", priceCents: 1999, compareAtPriceCents: 2499, createdAt: daysAgo(10) },
      // created with a compare-at: the shop shows a plain price
      { variantId: "fresh", priceCents: 1499, compareAtPriceCents: 2999, createdAt: daysAgo(2) },
    ]);

    const hydrated = await hydrateCartLines([
      { variantId: "serum", quantity: 1 },
      { variantId: "fresh", quantity: 1 },
      { variantId: "plain", quantity: 2 },
    ]);

    expect(mocks.historyFindMany).toHaveBeenCalledOnce();
    expect(hydrated.map((line) => [line.variantId, line.reduced])).toEqual([
      ["serum", true],
      ["fresh", false],
      ["plain", false],
    ]);
    expect(hydrated[2]).toMatchObject({ productSlug: "plain", quantity: 2, priceCents: 3499 });

    const evaluation = evaluateCoupon(TEST10, hydrated, { email: "kupec@test.si", hasCodeAlready: false }, new Date());
    expect(evaluation).toMatchObject({ ok: true, decision: { discountedVariantIds: ["fresh", "plain"] } });
  });

  it("unpurchasable lines are dropped before the flags; no compare-at means no history query", async () => {
    const hidden = variant("deal", 999, null);
    hidden.product.hiddenDeal = true;
    mocks.variantFindMany.mockResolvedValue([variant("plain", 3499, null), hidden]);

    const hydrated = await hydrateCartLines([
      { variantId: "plain", quantity: 1 },
      { variantId: "deal", quantity: 1 },
      { variantId: "gone", quantity: 1 },
    ]);

    expect(hydrated.map((line) => [line.variantId, line.reduced])).toEqual([["plain", false]]);
    expect(mocks.historyFindMany).not.toHaveBeenCalled();
  });
});
