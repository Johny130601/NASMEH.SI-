import { describe, expect, it } from "vitest";
import {
  addableUnits,
  bundleUnitsFromComponents,
  isSoldOut,
  productHasSellableUnits,
  sellableStock,
} from "@/lib/bundle/availability";

/**
 * A fixed bundle's own stock row is never decremented — order creation
 * deducts its components — so every surface that states a bundle's
 * availability reads it from the components (QA M6): the cards, the PDP and
 * its JSON-LD, the sitemap's HIDE rule and the add-to-cart action.
 */

const stocked = (stock: number, allowBackorder = false) => ({ stock, allowBackorder });

describe("bundleUnitsFromComponents", () => {
  it("is the fewest floor(stock / quantity) over the components", () => {
    expect(bundleUnitsFromComponents([{ quantity: 1, variant: stocked(100) }, { quantity: 1, variant: stocked(7) }])).toBe(7);
    expect(bundleUnitsFromComponents([{ quantity: 2, variant: stocked(5) }, { quantity: 1, variant: stocked(9) }])).toBe(2);
    expect(bundleUnitsFromComponents([{ quantity: 3, variant: stocked(2) }])).toBe(0);
  });

  it("is zero as soon as one component is out, and never negative", () => {
    expect(bundleUnitsFromComponents([{ quantity: 1, variant: stocked(100) }, { quantity: 1, variant: stocked(0) }])).toBe(0);
    expect(bundleUnitsFromComponents([{ quantity: 1, variant: stocked(-3) }])).toBe(0);
  });

  it("lets a backorderable component through and is null when nothing limits the bundle", () => {
    expect(bundleUnitsFromComponents([{ quantity: 1, variant: stocked(0, true) }, { quantity: 1, variant: stocked(4) }])).toBe(4);
    expect(bundleUnitsFromComponents([{ quantity: 1, variant: stocked(0, true) }])).toBeNull();
    expect(bundleUnitsFromComponents([])).toBeNull();
  });
});

describe("sellableStock", () => {
  it("sells a plain product from its own row", () => {
    expect(sellableStock(stocked(3), null)).toEqual({ stock: 3, allowBackorder: false });
    expect(sellableStock(stocked(0, true), undefined)).toEqual({ stock: 0, allowBackorder: true });
  });

  it("sells a bundle only as far as its components can fill it, never over its own row", () => {
    const bundle = { items: [{ quantity: 1, variant: stocked(100) }, { quantity: 1, variant: stocked(0) }] };
    // the seeded bundle row says 100, the serum is gone: the bundle is sold out (QA T6-02)
    expect(sellableStock(stocked(100), bundle)).toEqual({ stock: 0, allowBackorder: false });
    expect(isSoldOut(sellableStock(stocked(100), bundle))).toBe(true);
    expect(sellableStock(stocked(2), { items: [{ quantity: 1, variant: stocked(9) }] })).toEqual({ stock: 2, allowBackorder: false });
    expect(sellableStock(stocked(100), { items: [{ quantity: 2, variant: stocked(9) }] })).toEqual({ stock: 4, allowBackorder: false });
  });

  it("never lets the bundle row's backorder flag promise what a limiting component cannot honour", () => {
    const bundle = { items: [{ quantity: 1, variant: stocked(0) }] };
    expect(sellableStock(stocked(0, true), bundle)).toEqual({ stock: 0, allowBackorder: false });
    // with every component backorderable, the bundle row decides
    expect(sellableStock(stocked(0, true), { items: [{ quantity: 1, variant: stocked(0, true) }] })).toEqual({ stock: 0, allowBackorder: true });
  });
});

describe("addableUnits", () => {
  it("is the per-line cap, and no more than the stock can fill", () => {
    expect(addableUnits(stocked(100), 5)).toBe(5);
    expect(addableUnits(stocked(3), 5)).toBe(3);
    expect(addableUnits(stocked(0), 5)).toBe(0);
    expect(addableUnits(stocked(-2), 5)).toBe(0);
  });

  it("is the cap for a backorderable variant whatever the stock", () => {
    expect(addableUnits(stocked(0, true), 5)).toBe(5);
  });
});

describe("productHasSellableUnits (HIDE, §14.2)", () => {
  it("keeps every NOTIFY product, sold out or not", () => {
    expect(productHasSellableUnits({ soldOutBehavior: "NOTIFY", variants: [stocked(0)] })).toBe(true);
  });

  it("drops a HIDE product only when nothing can be sold", () => {
    expect(productHasSellableUnits({ soldOutBehavior: "HIDE", variants: [stocked(0)] })).toBe(false);
    expect(productHasSellableUnits({ soldOutBehavior: "HIDE", variants: [stocked(0), stocked(1)] })).toBe(true);
    expect(productHasSellableUnits({ soldOutBehavior: "HIDE", variants: [stocked(0, true)] })).toBe(true);
  });

  it("counts a HIDE bundle by its components", () => {
    const out = { items: [{ quantity: 1, variant: stocked(5) }, { quantity: 1, variant: stocked(0) }] };
    const filled = { items: [{ quantity: 1, variant: stocked(5) }] };
    expect(productHasSellableUnits({ soldOutBehavior: "HIDE", variants: [stocked(100)], bundle: out })).toBe(false);
    expect(productHasSellableUnits({ soldOutBehavior: "HIDE", variants: [stocked(100)], bundle: filled })).toBe(true);
  });
});

