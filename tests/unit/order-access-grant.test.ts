import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderAccessCookieName, verifyOrderReceipt } from "@/lib/orders/access-token";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), cookies: vi.fn(), order: vi.fn(), cart: vi.fn(), lines: vi.fn(), env: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/env", () => ({ getEnv: mocks.env }));
vi.mock("@/lib/cart/server", () => ({ getCartLines: mocks.lines }));
vi.mock("@/lib/db", () => ({ db: { order: { findUnique: mocks.order }, cart: { findUnique: mocks.cart } } }));

import { captureOrderCart, grantOrderAccess } from "@/lib/orders/access";

const secret = "unit-receipt-signing-secret-long-enough";
const order = { number: "NS-2026-00001", checkoutKey: "a".repeat(32), userId: "owner" };
const values = new Map<string, string>();
const setCookie = vi.fn((name: string, value: string) => values.set(name, value));
const initialVersion = new Date("2026-09-09T12:00:00Z");

beforeEach(() => {
  vi.resetAllMocks(); values.clear();
  mocks.auth.mockResolvedValue({ user: { id: "owner", role: "CUSTOMER" } });
  mocks.env.mockReturnValue({ AUTH_SECRET: secret });
  mocks.cookies.mockResolvedValue({ get: (name: string) => values.has(name) ? { value: values.get(name) } : undefined, set: setCookie });
  mocks.order.mockResolvedValue(order);
  mocks.cart.mockResolvedValue({ id: "cart", updatedAt: initialVersion });
  mocks.lines.mockResolvedValue([{ variantId: "v1", quantity: 1 }]);
  setCookie.mockImplementation((name, value) => values.set(name, value));
});

function receipt() {
  return verifyOrderReceipt(values.get(orderAccessCookieName(order.number)), order, secret, new Date());
}

describe("checkout grants retain the original cart snapshot", () => {
  it("allows cleanup only when the pre-PSP cart remains unchanged", async () => {
    const expectedCart = await captureOrderCart();
    expect(await grantOrderAccess(order.number, order.checkoutKey, { allowCartClear: true, expectedCart })).toBe(true);
    expect(receipt()?.allowCartClear).toBe(true);
    expect(setCookie).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
  });
  it("never binds a new identical cart assembled during a provider network request", async () => {
    const expectedCart = await captureOrderCart();
    mocks.cart.mockResolvedValue({ id: "cart", updatedAt: new Date(initialVersion.getTime() + 1) });
    expect(await grantOrderAccess(order.number, order.checkoutKey, { allowCartClear: true, expectedCart })).toBe(true);
    expect(receipt()?.allowCartClear).toBe(false);
    expect(receipt()?.cartVersion).toBe(expectedCart.cartVersion);
  });
  it("detects a mutation during the initial snapshot read", async () => {
    mocks.cart.mockResolvedValueOnce({ id: "cart", updatedAt: initialVersion })
      .mockResolvedValue({ id: "cart", updatedAt: new Date(initialVersion.getTime() + 1) });
    const expectedCart = await captureOrderCart();
    expect(expectedCart.stable).toBe(false);
    await grantOrderAccess(order.number, order.checkoutKey, { allowCartClear: true, expectedCart });
    expect(receipt()?.allowCartClear).toBe(false);
  });
  it("grants read-only recovery without a creation-time snapshot", async () => {
    await grantOrderAccess(order.number, order.checkoutKey, { allowCartClear: true });
    expect(receipt()?.allowCartClear).toBe(false);
  });
  it("preserves the original receipt on retries and refuses another account", async () => {
    const expectedCart = await captureOrderCart();
    await grantOrderAccess(order.number, order.checkoutKey, { allowCartClear: true, expectedCart });
    const original = values.get(orderAccessCookieName(order.number));
    mocks.cart.mockResolvedValue({ id: "cart", updatedAt: new Date(initialVersion.getTime() + 1) });
    await grantOrderAccess(order.number, order.checkoutKey);
    expect(values.get(orderAccessCookieName(order.number))).toBe(original);
    values.clear();
    mocks.auth.mockResolvedValue({ user: { id: "different", role: "CUSTOMER" } });
    expect(await grantOrderAccess(order.number, order.checkoutKey)).toBe(false);
    expect(values.size).toBe(0);
  });
});
