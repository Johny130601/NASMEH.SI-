import { beforeEach, describe, expect, it, vi } from "vitest";

/** Backorder rule (Phase 7 step 3): a variant flagged allowBackorder stays purchasable at zero stock. */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), auth: vi.fn(), addToCart: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { variant: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/cart/server", () => ({ addToCart: mocks.addToCart, removeLine: vi.fn(), setLineQuantity: vi.fn() }));

import { addToCartAction } from "@/app/(storefront)/actions/cart";

const variantId = "cmf0variant00000000000001";
const variant = (stock: number, allowBackorder: boolean) => ({
  id: variantId, maxCartQuantity: 5, stock, allowBackorder, product: { status: "ACTIVE", hiddenDeal: false },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(null);
  // addToCart reports the units it actually applied, so a silent cap cannot answer ok (§7.1).
  mocks.addToCart.mockResolvedValue({ lines: [{ quantity: 1 }], addedQuantity: 1 });
});

describe("addToCartAction stock rule", () => {
  it("refuses a sold-out variant without backorders", async () => {
    mocks.findUnique.mockResolvedValue(variant(0, false));
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: false, count: 0 });
    expect(mocks.addToCart).not.toHaveBeenCalled();
  });

  it("accepts a sold-out variant that allows backorders and a stocked one", async () => {
    mocks.findUnique.mockResolvedValue(variant(0, true));
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 1, addedQuantity: 1 });
    // a backorderable variant keeps its per-line cap at zero stock
    expect(mocks.addToCart).toHaveBeenLastCalledWith(null, { variantId, quantity: 1 }, 5);
    mocks.findUnique.mockResolvedValue(variant(3, false));
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 1, addedQuantity: 1 });
    expect(mocks.addToCart).toHaveBeenCalledTimes(2);
    // a stocked one takes no more than its stock, the cap the cart reads it back under (QA C2-F16)
    expect(mocks.addToCart).toHaveBeenLastCalledWith(null, { variantId, quantity: 1 }, 3);
  });

  it("still refuses variants of unpurchasable products", async () => {
    mocks.findUnique.mockResolvedValue({ ...variant(5, true), product: { status: "DRAFT", hiddenDeal: false } });
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: false, count: 0 });
  });
});
