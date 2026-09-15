import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { priceHistory: { findMany: mocks.findMany } } }));

import { withReducedFlags } from "@/lib/promo/reductions";
import { evaluateCoupon, type CouponInput } from "@/lib/promo";

const NOW = new Date("2026-09-09T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const base = { sku: "S", title: "Izdelek", quantity: 1, vatRatePercent: 22, maxCartQuantity: 5, isBundle: false };
const product = { productId: "p1", collectionSlugs: [] as string[] };
const TEST10: CouponInput = {
  code: "TEST10", type: "PERCENT", percentOff: 10, amountOffCents: null, minSpendCents: null, startsAt: null, endsAt: null,
  active: true, usageLimitTotal: null, usageLimitPerCustomer: null, usedCount: 0, usedByCustomer: 0,
  eligibleProductIds: null, eligibleCollectionSlugs: null, eligibleEmails: null, excludedProductIds: [],
};

describe("withReducedFlags (coupon exclusion follows the storefront's Omnibus gate)", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it("flags only lines with a history-backed reduction; a bare compare-at stays couponable", async () => {
    mocks.findMany.mockResolvedValue([
      { variantId: "serum", priceCents: 2499, compareAtPriceCents: null, createdAt: daysAgo(60) },
      { variantId: "serum", priceCents: 1999, compareAtPriceCents: 2499, createdAt: daysAgo(10) },
      // created with a compare-at: the shop shows a plain price
      { variantId: "fresh", priceCents: 1499, compareAtPriceCents: 2999, createdAt: daysAgo(2) },
      // plain cut 200 days ago, compare-at switched on today: no reduction shown
      { variantId: "late", priceCents: 2499, compareAtPriceCents: null, createdAt: daysAgo(400) },
      { variantId: "late", priceCents: 1999, compareAtPriceCents: null, createdAt: daysAgo(200) },
      { variantId: "late", priceCents: 1999, compareAtPriceCents: 2499, createdAt: daysAgo(0) },
    ]);
    const lines = [
      { ...base, variantId: "serum", priceCents: 1999, compareAtPriceCents: 2499, product },
      { ...base, variantId: "fresh", priceCents: 1499, compareAtPriceCents: 2999, product },
      { ...base, variantId: "late", priceCents: 1999, compareAtPriceCents: 2499, product },
      { ...base, variantId: "plain", priceCents: 3499, compareAtPriceCents: null, product },
    ];

    const flagged = await withReducedFlags(lines, NOW);

    expect(mocks.findMany).toHaveBeenCalledOnce();
    expect(flagged.map((line) => [line.variantId, line.reduced])).toEqual([
      ["serum", true],
      ["fresh", false],
      ["late", false],
      ["plain", false],
    ]);
    // the rest of each line is carried through untouched
    expect(flagged[3]).toMatchObject(lines[3]);

    const evaluation = evaluateCoupon(TEST10, flagged, { email: "kupec@test.si", hasCodeAlready: false }, NOW);
    expect(evaluation).toMatchObject({ ok: true, decision: { discountedVariantIds: ["fresh", "late", "plain"] } });
  });

  it("no announced compare-at → no history query, nothing flagged", async () => {
    const flagged = await withReducedFlags([{ ...base, variantId: "plain", priceCents: 3499, compareAtPriceCents: null }], NOW);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(flagged[0].reduced).toBe(false);
  });
});
