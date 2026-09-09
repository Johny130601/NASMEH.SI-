import { describe, expect, it } from "vitest";
import { checkoutFormSchema, isValidPostalCode, shippingMethodSchema } from "@/lib/orders/checkout-schema";

const form = {
  email: "checkout@example.test", phone: "+386 40 123 456", fullName: "Živa Ščuk",
  street: "Čopova ulica", streetNumber: "12", city: "Ljubljana", postalCode: "1000", country: "SI",
  shippingMethodId: "ps-standard", provider: "test",
  checkoutKey: "a".repeat(32), quoteToken: "b".repeat(64),
};

describe("checkout destination validation", () => {
  it.each([
    ["SI", "1000"], ["AT", "1010"], ["HU", "1051"], ["BE", "1000"],
    ["HR", "10000"], ["IT", "00100"], ["DE", "10115"], ["FR", "75001"],
    ["CZ", "110 00"], ["CZ", "11000"], ["SK", "811 01"], ["SK", "81101"],
    ["PL", "00-001"], ["PL", "00001"], ["NL", "1012 AB"], ["NL", "1012ab"],
  ])("accepts the supported postcode format for %s: %s", (country, postalCode) => {
    expect(isValidPostalCode(country, postalCode)).toBe(true);
    expect(checkoutFormSchema.safeParse({ ...form, country, postalCode }).success).toBe(true);
  });

  it.each([
    ["SI", "10000"], ["SI", "100"], ["SI", "ABCD"], ["DE", "1011"], ["FR", "7500"],
    ["HR", "1000"], ["IT", "0010"], ["AT", "10101"], ["HU", "10511"], ["BE", "10000"],
    ["CZ", "110-00"], ["SK", "8110"], ["PL", "000-01"], ["NL", "1012"], ["NL", "AB1012"],
    ["US", "10001"], ["XX", "1000"], ["si", "1000"],
  ])("rejects unsupported or invalid destination %s: %s", (country, postalCode) => {
    expect(isValidPostalCode(country, postalCode)).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...form, country, postalCode }).success).toBe(false);
  });

  it("trims a postcode, defaults to Slovenia, and leaves marketing consent unchecked", () => {
    const parsed = checkoutFormSchema.parse({ ...form, country: undefined, postalCode: " 1000 " });
    expect(parsed.country).toBe("SI");
    expect(parsed.postalCode).toBe("1000");
    expect(parsed.marketingOptIn).toBe(false);
  });

  it("requires server-issued checkout and quote token formats and strips client money", () => {
    expect(checkoutFormSchema.safeParse({ ...form, checkoutKey: "guessed-key" }).success).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...form, quoteToken: "guessed-quote" }).success).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...form, quoteToken: undefined }).success).toBe(false);
    const parsed = checkoutFormSchema.parse({ ...form, totalCents: 1, shippingCents: 0, priceCents: 1 });
    expect(parsed).not.toHaveProperty("totalCents");
    expect(parsed).not.toHaveProperty("shippingCents");
    expect(parsed).not.toHaveProperty("priceCents");
  });

  it("restricts legacy shipping rates to SI by default and rejects negative/fractional rates", () => {
    const rate = { id: "ps-standard", label: "Standard", carrier: "Pošta Slovenije", estimate: "2-4 dni", priceCents: 390 };
    expect(shippingMethodSchema.parse(rate).countries).toEqual(["SI"]);
    expect(shippingMethodSchema.parse({ ...rate, countries: ["SI", "DE"] }).countries).toEqual(["SI", "DE"]);
    expect(shippingMethodSchema.safeParse({ ...rate, countries: [] }).success).toBe(false);
    expect(shippingMethodSchema.safeParse({ ...rate, priceCents: -1 }).success).toBe(false);
    expect(shippingMethodSchema.safeParse({ ...rate, priceCents: 3.9 }).success).toBe(false);
  });
});
