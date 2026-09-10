import type { Order } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), queryRaw: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
  methods: vi.fn(), deliver: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction, order: {} } }));
vi.mock("@/lib/tracking", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tracking")>()),
  getShippingMethods: mocks.methods,
}));
vi.mock("@/lib/orders/shipped-delivery", () => ({ deliverOrderShipped: mocks.deliver }));
vi.mock("@/lib/orders/confirmation-delivery", () => ({ deliverOrderConfirmation: vi.fn() }));
vi.mock("@/lib/orders/status-mail", () => ({ notifyOrderStatus: vi.fn().mockResolvedValue(true) }));

import { markOrderDelivered, markOrderShipped } from "@/lib/orders/transitions";

const tx = { $queryRaw: mocks.queryRaw, order: { findUnique: mocks.findUnique, update: mocks.update } };
const ship = { carrier: "GLS", trackingNumber: "ABCDEFG1", actor: "job" };

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1", number: "NS-2026-00007", status: "PAID", shippedAt: null, timeline: [],
    carrier: null, trackingNumber: null, ...overrides,
  } as Order;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  mocks.queryRaw.mockResolvedValue([{ id: "order-1" }]);
  mocks.update.mockResolvedValue({});
  mocks.deliver.mockResolvedValue(true);
  mocks.methods.mockResolvedValue([
    { id: "gls", carrier: "GLS", label: "GLS — paketna dostava", priceCents: 490, estimate: "2–3 delovni dnevi", countries: ["SI"] },
    { id: "ps-standard", carrier: "Pošta Slovenije", label: "Pošta Slovenije — standard", priceCents: 390, estimate: "2–4 delovna dneva", countries: ["SI"] },
  ]);
});
afterEach(() => vi.restoreAllMocks());

describe("markOrderShipped", () => {
  it("ships a paid order with a normalised number, stamps shippedAt and queues the notification", async () => {
    mocks.findUnique.mockResolvedValue(order());
    const result = await markOrderShipped("order-1", { carrier: " GLS ", trackingNumber: " gls 1234 5678 ", actor: "admin-1" });
    expect(result).toEqual({ ok: true, orderNumber: "NS-2026-00007", status: "SHIPPED" });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    const data = mocks.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: "SHIPPED", carrier: "GLS", trackingNumber: "GLS12345678",
      shippedEmailPending: true, shippedEmailLeaseUntil: null, shippedEmailLastError: null,
    });
    expect(data.shippedAt).toBeInstanceOf(Date);
    expect(data.timeline).toEqual([expect.objectContaining({ event: "shipped", detail: "GLS:admin-1" })]);
    expect(mocks.deliver).toHaveBeenCalledWith("order-1");
  });

  it("keeps an existing shippedAt when a processing order ships", async () => {
    const first = new Date("2026-09-01T10:00:00Z");
    mocks.findUnique.mockResolvedValue(order({ status: "PROCESSING", shippedAt: first }));
    expect((await markOrderShipped("order-1", ship)).ok).toBe(true);
    expect(mocks.update.mock.calls[0][0].data.shippedAt).toBe(first);
  });

  it.each(["SHIPPED", "DELIVERED", "PENDING", "CANCELLED", "REFUNDED"] as const)("refuses to ship a %s order without touching it", async (status) => {
    mocks.findUnique.mockResolvedValue(order({ status }));
    expect(await markOrderShipped("order-1", ship)).toEqual({ ok: false, reason: "invalid_transition" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed tracking number before opening a transaction", async () => {
    for (const trackingNumber of ["", "   ", "abc", "bad number!", "x".repeat(41)]) {
      expect(await markOrderShipped("order-1", { ...ship, trackingNumber })).toEqual({ ok: false, reason: "missing_tracking" });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a carrier the store does not ship with", async () => {
    expect(await markOrderShipped("order-1", { ...ship, carrier: "DHL" })).toEqual({ ok: false, reason: "unknown_carrier" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("reports an unknown order", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await markOrderShipped("missing", ship)).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps the shipment when the notification cannot be sent right now", async () => {
    mocks.findUnique.mockResolvedValue(order());
    mocks.deliver.mockRejectedValue(new Error("smtp down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await markOrderShipped("order-1", ship)).ok).toBe(true);
    expect(log).toHaveBeenCalledWith("Shipped notification remains pending", expect.any(Error));
  });
});

describe("markOrderDelivered", () => {
  it("delivers a shipped order and records the actor", async () => {
    mocks.findUnique.mockResolvedValue(order({ status: "SHIPPED", carrier: "GLS", trackingNumber: "GLS12345678" }));
    expect(await markOrderDelivered("order-1", { actor: "carrier-scan" })).toEqual({ ok: true, orderNumber: "NS-2026-00007", status: "DELIVERED" });
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      status: "DELIVERED",
      timeline: [expect.objectContaining({ event: "delivered", detail: "carrier-scan" })],
    });
  });

  it.each(["PAID", "PROCESSING", "DELIVERED", "PENDING", "CANCELLED", "REFUNDED"] as const)("refuses to deliver a %s order", async (status) => {
    mocks.findUnique.mockResolvedValue(order({ status }));
    expect(await markOrderDelivered("order-1", { actor: "job" })).toEqual({ ok: false, reason: "invalid_transition" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports an unknown order", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await markOrderDelivered("missing", { actor: "job" })).toEqual({ ok: false, reason: "not_found" });
  });
});
