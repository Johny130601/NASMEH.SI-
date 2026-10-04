import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Kupi zdaj" (2026-10-03): the PDP's shortest way to the checkout. The line is
 * raised to at least the quantity asked for, never by it, so a product already
 * in the cart or a second click reaches the checkout as asked, not doubled —
 * and only a line that holds the full quantity answers ok (AGENTS §8.23).
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

import { addToCartAction, buyNowAction } from "@/app/(storefront)/actions/cart";
import { getCartLines } from "@/lib/cart/server";

const variantId = "cmf0variant00000000000001";

function variant(overrides: { maxCartQuantity?: number; stock?: number } = {}) {
  return {
    id: variantId,
    maxCartQuantity: overrides.maxCartQuantity ?? 5,
    stock: overrides.stock ?? 10,
    allowBackorder: false,
    product: { status: "ACTIVE", hiddenDeal: false },
  };
}

beforeEach(() => {
  mocks.jar.clear();
  mocks.auth.mockResolvedValue(null);
  mocks.findUnique.mockResolvedValue(variant());
});

describe("buyNowAction raises the line to the quantity asked for", () => {
  it("adds the units on the first click and nothing on the second", async () => {
    expect(await buyNowAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 1, addedQuantity: 1 });
    expect(await buyNowAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 1, addedQuantity: 0 });
    expect(await getCartLines(null)).toEqual([{ variantId, quantity: 1 }]);
  });

  it("absorbs a product the shopper already added instead of doubling it", async () => {
    expect(await addToCartAction({ variantId, quantity: 1 })).toMatchObject({ ok: true, count: 1 });
    expect(await buyNowAction({ variantId, quantity: 2 })).toEqual({ ok: true, count: 2, addedQuantity: 1 });
    expect(await getCartLines(null)).toEqual([{ variantId, quantity: 2 }]);
  });

  it("never lowers a line that already holds more", async () => {
    expect(await addToCartAction({ variantId, quantity: 3 })).toMatchObject({ ok: true, count: 3 });
    expect(await buyNowAction({ variantId, quantity: 1 })).toEqual({ ok: true, count: 3, addedQuantity: 0 });
    expect(await getCartLines(null)).toEqual([{ variantId, quantity: 3 }]);
  });
});

describe("buyNowAction never carries a short line into the checkout", () => {
  it("answers capped with the units that did land when the cap stops it short", async () => {
    mocks.findUnique.mockResolvedValue(variant({ maxCartQuantity: 2 }));
    expect(await buyNowAction({ variantId, quantity: 3 })).toEqual({ ok: false, count: 2, capped: true, addedQuantity: 2 });
    // the line is full now: the same click adds nothing and still is not ok
    expect(await buyNowAction({ variantId, quantity: 3 })).toEqual({ ok: false, count: 2, capped: true });
  });

  it("stops at the stock as it does at the cap", async () => {
    mocks.findUnique.mockResolvedValue(variant({ stock: 1 }));
    expect(await buyNowAction({ variantId, quantity: 2 })).toEqual({ ok: false, count: 1, capped: true, addedQuantity: 1 });
  });

  it("keeps a refusal distinct from a cap", async () => {
    mocks.findUnique.mockResolvedValue(variant({ stock: 0 }));
    const soldOut = await buyNowAction({ variantId, quantity: 1 });
    // named, so the button says why (QA 2026-10-03 T5-07)
    expect(soldOut).toEqual({ ok: false, count: 0, soldOut: true });
    expect(soldOut.capped).toBeUndefined();

    mocks.findUnique.mockResolvedValue(null);
    expect(await buyNowAction({ variantId, quantity: 1 })).toEqual({ ok: false, count: 0, unavailable: true });
    expect(await buyNowAction({ variantId, quantity: 0 })).toEqual({ ok: false, count: 0 });
    expect(await getCartLines(null)).toEqual([]);
  });
});
