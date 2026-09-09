import { describe, expect, it } from "vitest";
import {
  buildAddToCartEvent,
  buildBeginCheckoutEvent,
  buildViewItemEvent,
} from "@/lib/analytics";

describe("ecommerce event builders (§3.5)", () => {
  it("view_item with SKU/value/currency", () => {
    expect(
      buildViewItemEvent({
        sku: "NAS-TRK-14",
        title: "Belilni trakci",
        priceCents: 3499,
      }),
    ).toEqual({
      event: "view_item",
      ecommerce: {
        currency: "EUR",
        value: 34.99,
        items: [
          { item_id: "NAS-TRK-14", item_name: "Belilni trakci", price: 34.99, quantity: 1 },
        ],
      },
    });
  });

  it("add_to_cart carries quantity", () => {
    const event = buildAddToCartEvent({
      sku: "NAS-UST-500",
      title: "Ustna voda",
      priceCents: 1999,
      quantity: 2,
    });
    expect(event.event).toBe("add_to_cart");
    expect(event.ecommerce.value).toBe(39.98);
    expect(event.ecommerce.items[0].quantity).toBe(2);
  });

  it("begin_checkout sums mixed lines", () => {
    const event = buildBeginCheckoutEvent([
      { sku: "NAS-PAK-RUTINA", title: "Paket", priceCents: 4999, quantity: 1 },
      { sku: "NAS-TRK-14", title: "Trakci", priceCents: 3499, quantity: 2 },
    ]);
    expect(event.event).toBe("begin_checkout");
    expect(event.ecommerce.value).toBe(119.97);
    expect(event.ecommerce.items).toHaveLength(2);
  });
});
