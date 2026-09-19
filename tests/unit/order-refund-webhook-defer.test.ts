import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 review pass: an operator refund between its provider call and its
 * local apply must not be booked twice. The provider's refund webhook is
 * deferred while a Refund row for that order is still PENDING; the provider
 * retries it, and by then the row is COMPLETED or closed.
 */

const mocks = vi.hoisted(() => ({
  tx: {
    processedEvent: { create: vi.fn() },
    order: { findFirst: vi.fn(), update: vi.fn() },
    refund: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: { $transaction: (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx) },
}));
vi.mock("@/lib/turnstile", () => ({ isTestMode: () => false }));
vi.mock("@/lib/settings", () => ({ getCompany: vi.fn(), getInvoiceFooter: vi.fn() }));
vi.mock("@/lib/orders/inventory", () => ({ deductOrderInventory: vi.fn() }));
vi.mock("@/lib/orders/confirmation-delivery", () => ({ deliverOrderConfirmation: vi.fn() }));
vi.mock("@/lib/orders/shipped-delivery", () => ({ deliverOrderShipped: vi.fn() }));
vi.mock("@/lib/orders/status-mail", () => ({ notifyOrderStatus: vi.fn() }));

import { markRefunded } from "@/lib/orders/transitions";

const paidOrder = () => ({
  id: "order-1", number: "NS-2026-00008", status: "PAID", currency: "EUR",
  totalCents: 10_000, refundedCents: 0, timeline: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tx.processedEvent.create.mockResolvedValue({});
  mocks.tx.order.findFirst.mockResolvedValue(paidOrder());
  mocks.tx.order.update.mockResolvedValue({});
  mocks.tx.refund.findFirst.mockResolvedValue(null);
  mocks.tx.$queryRaw.mockResolvedValue([]);
});

describe("markRefunded defers while an operator refund is in flight", () => {
  it("books the refund when no operator refund is pending", async () => {
    const result = await markRefunded("stripe", "evt-1", "pi_1", { amountCents: 6_000, currency: "EUR", totalRefundedCents: 6_000 });
    expect(result).toEqual({ outcome: "ignored" });
    expect(mocks.tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ refundedCents: 6_000 }),
    }));
  });

  it("defers and writes nothing while a Refund row for that order is still PENDING", async () => {
    mocks.tx.refund.findFirst.mockResolvedValue({ id: "refund-1" });

    const result = await markRefunded("stripe", "evt-2", "pi_1", { amountCents: 6_000, currency: "EUR", totalRefundedCents: 6_000 });

    expect(result).toEqual({ outcome: "refund_in_flight" });
    expect(mocks.tx.order.update).not.toHaveBeenCalled();
    expect(mocks.tx.refund.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { orderId: "order-1", status: "PENDING" },
      select: { id: true },
    }));
  });

  it("still refuses a mismatched currency before it looks at refunds in flight", async () => {
    const result = await markRefunded("stripe", "evt-3", "pi_1", { amountCents: 6_000, currency: "USD", totalRefundedCents: 6_000 });
    expect(result).toEqual({ outcome: "payment_mismatch" });
    expect(mocks.tx.order.update).not.toHaveBeenCalled();
  });
});
