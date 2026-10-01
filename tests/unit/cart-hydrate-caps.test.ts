import { beforeEach, describe, expect, it, vi } from "vitest";

/** QA C2-F16: a stored line is read back under its real cap, however the cookie or the DB cart was written. */

const mocks = vi.hoisted(() => ({ variantFindMany: vi.fn(), historyFindMany: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    variant: { findMany: mocks.variantFindMany },
    priceHistory: { findMany: mocks.historyFindMany },
  },
}));

import { hydrateCartLines, lineQuantityCap } from "@/lib/cart/hydrate";

interface Row { id: string; stock: number; allowBackorder?: boolean; maxCartQuantity?: number; bundle?: unknown }

function variant({ id, stock, allowBackorder = false, maxCartQuantity = 5, bundle = null }: Row) {
  return {
    id, sku: id.toUpperCase(), title: id, priceCents: 1999, compareAtPriceCents: null,
    maxCartQuantity, stock, allowBackorder,
    product: {
      id: `p-${id}`, slug: id, title: `Izdelek ${id}`, status: "ACTIVE", hiddenDeal: false,
      customFields: null, media: [], bundle, collections: [],
    },
  };
}

beforeEach(() => {
  mocks.variantFindMany.mockReset();
  mocks.historyFindMany.mockReset();
  mocks.historyFindMany.mockResolvedValue([]);
});

describe("lineQuantityCap", () => {
  it("is the per-line cap while the stock covers it", () => {
    expect(lineQuantityCap(5, { stock: 40, allowBackorder: false }, null)).toBe(5);
    expect(lineQuantityCap(1, { stock: 40, allowBackorder: false }, null)).toBe(1);
  });

  it("is the stock when the stock is lower, unless backorders are allowed", () => {
    expect(lineQuantityCap(5, { stock: 3, allowBackorder: false }, null)).toBe(3);
    expect(lineQuantityCap(5, { stock: 0, allowBackorder: true }, null)).toBe(5);
  });

  it("counts a bundle's components", () => {
    const bundle = { items: [{ quantity: 2, variant: { stock: 3, allowBackorder: false } }] };
    expect(lineQuantityCap(5, { stock: 50, allowBackorder: false }, bundle)).toBe(1);
  });

  it("keeps a sold-out line under the per-line cap so order creation names the stock-out", () => {
    expect(lineQuantityCap(5, { stock: 0, allowBackorder: false }, null)).toBe(5);
  });

  it("never lets a malformed stock figure limit the line", () => {
    expect(lineQuantityCap(5, { stock: Number.NaN, allowBackorder: false }, null)).toBe(5);
  });
});

describe("hydrateCartLines re-applies the caps", () => {
  it("clamps a re-signed cookie's 99 to maxCartQuantity, a bundle to 1 and a short stock to what is left", async () => {
    mocks.variantFindMany.mockResolvedValue([
      variant({ id: "strips", stock: 100 }),
      variant({ id: "routine", stock: 100, maxCartQuantity: 1 }),
      variant({ id: "serum", stock: 2 }),
      variant({ id: "backorder", stock: 0, allowBackorder: true }),
    ]);
    const hydrated = await hydrateCartLines([
      { variantId: "strips", quantity: 99 },
      { variantId: "routine", quantity: 4 },
      { variantId: "serum", quantity: 4 },
      { variantId: "backorder", quantity: 3 },
    ]);
    expect(hydrated.map((line) => [line.variantId, line.quantity, line.quantityCap])).toEqual([
      ["strips", 5, 5],
      ["routine", 1, 1],
      ["serum", 2, 2],
      ["backorder", 3, 5],
    ]);
  });
});

describe("hydrateCartLines flags a line that sold out in the cart (QA 2026-09-30)", () => {
  it("keeps the stored quantity under the per-line cap and marks it, a bundle by its components", async () => {
    const component = (stock: number) => ({ quantity: 1, variant: { id: `c-${stock}`, title: "Sestavina", priceCents: 999, stock, allowBackorder: false } });
    mocks.variantFindMany.mockResolvedValue([
      variant({ id: "serum", stock: 0 }),
      // the bundle's own row always reads plenty; its sold-out component decides
      variant({ id: "routine", stock: 100, maxCartQuantity: 1, bundle: { active: true, items: [component(40), component(0)] } }),
      variant({ id: "backorder", stock: 0, allowBackorder: true }),
      variant({ id: "strips", stock: 3 }),
    ]);
    const hydrated = await hydrateCartLines([
      { variantId: "serum", quantity: 2 },
      { variantId: "routine", quantity: 1 },
      { variantId: "backorder", quantity: 1 },
      { variantId: "strips", quantity: 1 },
    ]);
    expect(hydrated.map((line) => [line.variantId, line.quantity, line.soldOut])).toEqual([
      ["serum", 2, true],
      ["routine", 1, true],
      ["backorder", 1, false],
      ["strips", 1, false],
    ]);
  });
});
