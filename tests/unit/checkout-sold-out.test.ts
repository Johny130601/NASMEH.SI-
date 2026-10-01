import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA 2026-09-30: a line that sold out while it sat in the cart used to pass
 * every checkout step and fail only at "Oddaj naročilo". The quote now refuses
 * such a cart at the start and names the lines; order creation answers the
 * same refusal as its stock check (order-payment-recovery.test.ts).
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), getCartLines: vi.fn(), hydrate: vi.fn(), pricing: vi.fn(), shipping: vi.fn(), vat: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-sold-out-quote-secret" }) }));
vi.mock("@/lib/cart/server", () => ({ getCartLines: mocks.getCartLines }));
vi.mock("@/lib/cart/hydrate", () => ({ hydrateCartLines: mocks.hydrate }));
vi.mock("@/lib/promo/cart-pricing", () => ({ priceCartForDisplay: mocks.pricing }));
vi.mock("@/lib/settings", () => ({ getShippingSettings: mocks.shipping, getVatRatePercent: mocks.vat }));

import { buildCheckoutPricing, quoteFailureReason } from "@/lib/orders/quote";
import { assertNoSoldOutLines, SoldOutLinesError, soldOutLineTitles } from "@/lib/orders/sold-out";

const line = (title: string, soldOut: boolean) => ({ variantId: `v-${title}`, title, soldOut, quantity: 1 });
const input = { email: "", country: "SI", shippingMethodId: "ps-standard" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.getCartLines.mockResolvedValue([{ variantId: "v-a", quantity: 1 }]);
});

describe("sold-out lines", () => {
  it("names only the lines nothing can be sold of, in cart order", () => {
    const lines = [line("Serum", true), line("Trakci", false), line("Paket", true)];
    expect(soldOutLineTitles(lines)).toEqual(["Serum", "Paket"]);
    expect(soldOutLineTitles([line("Trakci", false)])).toEqual([]);
  });

  it("throws the named refusal only when a line is sold out", () => {
    expect(() => assertNoSoldOutLines([line("Trakci", false)])).not.toThrow();
    let caught: unknown;
    try { assertNoSoldOutLines([line("Serum", true)]); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(SoldOutLinesError);
    expect((caught as SoldOutLinesError).titles).toEqual(["Serum"]);
    expect(quoteFailureReason(caught)).toBe("sold_out");
  });
});

describe("buildCheckoutPricing stops a cart with a sold-out line", () => {
  it("refuses before any price or delivery method is read", async () => {
    mocks.hydrate.mockResolvedValue([line("Belilni trakci za zobe", true), line("Ustna voda", false)]);
    const refusal = await buildCheckoutPricing(input).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(SoldOutLinesError);
    expect((refusal as SoldOutLinesError).titles).toEqual(["Belilni trakci za zobe"]);
    expect(mocks.shipping).not.toHaveBeenCalled();
    expect(mocks.pricing).not.toHaveBeenCalled();
  });

  it("an empty cart is still an empty cart, and an available cart goes on to pricing", async () => {
    mocks.hydrate.mockResolvedValue([]);
    await expect(buildCheckoutPricing(input)).rejects.toThrow("empty_cart");

    mocks.hydrate.mockResolvedValue([line("Ustna voda", false)]);
    mocks.shipping.mockRejectedValue(new Error("reached the delivery settings"));
    mocks.vat.mockResolvedValue(22);
    await expect(buildCheckoutPricing(input)).rejects.toThrow("reached the delivery settings");
  });
});
