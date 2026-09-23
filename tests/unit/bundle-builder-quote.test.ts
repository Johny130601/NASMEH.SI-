import { describe, expect, it } from "vitest";
import {
  bestOfferIndex,
  buildQuoteTable,
  committedUnits,
  quoteCombination,
  quoteKey,
  type BundleQuote,
  type BundleQuoteInput,
} from "@/lib/bundle/quote";
import type { CouponInput, CouponLine, PromoSettings } from "@/lib/promo";

/**
 * Bundle-builder pricing (/sestavi-paket). The client renders a lookup, so
 * every entry in it has to be a cart the checkout would really charge: the
 * lines the shopper already holds included, a rejected coupon priced as no
 * discount rather than as no entry, and a stated share that reconciles with
 * the cents beside it (AGENTS §8.23). The module is PURE — no mocks here.
 */

const NOW = new Date("2026-09-20T10:00:00Z");
const SETTINGS: PromoSettings = {
  vatRatePercent: 22,
  freeShippingThresholdCents: 4500,
  shippingCostCents: 390,
};
const CTX = { email: "kupec@test.si", hasCodeAlready: false };

function line(overrides: Partial<CouponLine> = {}): CouponLine {
  return {
    variantId: "v-osnova",
    sku: "BELJENJE",
    title: "Set za beljenje",
    quantity: 1,
    priceCents: 3499,
    compareAtPriceCents: null,
    reduced: false,
    vatRatePercent: 22,
    maxCartQuantity: 5,
    isBundle: false,
    product: { productId: "p-osnova", collectionSlugs: ["beljenje"] },
    ...overrides,
  };
}

/** Add-on 0 and add-on 1 of the row, at 19,99 € and 12,99 €. */
const PASTA = line({
  variantId: "v-pasta",
  sku: "PASTA",
  title: "Zobna pasta",
  priceCents: 1999,
  product: { productId: "p-pasta", collectionSlugs: ["nega"] },
});
const NITKA = line({
  variantId: "v-nitka",
  sku: "NITKA",
  title: "Zobna nitka",
  priceCents: 1299,
  product: { productId: "p-nitka", collectionSlugs: ["nega"] },
});

function coupon(overrides: Partial<CouponInput> = {}): CouponInput {
  return {
    code: "PAKET20",
    type: "PERCENT",
    percentOff: 20,
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

function input(overrides: Partial<BundleQuoteInput> = {}): BundleQuoteInput {
  return {
    base: line(),
    addOns: [PASTA, NITKA],
    addOnExisting: [0, 0],
    otherLines: [],
    existingBaseQuantity: 0,
    offerUnits: [1, 2, 3],
    settings: SETTINGS,
    coupon: null,
    ctx: CTX,
    now: NOW,
    ...overrides,
  };
}

/** What every entry owes the shopper, whatever the coupon decided. */
function expectWholeCart(quote: BundleQuote): void {
  expect(quote.subtotalCents).toBeGreaterThan(0);
  expect(quote.totalCents).toBe(
    quote.subtotalCents - quote.discountCents + quote.shippingCents,
  );
  expect(quote.discountPercent).toBe(
    Math.floor((quote.discountCents * 100) / quote.subtotalCents),
  );
  // floored: the share stated is never more than the cents really taken
  expect(quote.discountPercent * quote.subtotalCents).toBeLessThanOrEqual(
    quote.discountCents * 100,
  );
}

describe("committedUnits (the write raises a line and never lowers it)", () => {
  it("keeps whichever is bigger, the offer or the cart", () => {
    expect(committedUnits(1, 3)).toBe(3);
    expect(committedUnits(3, 1)).toBe(3);
    expect(committedUnits(2, 2)).toBe(2);
    expect(committedUnits(2, 0)).toBe(2);
  });

  it("prices the cart the shopper will be charged, not the smaller offer they clicked", () => {
    // the product page already put three units in the cart before sending them here
    const table = buildQuoteTable(input({ existingBaseQuantity: 3 }));
    expect([0, 1, 2].map((index) => table[quoteKey(index, 0)].units)).toEqual([3, 3, 3]);
    expect(table[quoteKey(0, 0)].subtotalCents).toBe(3499 * 3);
    expect(table[quoteKey(0, 0)].bundleSubtotalCents).toBe(3499 * 3);
  });
});

describe("buildQuoteTable", () => {
  it("holds exactly one entry per selectable combination, keyed by offer and mask", () => {
    const table = buildQuoteTable(input());
    const expected: string[] = [];
    for (let offerIndex = 0; offerIndex < 3; offerIndex += 1) {
      for (let mask = 0; mask < 4; mask += 1) expected.push(quoteKey(offerIndex, mask));
    }
    expect(Object.keys(table)).toEqual(expected);
    expect(Object.keys(table)).toHaveLength(3 * 2 ** 2);

    for (const [key, quote] of Object.entries(table)) {
      expect(key).toBe(quoteKey(quote.offerIndex, quote.addOnMask));
      expectWholeCart(quote);
    }
  });

  it("counts the add-ons the catalogue resolved, never a fixed three", () => {
    expect(Object.keys(buildQuoteTable(input({ addOns: [PASTA], addOnExisting: [0] })))).toHaveLength(3 * 2);
    expect(Object.keys(buildQuoteTable(input({ addOns: [], addOnExisting: [] })))).toHaveLength(3);
    expect(
      Object.keys(buildQuoteTable(input({ offerUnits: [1, 2], addOns: [PASTA], addOnExisting: [0] }))),
    ).toEqual([quoteKey(0, 0), quoteKey(0, 1), quoteKey(1, 0), quoteKey(1, 1)]);
  });

  it("puts in each entry the goods its own mask names", () => {
    const table = buildQuoteTable(input());
    expect(table[quoteKey(0, 0)].bundleSubtotalCents).toBe(3499);
    expect(table[quoteKey(0, 1)].bundleSubtotalCents).toBe(3499 + 1999);
    expect(table[quoteKey(0, 2)].bundleSubtotalCents).toBe(3499 + 1299);
    expect(table[quoteKey(0, 3)].bundleSubtotalCents).toBe(3499 + 1999 + 1299);
    expect(table[quoteKey(1, 3)].bundleSubtotalCents).toBe(3499 * 2 + 1999 + 1299);
    expect(table[quoteKey(2, 0)].itemCount).toBe(3);
    expect(table[quoteKey(2, 3)].itemCount).toBe(5);
  });
});

describe("the lines the builder does not own", () => {
  it("prices an add-on the shopper already holds but did not tick, and keeps it out of the recap", () => {
    const owned = quoteCombination(input({ addOnExisting: [0, 2] }), 0, 0);
    const alone = quoteCombination(input(), 0, 0);

    // it is in the cart, so it is in the subtotal, the item count and the threshold
    expect(owned.subtotalCents).toBe(alone.subtotalCents + 1299 * 2);
    expect(owned.itemCount).toBe(3);
    expect(alone.freeShipping).toBe(false);
    expect(owned.freeShipping).toBe(true);
    // …but "Vaš paket" only recaps what this submit commits
    expect(owned.bundleSubtotalCents).toBe(3499);
    expect(owned.bundleSubtotalCents).toBe(alone.bundleSubtotalCents);
    expectWholeCart(owned);
  });

  it("raises a ticked add-on to what is already there rather than back down to one", () => {
    const ticked = quoteCombination(input({ addOnExisting: [0, 2] }), 0, 0b10);
    expect(ticked.bundleSubtotalCents).toBe(3499 + 1299 * 2);
    expect(ticked.subtotalCents).toBe(ticked.bundleSubtotalCents);
    expect(ticked.itemCount).toBe(3);
  });

  it("prices the rest of the cart into the totals and out of the recap", () => {
    const other = line({
      variantId: "v-druga",
      priceCents: 2000,
      product: { productId: "p-druga", collectionSlugs: ["nega"] },
    });
    const quote = quoteCombination(input({ otherLines: [other] }), 0, 0);
    expect(quote.subtotalCents).toBe(3499 + 2000);
    expect(quote.bundleSubtotalCents).toBe(3499);
    expectWholeCart(quote);
  });
});

describe("a coupon the engine refuses", () => {
  it("still hands back a full quote — no discount, and the reason why", () => {
    const table = buildQuoteTable(input({ coupon: coupon({ minSpendCents: 20000 }) }));
    const plain = buildQuoteTable(input());

    for (const [key, quote] of Object.entries(table)) {
      expect(quote.rejection).toBe("min_spend");
      expect(quote.discountCents).toBe(0);
      expect(quote.discountPercent).toBe(0);
      expectWholeCart(quote);
      // a refused code prices exactly like no code: the page never goes blank
      expect(quote.totalCents).toBe(plain[key].totalCents);
      expect(quote.subtotalCents).toBe(plain[key].subtotalCents);
    }
  });

  it("names the refusal for a code the shopper is already carrying", () => {
    const carried = quoteCombination(
      input({ coupon: coupon(), ctx: { ...CTX, hasCodeAlready: true } }),
      1,
      0,
    );
    expect(carried.rejection).toBe("already_applied");
    expect(carried.discountCents).toBe(0);
    expect(carried.totalCents).toBe(3499 * 2);
  });

  it("reports no rejection at all once the engine applies the code", () => {
    const accepted = quoteCombination(input({ coupon: coupon() }), 1, 0);
    expect(accepted.rejection).toBeNull();
    expect(accepted.discountCents).toBe(1400); // 20 % of 69,98 €, the engine's own rounding
    expect(accepted.freeShipping).toBe(true);
    expect(accepted.totalCents).toBe(6998 - 1400);
    expectWholeCart(accepted);
  });

  it("prices no coupon at all as a plain cart", () => {
    const none = quoteCombination(input(), 0, 0);
    expect(none.rejection).toBe("not_found");
    expect(none.discountCents).toBe(0);
    expect(none.discountPercent).toBe(0);
    expect(none.totalCents).toBe(3499 + 390);
  });
});

describe("the share the summary states", () => {
  it("comes from the engine's cents, not from the coupon's own percentOff", () => {
    // an already-reduced line is outside the discount base, so 20 % of the
    // eligible goods is nowhere near 20 % of what the shopper is paying
    const reduced = line({
      variantId: "v-akcija",
      priceCents: 2000,
      compareAtPriceCents: 2499,
      reduced: true,
      product: { productId: "p-akcija", collectionSlugs: ["nega"] },
    });
    const quote = quoteCombination(
      input({ coupon: coupon({ percentOff: 20 }), otherLines: [reduced] }),
      0,
      0,
    );
    expect(quote.subtotalCents).toBe(3499 + 2000);
    expect(quote.discountCents).toBe(700);
    // 700/5499 is 12,73 %: floored, so the line beside the cents never overstates them
    expect(quote.discountPercent).toBe(12);
    expect(quote.discountPercent).toBeLessThan(coupon().percentOff!);
    expect(quote.freeShipping).toBe(true);
    expect(quote.totalCents).toBe(4799);
    expectWholeCart(quote);
  });

  it("reconciles for every entry of a discounted table", () => {
    const table = buildQuoteTable(input({ coupon: coupon() }));
    for (const quote of Object.values(table)) {
      expect(quote.discountCents).toBeGreaterThan(0);
      expectWholeCart(quote);
    }
  });
});

describe("bestOfferIndex (a computed rank, or no badge at all)", () => {
  it("says nothing when the offers do not separate", () => {
    // no coupon: the second and third offer both reach free delivery and hand
    // back exactly the same per unit — a badge here would be arbitrary
    expect(bestOfferIndex(buildQuoteTable(input()), 3)).toBeNull();
  });

  it("says nothing when there is nothing to give back, or nothing to rank", () => {
    expect(bestOfferIndex(buildQuoteTable(input({ offerUnits: [2] })), 1)).toBeNull();
    expect(bestOfferIndex({}, 3)).toBeNull();
  });

  it("names the offer that returns the most per unit, delivery counted", () => {
    // 5 € off: the single unit loses 3,90 € of it to delivery and the
    // three-pack spreads it thinner — the two-pack really gives most back
    const table = buildQuoteTable(
      input({ coupon: coupon({ type: "FIXED", percentOff: null, amountOffCents: 500 }) }),
    );
    expect(table[quoteKey(0, 0)].freeShipping).toBe(false);
    expect(table[quoteKey(1, 0)].freeShipping).toBe(true);
    expect(bestOfferIndex(table, 3)).toBe(1);
  });
});
