import type { Order } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), queryRaw: vi.fn(), findUnique: vi.fn(), update: vi.fn(), notify: vi.fn(), methods: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction, order: {} } }));
vi.mock("@/lib/orders/status-mail", () => ({ notifyOrderStatus: mocks.notify }));
vi.mock("@/lib/orders/shipped-delivery", () => ({ deliverOrderShipped: vi.fn() }));
vi.mock("@/lib/orders/confirmation-delivery", () => ({ deliverOrderConfirmation: vi.fn() }));
vi.mock("@/lib/tracking", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/tracking")>()), getShippingMethods: mocks.methods }));

import { markOrderDelivered, markOrderProcessing } from "@/lib/orders/transitions";

const tx = { $queryRaw: mocks.queryRaw, order: { findUnique: mocks.findUnique, update: mocks.update } };
const order = (overrides: Partial<Order> = {}): Order => ({ id: "order-1", number: "NS-2026-00007", status: "PAID", refundRequired: false, timeline: [], ...overrides } as Order);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  mocks.queryRaw.mockResolvedValue([{ id: "order-1" }]);
  mocks.update.mockResolvedValue({});
  mocks.notify.mockResolvedValue(true);
});

describe("markOrderProcessing", () => {
  it("moves a paid order to PROCESSING, records the actor and mails the customer", async () => {
    mocks.findUnique.mockResolvedValue(order());
    expect(await markOrderProcessing("order-1", { actor: "owner@nasmeh.si" })).toEqual({ ok: true, orderNumber: "NS-2026-00007", status: "PROCESSING" });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: "PROCESSING", timeline: [expect.objectContaining({ event: "processing", detail: "owner@nasmeh.si" })] });
    expect(mocks.notify).toHaveBeenCalledWith("order-1", "processing");
  });

  it.each([{ status: "PROCESSING" }, { status: "SHIPPED" }, { status: "PENDING" }, { status: "PAID", refundRequired: true }])("refuses %o", async (overrides) => {
    mocks.findUnique.mockResolvedValue(order(overrides as Partial<Order>));
    expect(await markOrderProcessing("order-1", { actor: "x" })).toEqual({ ok: false, reason: "invalid_transition" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("reports a missing order", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await markOrderProcessing("nope", { actor: "x" })).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("markOrderDelivered notification", () => {
  it("mails the customer after a successful delivery transition only", async () => {
    mocks.findUnique.mockResolvedValue(order({ status: "SHIPPED" }));
    expect(await markOrderDelivered("order-1", { actor: "job" })).toMatchObject({ ok: true, status: "DELIVERED" });
    expect(mocks.notify).toHaveBeenCalledWith("order-1", "delivered");
    mocks.notify.mockClear();
    mocks.findUnique.mockResolvedValue(order({ status: "PAID" }));
    expect(await markOrderDelivered("order-1", { actor: "job" })).toEqual({ ok: false, reason: "invalid_transition" });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
