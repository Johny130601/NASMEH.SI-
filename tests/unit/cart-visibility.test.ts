import { describe, expect, it } from "vitest";
import { variantIsPurchasable } from "@/lib/cart/visibility";

describe("variantIsPurchasable (catalog visibility rule)", () => {
  it("ACTIVE + non-deal → purchasable", () => {
    expect(variantIsPurchasable({ status: "ACTIVE", hiddenDeal: false })).toBe(true);
  });

  it.each(["DRAFT", "ARCHIVED"] as const)("rejects %s products", (status) => {
    expect(variantIsPurchasable({ status, hiddenDeal: false })).toBe(false);
  });

  it("rejects hidden deal SKUs even when ACTIVE", () => {
    expect(variantIsPurchasable({ status: "ACTIVE", hiddenDeal: true })).toBe(false);
  });
});
