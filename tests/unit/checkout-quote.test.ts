import { describe, expect, it, vi } from "vitest";
import { quoteMatches, signQuote, type CheckoutQuote } from "@/lib/orders/quote";

// Pure quote authentication must be testable without sessions, cookies or a DB.
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => { throw new Error("Unexpected auth I/O"); }) }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => { throw new Error("Unexpected env I/O"); }) }));
vi.mock("@/lib/cart/server", () => ({ getCartLines: vi.fn(() => { throw new Error("Unexpected cart I/O"); }) }));
vi.mock("@/lib/cart/hydrate", () => ({ hydrateCartLines: vi.fn(() => { throw new Error("Unexpected catalog I/O"); }) }));
vi.mock("@/lib/promo/cart-pricing", () => ({ priceCartForDisplay: vi.fn(() => { throw new Error("Unexpected pricing I/O"); }) }));
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(() => { throw new Error("Unexpected settings I/O"); }), SETTING_KEYS: {} }));

type UnsignedQuote = Omit<CheckoutQuote, "token">;
const secret = "unit-quote-authentication-secret";
const quote: UnsignedQuote = {
  lines: [{ variantId: "variant-mouthwash", sku: "MOUTHWASH", title: "Ustna voda", quantity: 1, lineTotalCents: 1999 }],
  subtotalCents: 1999, discountCents: 0, shippingCents: 390, freeShippingReached: false, totalCents: 2389,
  vatCents: 431, vatRatePercent: 22, couponCode: null, couponType: null, couponRejection: null,
  shippingMethodId: "ps-standard", country: "SI", email: "quote@example.test",
};

describe("checkout quote authentication", () => {
  it("authenticates an unchanged quote across a serialization round-trip", () => {
    const token = signQuote(quote, secret);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(quoteMatches(token, signQuote(JSON.parse(JSON.stringify(quote)), secret))).toBe(true);
  });

  const changes: Array<[string, (value: UnsignedQuote) => void]> = [
    ["variant identity", value => { value.lines[0].variantId = "another-variant"; }],
    ["SKU snapshot", value => { value.lines[0].sku = "ANOTHER-SKU"; }],
    ["title snapshot", value => { value.lines[0].title = "Drug izdelek"; }],
    ["quantity", value => { value.lines[0].quantity = 2; }],
    ["line price", value => { value.lines[0].lineTotalCents = 2499; }],
    ["line removal", value => { value.lines = []; }],
    ["subtotal", value => { value.subtotalCents = 2499; }],
    ["discount", value => { value.discountCents = 200; }],
    ["shipping price", value => { value.shippingCents = 690; }],
    ["free-shipping state", value => { value.freeShippingReached = true; }],
    ["total", value => { value.totalCents = 2689; }],
    ["VAT amount", value => { value.vatCents = 485; }],
    ["VAT rate", value => { value.vatRatePercent = 20; }],
    ["coupon", value => { value.couponCode = "TEST10"; }],
    ["coupon eligibility", value => { value.couponRejection = "customer_limit"; }],
    ["bundle component snapshot", value => { value.lines[0].componentsDigest = "a".repeat(64); }],
    ["shipping method", value => { value.shippingMethodId = "gls-express"; }],
    ["destination country", value => { value.country = "AT"; }],
    ["customer email", value => { value.email = "different@example.test"; }],
  ];

  it.each(changes)("requires reconfirmation when the %s changes", (_label, mutate) => {
    const changed = structuredClone(quote);
    mutate(changed);
    expect(quoteMatches(signQuote(quote, secret), signQuote(changed, secret))).toBe(false);
  });

  it("cannot authenticate with a different signing key", () => {
    expect(quoteMatches(signQuote(quote, secret), signQuote(quote, "different-secret"))).toBe(false);
  });

  it("requires reconfirmation when bundle contents change at the same selling price", () => {
    const bundle = structuredClone(quote);
    bundle.lines[0].componentsDigest = "a".repeat(64);
    const changed = structuredClone(bundle);
    changed.lines[0].componentsDigest = "b".repeat(64);
    expect(changed.totalCents).toBe(bundle.totalCents);
    expect(quoteMatches(signQuote(bundle, secret), signQuote(changed, secret))).toBe(false);
  });

  it("authenticates identical cart lines returned in a different database order without mutating them", () => {
    const multiple = structuredClone(quote);
    multiple.lines.push({ variantId: "variant-another", sku: "ANOTHER", title: "Drug izdelek", quantity: 1, lineTotalCents: 1999 });
    multiple.subtotalCents = 3998;
    multiple.totalCents = 4388;
    multiple.vatCents = 791;
    const before = structuredClone(multiple);
    const reversed = { ...multiple, lines: multiple.lines.toReversed() };
    expect(quoteMatches(signQuote(multiple, secret), signQuote(reversed, secret))).toBe(true);
    expect(multiple).toEqual(before);
    expect(reversed.lines[0].variantId).toBe("variant-another");
  });

  it("rejects a changed token without throwing", () => {
    const token = signQuote(quote, secret);
    const tampered = (token[0] === "0" ? "1" : "0") + token.slice(1);
    expect(quoteMatches(tampered, token)).toBe(false);
  });

  it.each(["", "a".repeat(63), "a".repeat(65), "g".repeat(64), "A".repeat(64), " ".repeat(64), "☃".repeat(64)])(
    "rejects malformed tokens on either side: %s", malformed => {
      const valid = signQuote(quote, secret);
      expect(quoteMatches(malformed, valid)).toBe(false);
      expect(quoteMatches(valid, malformed)).toBe(false);
      expect(quoteMatches(malformed, malformed)).toBe(false);
    },
  );
});
