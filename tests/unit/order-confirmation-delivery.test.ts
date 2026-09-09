import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  invoiceData: vi.fn(),
  pdf: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { order: {
  updateMany: mocks.updateMany,
  findUniqueOrThrow: mocks.findUniqueOrThrow,
  update: mocks.update,
  findMany: mocks.findMany,
} } }));
vi.mock("@/lib/email/mailer", () => ({ sendOrderConfirmationEmail: mocks.send }));
vi.mock("@/lib/invoice/data", () => ({ buildInvoiceDataWithCompany: mocks.invoiceData }));
vi.mock("@/lib/invoice/pdf", () => ({ generateInvoicePdf: mocks.pdf }));

import { deliverOrderConfirmation, retryPendingOrderConfirmations } from "@/lib/orders/confirmation-delivery";

describe("durable order confirmation delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "order-1", status: "PAID", stockDeducted: true, refundRequired: false, items: [],
    });
    mocks.update.mockResolvedValue({});
    mocks.invoiceData.mockResolvedValue({});
    mocks.pdf.mockResolvedValue(Buffer.from("invoice"));
    mocks.send.mockResolvedValue({});
  });

  it("keeps failed SMTP delivery retryable and marks it sent only after a successful retry", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.send.mockRejectedValueOnce(new Error("temporary SMTP failure"));
      expect(await deliverOrderConfirmation("order-1")).toBe(false);
      expect(mocks.update).toHaveBeenLastCalledWith({
        where: { id: "order-1" },
        data: { confirmationEmailLeaseUntil: null, confirmationEmailLastError: "Error" },
      });
      expect(await deliverOrderConfirmation("order-1")).toBe(true);
      expect(mocks.update).toHaveBeenLastCalledWith({
        where: { id: "order-1" },
        data: {
          confirmationEmailPending: false,
          confirmationEmailSentAt: expect.any(Date),
          confirmationEmailLeaseUntil: null,
          confirmationEmailLastError: null,
        },
      });
      expect(mocks.send).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it("does not send when another worker already claimed delivery", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await Promise.all([
      deliverOrderConfirmation("order-1"), deliverOrderConfirmation("order-1"),
    ])).toEqual([true, false]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("does not send the ordinary confirmation for a captured stockout", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({ status: "CANCELLED", refundRequired: true, stockDeducted: false });
    expect(await deliverOrderConfirmation("order-1")).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("the scheduled retry drains persisted pending orders", async () => {
    mocks.findMany.mockResolvedValue([{ id: "order-1" }, { id: "order-2" }]);
    expect(await retryPendingOrderConfirmations()).toEqual({ processed: 2, sent: 2, failed: 0, skipped: 0 });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ confirmationEmailPending: true, confirmationEmailSentAt: null }),
    }));
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("distinguishes delivery failures from already-claimed and ineligible skips", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.findMany.mockResolvedValue([{ id: "claimed" }, { id: "failed" }, { id: "sent" }, { id: "cancelled" }]);
      mocks.updateMany.mockResolvedValueOnce({ count: 0 });
      mocks.findUniqueOrThrow.mockResolvedValueOnce({ status: "PAID", stockDeducted: true })
        .mockResolvedValueOnce({ status: "PAID", stockDeducted: true })
        .mockResolvedValueOnce({ status: "CANCELLED", stockDeducted: false });
      mocks.send.mockRejectedValueOnce(new Error("SMTP recipient private@example.test rejected"));
      expect(await retryPendingOrderConfirmations()).toEqual({ processed: 4, sent: 1, failed: 1, skipped: 2 });
      expect(mocks.send).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith("Order confirmation remains queued");
      expect(JSON.stringify(log.mock.calls)).not.toContain("private@example.test");
      expect(log.mock.calls[0]).toHaveLength(1);
    } finally { log.mockRestore(); }
  });
});
