import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn(),
  send: vi.fn(), trackingUrl: vi.fn(), methods: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { order: {
  updateMany: mocks.updateMany, findUniqueOrThrow: mocks.findUniqueOrThrow,
  update: mocks.update, findMany: mocks.findMany,
} } }));
vi.mock("@/lib/email/mailer", () => ({ sendOrderShippedEmail: mocks.send }));
vi.mock("@/lib/tracking", () => ({
  trackingUrl: mocks.trackingUrl,
  getShippingMethods: mocks.methods,
  deliveryEstimate: (stored: string | null, methods: Array<{ label: string; estimate: string }>) =>
    methods.find((method) => method.label === stored)?.estimate ?? null,
}));

import { deliverOrderShipped, retryPendingShippedEmails } from "@/lib/orders/shipped-delivery";

const shippedOrder = {
  id: "order-1", status: "SHIPPED", carrier: "GLS", trackingNumber: "GLS12345678",
  shippingMethod: "GLS — paketna dostava", email: "buyer@example.test", anonymizedAt: null as Date | null,
};

describe("durable shipped-notification delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue(shippedOrder);
    mocks.update.mockResolvedValue({});
    mocks.send.mockResolvedValue({});
    mocks.trackingUrl.mockResolvedValue("https://gls.example/GLS12345678");
    mocks.methods.mockResolvedValue([{ label: "GLS — paketna dostava", estimate: "2–3 delovni dnevi" }]);
  });

  it("sends the carrier link and estimate, then marks the notification sent", async () => {
    expect(await deliverOrderShipped("order-1")).toBe(true);
    expect(mocks.trackingUrl).toHaveBeenCalledWith("GLS", "GLS12345678");
    expect(mocks.send).toHaveBeenCalledWith(shippedOrder, { trackingLink: "https://gls.example/GLS12345678", estimate: "2–3 delovni dnevi" });
    expect(mocks.update).toHaveBeenLastCalledWith({
      where: { id: "order-1" },
      data: { shippedEmailPending: false, shippedEmailSentAt: expect.any(Date), shippedEmailLeaseUntil: null, shippedEmailLastError: null },
    });
  });

  it("keeps a failed SMTP delivery retryable without leaking the recipient", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.send.mockRejectedValueOnce(new Error("SMTP recipient buyer@example.test rejected"));
      expect(await deliverOrderShipped("order-1")).toBe(false);
      expect(mocks.update).toHaveBeenLastCalledWith({
        where: { id: "order-1" },
        data: { shippedEmailLeaseUntil: null, shippedEmailLastError: "Error" },
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("buyer@example.test");
      expect(await deliverOrderShipped("order-1")).toBe(true);
      expect(mocks.send).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it("does not send when another worker already holds the lease", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await Promise.all([deliverOrderShipped("order-1"), deliverOrderShipped("order-1")])).toEqual([true, false]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...shippedOrder, trackingNumber: null },
    { ...shippedOrder, status: "PAID" },
    { ...shippedOrder, status: "CANCELLED" },
    // erased after the shipment was queued (or re-queued later): nothing goes to the placeholder address
    { ...shippedOrder, email: "anonymised-order-1@invalid", anonymizedAt: new Date("2026-09-14T10:00:00Z") },
  ])("clears the pending flag instead of mailing an order that is not shipped with a number: %o", async (row) => {
    mocks.findUniqueOrThrow.mockResolvedValue(row);
    expect(await deliverOrderShipped("order-1")).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith({
      where: { id: "order-1" },
      data: { shippedEmailPending: false, shippedEmailLeaseUntil: null },
    });
  });

  it("still notifies a delivered order whose shipment mail never went out", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({ ...shippedOrder, status: "DELIVERED" });
    expect(await deliverOrderShipped("order-1")).toBe(true);
  });

  it("the scheduled retry drains persisted pending shipments oldest first", async () => {
    mocks.findMany.mockResolvedValue([{ id: "order-1" }, { id: "order-2" }]);
    expect(await retryPendingShippedEmails()).toEqual({ processed: 2, sent: 2, failed: 0, skipped: 0 });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ shippedEmailPending: true, shippedEmailSentAt: null }),
      orderBy: { shippedAt: "asc" },
    }));
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});
