import { describe, expect, it } from "vitest";
import { priceCart } from "@/lib/promo";
import type { CartLineInput, PromoSettings } from "@/lib/promo";

const NOW = new Date("2026-09-09T12:00:00Z");

const SETTINGS: PromoSettings = {
  vatRatePercent: 22,
  freeShippingThresholdCents: 4500,
  shippingCostCents: 390,
};

function line(overrides: Partial<CartLineInput> = {}): CartLineInput {
  return {
    variantId: "v1",
    sku: "NAS-TRK-14",
    title: "Belilni trakci",
    quantity: 1,
    priceCents: 3499,
    compareAtPriceCents: null,
    vatRatePercent: 22,
    maxCartQuantity: 5,
    isBundle: false,
    ...overrides,
  };
}

const BUNDLE = line({
  variantId: "vB",
  sku: "NAS-PAK-RUTINA",
  title: "Paket popolna rutina",
  priceCents: 4999,
  maxCartQuantity: 1,
  isBundle: true,
  bundleComponents: [
    { variantId: "c1", title: "Trakci", quantity: 1, priceCents: 3499 },
    { variantId: "c2", title: "Ustna voda", quantity: 1, priceCents: 1999 },
    { variantId: "c3", title: "Serum", quantity: 1, priceCents: 1999 },
  ],
});

describe("priceCart (promo pricing core)", () => {
  it("empty cart: zeros, 5 % floor, no shipping", () => {
    const cart = priceCart([], SETTINGS, NOW);
    expect(cart).toMatchObject({
      itemCount: 0,
      subtotalCents: 0,
      shippingCents: 0,
      totalCents: 0,
      vatCents: 0,
    });
    expect(cart.freeShipping).toEqual({
      reached: false,
      remainingCents: 0,
      progressPercent: 5,
    });
  });

  it("single line: subtotal = qty × price, shipping charged under threshold", () => {
    const cart = priceCart([line({ quantity: 1 })], SETTINGS, NOW);
    expect(cart.subtotalCents).toBe(3499);
    expect(cart.shippingCents).toBe(390);
    expect(cart.totalCents).toBe(3889);
    expect(cart.freeShipping.reached).toBe(false);
    expect(cart.freeShipping.remainingCents).toBe(1001);
    expect(cart.freeShipping.progressPercent).toBe(78);
  });

  it("threshold boundary: €44.99 → shipping charged, €45.00 → free", () => {
    const at4499 = priceCart([line({ priceCents: 4499 })], SETTINGS, NOW);
    expect(at4499.freeShipping.reached).toBe(false);
    expect(at4499.shippingCents).toBe(390);
    expect(at4499.freeShipping.remainingCents).toBe(1);
    expect(at4499.freeShipping.progressPercent).toBe(100);

    const at4500 = priceCart([line({ priceCents: 4500 })], SETTINGS, NOW);
    expect(at4500.freeShipping.reached).toBe(true);
    expect(at4500.shippingCents).toBe(0);
    expect(at4500.totalCents).toBe(4500);
  });

  it("VAT breakdown is exact at 22 % of the TOTAL (incl. shipping)", () => {
    // 3499 + 390 shipping = 3889 → net round(3889/1.22)=3188, tax 701
    const cart = priceCart([line()], SETTINGS, NOW);
    expect(cart.vatCents).toBe(701);
    // free-shipping case: 4999 → net 4098, tax 901
    const free = priceCart([BUNDLE], SETTINGS, NOW);
    expect(free.vatCents).toBe(901);
  });

  it("bundle line: variant price only + components expanded for display", () => {
    const cart = priceCart([BUNDLE], SETTINGS, NOW);
    expect(cart.lines[0].lineTotalCents).toBe(4999);
    expect(cart.lines[0].isBundle).toBe(true);
    expect(cart.lines[0].bundleComponents).toHaveLength(3);
    expect(
      cart.lines[0].bundleComponents.reduce((s, c) => s + c.priceCents, 0),
    ).toBe(7497); // display value-math, NOT pricing
    expect(cart.subtotalCents).toBe(4999);
  });

  it("mixed bundle + single lines: totals add up, shipping once", () => {
    const cart = priceCart(
      [BUNDLE, line({ quantity: 2 })],
      SETTINGS,
      NOW,
    );
    expect(cart.itemCount).toBe(3);
    expect(cart.subtotalCents).toBe(4999 + 6998);
    expect(cart.shippingCents).toBe(0); // 11997 ≥ 4500
    expect(cart.totalCents).toBe(11997);
  });

  it("progress never exceeds 100 and floors at 5 % for tiny amounts", () => {
    const tiny = priceCart([line({ priceCents: 100 })], SETTINGS, NOW);
    expect(tiny.freeShipping.progressPercent).toBe(5);
    const huge = priceCart([line({ priceCents: 99999 })], SETTINGS, NOW);
    expect(huge.freeShipping.progressPercent).toBe(100);
  });
});
