import { describe, expect, it } from "vitest";
import { collectInventoryRequirements } from "@/lib/orders/inventory";

describe("order inventory requirements", () => {
  it("aggregates standalone quantities and multiplied bundle components", () => {
    expect(collectInventoryRequirements([
      { variantId: "mouthwash", quantity: 2 },
      { variantId: "bundle", quantity: 3, properties: {
        bundleComponents: [{ variantId: "mouthwash", quantity: 2 }, { variantId: "strips", quantity: 1 }],
      } },
    ])).toEqual({
      invalidSnapshot: false,
      deductions: [{ variantId: "mouthwash", quantity: 8 }, { variantId: "strips", quantity: 3 }],
    });
  });

  it("orders all inventory locks consistently across different cart orders", () => {
    const one = { variantId: "z", quantity: 1 };
    const two = { variantId: "a", quantity: 1 };
    expect(collectInventoryRequirements([one, two])).toEqual(collectInventoryRequirements([two, one]));
  });

  it.each([
    [],
    [{ variantId: null, quantity: 1 }],
    [{ variantId: "a", quantity: 0 }],
    [{ variantId: "a", quantity: -1 }],
    [{ variantId: "a", quantity: 1.5 }],
    [{ variantId: "bundle", quantity: 1, properties: { bundleComponents: [] } }],
    [{ variantId: "bundle", quantity: 1, properties: { bundleComponents: [{ variantId: "a", quantity: -2 }] } }],
    [{ variantId: "bundle", quantity: 1, properties: { bundleComponents: "corrupt" } }],
    [{ variantId: "a", quantity: 2_147_483_648 }],
  ])("rejects unfulfillable or corrupt snapshots: %j", (...items) => {
    expect(collectInventoryRequirements(items).invalidSnapshot).toBe(true);
  });
});
