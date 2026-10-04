import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA 2026-10-03 T2-02: a reload or Back during payment used to lose the way back to the order
 * just placed; /checkout now offers this browser's (or the signed-in shopper's) unpaid order.
 * Access is the same signed receipt the confirmation page requires — an order number alone,
 * a forged receipt or another shopper's order never surfaces.
 */

const SECRET = "unit-test-order-access-secret-0123456789abcdef";
const mocks = vi.hoisted(() => ({ cookies: [] as Array<{ name: string; value: string }>, auth: vi.fn(), findMany: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => mocks.cookies, get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: SECRET }) }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: mocks.findMany } } }));
vi.mock("@/lib/cart/server", () => ({ getCartLines: vi.fn() }));

import { findUnpaidOrderToResume, UNPAID_ORDER_LOOKBACK_MS } from "@/lib/orders/access";
import { accessHash, orderAccessCookieName, signOrderReceipt } from "@/lib/orders/access-token";

const now = new Date("2026-10-03T12:00:00Z");
const order = { number: "NS-2026-00005", checkoutKey: "a".repeat(32), userId: null, totalCents: 4948 };

function receipt(number = order.number, checkoutKey = order.checkoutKey) {
  return {
    name: orderAccessCookieName(number),
    value: signOrderReceipt({
      v: 1, orderNumber: number, checkoutKeyHash: accessHash(checkoutKey), principal: null, allowCartClear: false,
      cartDigest: "b".repeat(64), cartVersion: "v", expiresAt: now.getTime() + 60_000,
    }, SECRET),
  };
}

beforeEach(() => {
  mocks.cookies = [];
  mocks.auth.mockReset().mockResolvedValue(null);
  mocks.findMany.mockReset().mockResolvedValue([]);
});

describe("the unpaid order /checkout offers back", () => {
  it("finds the order this browser's receipt names, unpaid and recent", async () => {
    mocks.cookies = [{ name: "other", value: "x" }, receipt()];
    mocks.findMany.mockResolvedValue([order]);
    expect(await findUnpaidOrderToResume(now)).toEqual({ number: order.number, totalCents: 4948 });
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({
      status: "PENDING", paidAt: null, createdAt: { gte: new Date(now.getTime() - UNPAID_ORDER_LOOKBACK_MS) },
      OR: [{ number: { in: [order.number] } }],
    });
  });

  it("refuses a receipt that does not verify against the order", async () => {
    mocks.cookies = [receipt(order.number, "c".repeat(32))];
    mocks.findMany.mockResolvedValue([order]);
    expect(await findUnpaidOrderToResume(now)).toBeNull();
  });

  it("ignores a cookie whose name does not match the order it names", async () => {
    mocks.cookies = [{ name: orderAccessCookieName("NS-2026-00099"), value: receipt().value }];
    mocks.findMany.mockResolvedValue([order]);
    expect(await findUnpaidOrderToResume(now)).toBeNull();
    expect(mocks.findMany.mock.calls[0][0].where.OR).toEqual([{ number: { in: [] } }]);
  });

  it("offers a signed-in shopper their own unpaid order without a receipt, never someone else's", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    mocks.findMany.mockResolvedValue([{ ...order, userId: "u2" }, { ...order, number: "NS-2026-00006", userId: "u1" }]);
    expect(await findUnpaidOrderToResume(now)).toEqual({ number: "NS-2026-00006", totalCents: 4948 });
    expect(mocks.findMany.mock.calls[0][0].where.OR).toEqual([{ number: { in: [] } }, { userId: "u1" }]);
  });

  it("answers null when nothing is unpaid", async () => {
    mocks.cookies = [receipt()];
    expect(await findUnpaidOrderToResume(now)).toBeNull();
  });
});
