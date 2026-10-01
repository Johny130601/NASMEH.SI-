import { describe, expect, it, vi } from "vitest";

// quote.ts is imported for its pure failure mapping only: no session, cart or settings I/O.
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => { throw new Error("Unexpected auth I/O"); }) }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => { throw new Error("Unexpected env I/O"); }) }));
vi.mock("@/lib/cart/server", () => ({ getCartLines: vi.fn(() => { throw new Error("Unexpected cart I/O"); }) }));
vi.mock("@/lib/cart/hydrate", () => ({ hydrateCartLines: vi.fn(() => { throw new Error("Unexpected catalog I/O"); }) }));
vi.mock("@/lib/promo/cart-pricing", () => ({ priceCartForDisplay: vi.fn(() => { throw new Error("Unexpected pricing I/O"); }) }));
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(() => { throw new Error("Unexpected settings I/O"); }), SETTING_KEYS: {} }));

import {
  CHECKOUT_LIMITS, fieldErrorsFromPaths, isPlausibleEmail, isValidPostalCode, splitStreetLine,
  validateCheckoutAddress, validateCheckoutContact,
} from "@/lib/orders/checkout-constants";
import { checkoutFormSchema, invalidFormFields } from "@/lib/orders/checkout-schema";
import { quoteFailureReason, quoteInputSchema } from "@/lib/orders/quote";
import { isValidPhone } from "@/lib/phone";

/** QA M11: the wizard's client rules mirror the server schema, and the server's refusal names the fields. */

const form = {
  email: "checkout@example.test", phone: "+386 40 123 456", fullName: "Živa Ščuk",
  street: "Čopova ulica", streetNumber: "12", city: "Ljubljana", postalCode: "1000", country: "SI",
  shippingMethodId: "ps-standard", provider: "test",
  checkoutKey: "a".repeat(32), quoteToken: "b".repeat(64),
};
const address = { phone: "", fullName: "Živa Ščuk", street: "Čopova ulica", streetNumber: "12", city: "Ljubljana", postalCode: "1000", country: "SI" };

describe("e-mail rule", () => {
  it.each(["qa2@x", "qa2", "@x.si", "a b@x.si", ""])("refuses %j on the client", (email) => {
    expect(isPlausibleEmail(email)).toBe(false);
  });

  it("accepts a normal address, trims it, and the server schema agrees", () => {
    expect(isPlausibleEmail("  kupec@primer.si ")).toBe(true);
    expect(validateCheckoutContact({ email: " kupec@primer.si " })).toEqual({});
    expect(checkoutFormSchema.parse({ ...form, email: " kupec@primer.si " }).email).toBe("kupec@primer.si");
  });

  it("names the problem: required, invalid, too long", () => {
    expect(validateCheckoutContact({ email: "   " })).toEqual({ email: "required" });
    expect(validateCheckoutContact({ email: "qa2@x" })).toEqual({ email: "invalid" });
    expect(validateCheckoutContact({ email: `${"a".repeat(CHECKOUT_LIMITS.email)}@x.si` })).toEqual({ email: "tooLong" });
  });

  it("an address the server refuses in the quote is reported as invalid_email, not as a shipping problem", () => {
    const refused = quoteInputSchema.safeParse({ email: "qa2@x", country: "SI", shippingMethodId: "ps-standard" });
    expect(refused.success).toBe(false);
    expect(quoteFailureReason(refused.error)).toBe("invalid_email");
    expect(quoteFailureReason(new Error("invalid_shipping_method"))).toBe("invalid_shipping_method");
    expect(quoteFailureReason(new Error("empty_cart"))).toBe("empty_cart");
    expect(quoteFailureReason(new Error("boom"))).toBe("failed");
    expect(quoteInputSchema.parse({ email: "", country: "SI", shippingMethodId: "ps-standard" }).email).toBe("");
  });

  it("a refused method or country is a delivery problem, never a wrong e-mail", () => {
    for (const input of [
      { email: "kupec@primer.si", country: "SI", shippingMethodId: "" },
      { email: "", country: "SI", shippingMethodId: "" },
      { email: "kupec@primer.si", country: "", shippingMethodId: "ps-standard" },
    ]) {
      const refused = quoteInputSchema.safeParse(input);
      expect(refused.success).toBe(false);
      expect(quoteFailureReason(refused.error)).toBe("invalid_shipping_method");
    }
    const both = quoteInputSchema.safeParse({ email: "qa2@x", country: "SI", shippingMethodId: "" });
    expect(quoteFailureReason(both.error)).toBe("invalid_email");
  });
});

describe("phone rule (lib/phone.ts)", () => {
  it.each(["+386 40 123 456", "040123456", "(01) 234-56-78", "01/234 56 78"])("accepts %j everywhere", (phone) => {
    expect(isValidPhone(phone)).toBe(true);
    expect(validateCheckoutAddress({ ...address, phone }).phone).toBeUndefined();
    expect(checkoutFormSchema.safeParse({ ...form, phone }).success).toBe(true);
  });

  it.each(["abc", "abc-not-a-phone", "12345", "------", "+386 40 123 456 789 012 3"])("refuses %j on the client and the server", (phone) => {
    expect(isValidPhone(phone)).toBe(false);
    expect(validateCheckoutAddress({ ...address, phone }).phone).toBeDefined();
    const parsed = checkoutFormSchema.safeParse({ ...form, phone });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(invalidFormFields(parsed.error)).toEqual(["phone"]);
  });

  it("keeps the phone optional", () => {
    expect(validateCheckoutAddress(address)).toEqual({});
    expect(checkoutFormSchema.parse({ ...form, phone: undefined }).phone).toBe("");
    expect(checkoutFormSchema.parse({ ...form, phone: "  " }).phone).toBe("");
  });
});

describe("Dostava fields mirror the schema", () => {
  it("blank-after-trim names are required, one letter is invalid, over-long values are too long", () => {
    expect(validateCheckoutAddress({ ...address, fullName: "   " })).toEqual({ fullName: "required" });
    expect(validateCheckoutAddress({ ...address, fullName: "Ž" })).toEqual({ fullName: "invalid" });
    expect(validateCheckoutAddress({ ...address, street: "x".repeat(CHECKOUT_LIMITS.street + 1) })).toEqual({ street: "tooLong" });
    expect(validateCheckoutAddress({ ...address, city: "x".repeat(CHECKOUT_LIMITS.city + 1) })).toEqual({ city: "tooLong" });
    expect(validateCheckoutAddress({ ...address, streetNumber: "1".repeat(CHECKOUT_LIMITS.streetNumber + 1) })).toEqual({ streetNumber: "tooLong" });
    for (const [field, value] of [["fullName", "   "], ["street", "x".repeat(121)], ["city", "x".repeat(81)], ["streetNumber", "1".repeat(13)]] as const) {
      const parsed = checkoutFormSchema.safeParse({ ...form, [field]: value });
      expect(parsed.success, field).toBe(false);
      if (!parsed.success) expect(invalidFormFields(parsed.error)).toEqual([field]);
    }
  });

  it("Slovenian postal codes run 1000–9999 (QA T3-A1)", () => {
    expect(isValidPostalCode("SI", "0999")).toBe(false);
    expect(isValidPostalCode("SI", "1000")).toBe(true);
    expect(isValidPostalCode("SI", "9999")).toBe(true);
    expect(validateCheckoutAddress({ ...address, postalCode: "0999" })).toEqual({ postalCode: "invalid" });
    expect(validateCheckoutAddress({ ...address, postalCode: " " })).toEqual({ postalCode: "required" });
    expect(checkoutFormSchema.safeParse({ ...form, postalCode: "0999" }).success).toBe(false);
  });

  it("maps the server's field paths back onto the wizard, ignoring the rest", () => {
    expect(fieldErrorsFromPaths(["phone", "fullName", "quoteToken", "provider"])).toEqual({ phone: "invalid", fullName: "invalid" });
    expect(fieldErrorsFromPaths([])).toEqual({});
  });
});

describe("saved address → street and house number (QA M12)", () => {
  it.each([
    ["Čopova ulica 12", { street: "Čopova ulica", streetNumber: "12" }],
    ["Trg 1a", { street: "Trg", streetNumber: "1a" }],
    ["Slovenska cesta 5/3", { street: "Slovenska cesta", streetNumber: "5/3" }],
    ["Brez številke", { street: "Brez številke", streetNumber: "" }],
    ["  Ulica 7  ", { street: "Ulica", streetNumber: "7" }],
  ])("splits %j", (line, expected) => {
    expect(splitStreetLine(line)).toEqual(expected);
  });
});
