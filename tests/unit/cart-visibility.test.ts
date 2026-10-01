import { describe, expect, it } from "vitest";
import { PURCHASABLE_PRODUCT_WHERE, variantIsPurchasable } from "@/lib/cart/visibility";

describe("variantIsPurchasable (catalog visibility rule)", () => {
  it("ACTIVE + non-deal → purchasable", () => {
    expect(variantIsPurchasable({ status: "ACTIVE", hiddenDeal: false, bundle: null })).toBe(true);
  });

  it.each(["DRAFT", "ARCHIVED"] as const)("rejects %s products", (status) => {
    expect(variantIsPurchasable({ status, hiddenDeal: false, bundle: null })).toBe(false);
  });

  it("rejects hidden deal SKUs even when ACTIVE", () => {
    expect(variantIsPurchasable({ status: "ACTIVE", hiddenDeal: true, bundle: null })).toBe(false);
  });

  it("sells a fixed bundle only while its definition is active (QA M5)", () => {
    expect(variantIsPurchasable({ status: "ACTIVE", hiddenDeal: false, bundle: { active: true } })).toBe(true);
    expect(variantIsPurchasable({ status: "ACTIVE", hiddenDeal: false, bundle: { active: false } })).toBe(false);
    // the product status still decides first
    expect(variantIsPurchasable({ status: "DRAFT", hiddenDeal: false, bundle: { active: true } })).toBe(false);
  });
});

describe("PURCHASABLE_PRODUCT_WHERE (the same rule as a query)", () => {
  it("asks for ACTIVE, non-deal products that are no bundle or an active one", () => {
    expect(PURCHASABLE_PRODUCT_WHERE).toEqual({
      status: "ACTIVE",
      hiddenDeal: false,
      OR: [{ bundle: null }, { bundle: { active: true } }],
    });
  });
});
