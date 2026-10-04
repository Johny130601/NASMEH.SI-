import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 9 step 4: the paid transition freezes the invoice as issued and drops the abandoned-checkout capture. */

const mocks = vi.hoisted(() => ({
  tx: {
    processedEvent: { create: vi.fn() },
    order: { findFirst: vi.fn(), update: vi.fn() },
    orderItem: { findMany: vi.fn() },
    abandonedCheckout: { deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
  postCommitFind: vi.fn(),
  company: vi.fn(),
  footer: vi.fn(),
  inventory: vi.fn(),
  deliver: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx),
    order: { findFirst: mocks.postCommitFind },
  },
}));
vi.mock("@/lib/turnstile", () => ({ isTestMode: () => true }));
vi.mock("@/lib/settings", () => ({ getCompany: mocks.company, getInvoiceFooter: mocks.footer }));
vi.mock("@/lib/orders/inventory", () => ({ deductOrderInventory: mocks.inventory }));
vi.mock("@/lib/orders/confirmation-delivery", () => ({ deliverOrderConfirmation: mocks.deliver }));
vi.mock("@/lib/orders/shipped-delivery", () => ({ deliverOrderShipped: vi.fn() }));
vi.mock("@/lib/orders/status-mail", () => ({ notifyOrderStatus: vi.fn() }));

import { markOrderPaid } from "@/lib/orders/transitions";
import { readInvoiceSnapshot } from "@/lib/invoice/snapshot";

const COMPANY = { name: "Nasmeh.si, d.o.o.", address: "Čopova 1, 1000 Ljubljana", registrationNumber: "1234567000", vatId: "SI12345678", email: "info@nasmeh.si", phone: "+386 1 234 56 78" };

const pendingOrder = () => ({
  id: "order-1", number: "NS-2027-00001", status: "PENDING", paidAt: null, stockDeducted: false, totalCents: 3989, currency: "EUR",
  email: "kupec@test.si", checkoutKey: "checkout-key-123", timeline: [],
  shippingAddress: { fullName: "Živa Kupec", line1: "Testna 5", postalCode: "1000", city: "Ljubljana", country: "SI" },
  billingAddress: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tx.processedEvent.create.mockResolvedValue({});
  mocks.tx.order.findFirst.mockResolvedValue(pendingOrder());
  mocks.tx.order.update.mockResolvedValue({});
  mocks.tx.orderItem.findMany.mockResolvedValue([]);
  mocks.tx.abandonedCheckout.deleteMany.mockResolvedValue({ count: 1 });
  mocks.tx.$queryRaw.mockResolvedValue([]);
  mocks.postCommitFind.mockResolvedValue({ id: "order-1" });
  mocks.company.mockResolvedValue(COMPANY);
  mocks.footer.mockResolvedValue("  Hvala za zaupanje.  ");
  mocks.inventory.mockResolvedValue({ ok: true });
  mocks.deliver.mockResolvedValue(true);
});

describe("markOrderPaid issues the invoice", () => {
  it("writes the invoice snapshot with the number in the same update and deletes the abandoned checkout", async () => {
    expect(await markOrderPaid("stripe", "evt_1", "pi_1", { amountCents: 3989, currency: "eur" })).toEqual({ outcome: "paid", orderNumber: "NS-2027-00001" });
    const data = mocks.tx.order.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "PAID", invoiceNumber: "NS-2027-00001", invoiceIssuedAt: expect.any(Date) });
    const snapshot = readInvoiceSnapshot(data.invoiceSnapshot);
    expect(snapshot).toEqual({
      issuedAt: data.invoiceIssuedAt.toISOString(),
      seller: COMPANY,
      buyer: { name: "Živa Kupec", email: "kupec@test.si", address: pendingOrder().shippingAddress },
      footer: "Hvala za zaupanje.",
    });
    // this session's capture and the buyer's captures from earlier sessions (QA 2026-10-03 T2-13)
    expect(mocks.tx.abandonedCheckout.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ email: "kupec@test.si" }, { recoveryToken: "checkout-key-123" }] },
    });
    expect(mocks.deliver).toHaveBeenCalledWith("order-1");
  });

  it("still records a captured payment without a snapshot when the company Setting is missing, and says so", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      mocks.company.mockResolvedValue(null);
      expect((await markOrderPaid("stripe", "evt_2", "pi_1", { amountCents: 3989, currency: "EUR" })).outcome).toBe("paid");
      const data = mocks.tx.order.update.mock.calls[0][0].data;
      expect(data.invoiceNumber).toBe("NS-2027-00001");
      expect(data).not.toHaveProperty("invoiceSnapshot");
      expect(log).toHaveBeenCalledWith("Invoice issued without a seller snapshot: company Setting missing or invalid");
    } finally {
      log.mockRestore();
    }
  });

  it("does not touch abandoned checkouts or the snapshot when stock ran out; without a checkout key it clears by e-mail", async () => {
    mocks.inventory.mockResolvedValueOnce({ ok: false, reason: "insufficient_stock" });
    expect((await markOrderPaid("stripe", "evt_3", "pi_1", { amountCents: 3989, currency: "EUR" })).outcome).toBe("stockout");
    expect(mocks.tx.order.update.mock.calls[0][0].data).not.toHaveProperty("invoiceSnapshot");
    expect(mocks.tx.abandonedCheckout.deleteMany).not.toHaveBeenCalled();

    mocks.tx.order.findFirst.mockResolvedValue({ ...pendingOrder(), checkoutKey: null });
    expect((await markOrderPaid("stripe", "evt_4", "pi_1", { amountCents: 3989, currency: "EUR" })).outcome).toBe("paid");
    expect(mocks.tx.abandonedCheckout.deleteMany).toHaveBeenCalledWith({ where: { OR: [{ email: "kupec@test.si" }] } });
  });

  it("logs only the error type when the post-commit confirmation attempt throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      mocks.deliver.mockRejectedValueOnce(new TypeError("SMTP recipient kupec@test.si rejected"));
      expect((await markOrderPaid("stripe", "evt_5", "pi_1", { amountCents: 3989, currency: "EUR" })).outcome).toBe("paid");
      expect(log).toHaveBeenCalledWith("Order confirmation remains pending", "TypeError");
      expect(JSON.stringify(log.mock.calls)).not.toContain("kupec@test.si");
    } finally {
      log.mockRestore();
    }
  });
});
