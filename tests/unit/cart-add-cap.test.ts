import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Per-line cap (AGENTS §5.2): the write clamps to maxCartQuantity silently,
 * so it reports the units it really added and the action refuses to confirm
 * an add that changed nothing — a green "Dodano" over an unchanged cart is a
 * false confirmation to a shopper.
 */

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  findUnique: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { variant: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-test-guest-cart-secret" }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined),
    set: (name: string, value: string) => void mocks.jar.set(name, value),
    delete: (name: string) => void mocks.jar.delete(name),
  }),
}));

import { addToCartAction } from "@/app/(storefront)/actions/cart";
import { addToCart } from "@/lib/cart/server";

const variantId = "cmf0variant00000000000001";

beforeEach(() => {
  mocks.jar.clear();
  mocks.auth.mockResolvedValue(null);
  mocks.findUnique.mockResolvedValue({
    id: variantId,
    maxCartQuantity: 2,
    stock: 10,
    allowBackorder: false,
    product: { status: "ACTIVE", hiddenDeal: false },
  });
});

describe("addToCart (guest cookie) reports what it added", () => {
  it("counts the units that fit, and none once the line sits at the cap", async () => {
    expect(await addToCart(null, { variantId, quantity: 1 }, 2)).toEqual({
      lines: [{ variantId, quantity: 1 }],
      addedQuantity: 1,
    });

    // only one unit of the five asked for fits under the cap
    expect(await addToCart(null, { variantId, quantity: 5 }, 2)).toEqual({
      lines: [{ variantId, quantity: 2 }],
      addedQuantity: 1,
    });

    // the line is full: the cart is untouched and nothing was added
    expect(await addToCart(null, { variantId, quantity: 1 }, 2)).toEqual({
      lines: [{ variantId, quantity: 2 }],
      addedQuantity: 0,
    });
  });

  it("clamps a first add above the cap and counts only what it stored", async () => {
    expect(await addToCart(null, { variantId, quantity: 9 }, 2)).toEqual({
      lines: [{ variantId, quantity: 2 }],
      addedQuantity: 2,
    });
  });
});

describe("addToCartAction confirms only a real add", () => {
  it("answers capped — never ok — for the click that changed nothing", async () => {
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 1, addedQuantity: 1 });
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 2, addedQuantity: 1 });
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({
      ok: false,
      count: 2,
      capped: true,
    });
  });

  it("reports the units the cap let through, not the ones asked for", async () => {
    // the button announces and tracks this figure: a "3 ×" line over a cart
    // that grew by 2 is the same false confirmation as a green state over none
    expect(await addToCartAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 1, addedQuantity: 1 });
    expect(await addToCartAction({ variantId, quantity: 3 })).toEqual({ ok: true, count: 2, addedQuantity: 1 });
  });

  it("keeps a refusal distinct from a cap, so the button can tell them apart", async () => {
    mocks.findUnique.mockResolvedValue({
      id: variantId,
      maxCartQuantity: 2,
      stock: 0,
      allowBackorder: false,
      product: { status: "ACTIVE", hiddenDeal: false },
    });
    const result = await addToCartAction({ variantId, quantity: 1 });
    expect(result).toEqual({ ok: false, count: 0 });
    expect(result.capped).toBeUndefined();
  });
});
