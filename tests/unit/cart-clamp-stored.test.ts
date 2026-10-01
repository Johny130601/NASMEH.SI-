import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA C2-F16 follow-up: hydration reads a stored quantity back under its cap,
 * and the order is built from that. Placing the order lowers the stored cart
 * to the same quantities first, so the receipt's cart fingerprint equals the
 * order's and the paid cart is cleared (lib/orders/post-purchase.ts compares
 * the two).
 */

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  auth: vi.fn(),
  cartFind: vi.fn(),
  updateMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-test-guest-cart-secret" }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined),
    set: (name: string, value: string) => void mocks.jar.set(name, value),
    delete: (name: string) => void mocks.jar.delete(name),
  }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    cart: { findUnique: mocks.cartFind },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({ $queryRaw: mocks.queryRaw, cartItem: { updateMany: mocks.updateMany } }),
  },
}));

import { clampCartLines, getCartLines, writeGuestCart } from "@/lib/cart/server";
import { GUEST_CART_COOKIE } from "@/lib/cart/codec";
import { captureOrderCart } from "@/lib/orders/access";
import { cartDigest } from "@/lib/orders/access-token";

const strips = "cmf0variant00000000000001";
const serum = "cmf0variant00000000000002";

beforeEach(() => {
  mocks.jar.clear();
  mocks.auth.mockReset();
  mocks.auth.mockResolvedValue(null);
  mocks.cartFind.mockReset();
  mocks.updateMany.mockReset();
  mocks.queryRaw.mockReset();
  mocks.queryRaw.mockResolvedValue([{ id: "cart-1" }]);
});

describe("clampCartLines (guest cookie)", () => {
  it("lowers only the lines above their cap, and the snapshot then matches the order's quantities", async () => {
    await writeGuestCart([{ variantId: strips, quantity: 5 }, { variantId: serum, quantity: 1 }]);
    const caps = new Map([[strips, 2], [serum, 1]]);

    expect(await clampCartLines(null, caps)).toBe(true);
    expect(await getCartLines(null)).toEqual([{ variantId: strips, quantity: 2 }, { variantId: serum, quantity: 1 }]);

    const orderItems = [{ variantId: strips, quantity: 2 }, { variantId: serum, quantity: 1 }];
    const snapshot = await captureOrderCart();
    expect(snapshot.cartDigest).toBe(cartDigest(orderItems));
    expect(snapshot.stable).toBe(true);
  });

  it("writes nothing when every line already fits, so the cart version stays", async () => {
    await writeGuestCart([{ variantId: strips, quantity: 2 }]);
    const before = mocks.jar.get(GUEST_CART_COOKIE);
    expect(await clampCartLines(null, new Map([[strips, 2]]))).toBe(false);
    expect(await clampCartLines(null, new Map())).toBe(false);
    expect(mocks.jar.get(GUEST_CART_COOKIE)).toBe(before);
  });

  it("never raises a line or touches one without a cap", async () => {
    await writeGuestCart([{ variantId: strips, quantity: 1 }, { variantId: serum, quantity: 4 }]);
    expect(await clampCartLines(null, new Map([[strips, 5]]))).toBe(false);
    expect(await getCartLines(null)).toEqual([{ variantId: strips, quantity: 1 }, { variantId: serum, quantity: 4 }]);
  });
});

describe("clampCartLines (signed-in DB cart)", () => {
  it("updates only the lines above their cap, under the cart lock", async () => {
    mocks.cartFind.mockResolvedValue({ items: [{ variantId: strips, quantity: 5 }, { variantId: serum, quantity: 1 }] });
    expect(await clampCartLines("user-1", new Map([[strips, 2], [serum, 1]]))).toBe(true);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { cartId: "cart-1", variantId: strips, quantity: { gt: 2 } },
      data: { quantity: 2 },
    });
  });

  it("opens no transaction when nothing is above its cap", async () => {
    mocks.cartFind.mockResolvedValue({ items: [{ variantId: strips, quantity: 2 }] });
    expect(await clampCartLines("user-1", new Map([[strips, 2]]))).toBe(false);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
