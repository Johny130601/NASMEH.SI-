import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/lib/jobs/restock-alerts", () => ({ sendPendingRestockAlerts: vi.fn() }));
vi.mock("@/lib/orders/status-mail", () => ({ notifyOrderStatus: vi.fn() }));
vi.mock("@/lib/orders/transitions", () => ({ timelinePush: vi.fn() }));
vi.mock("@/lib/inventory/stock", () => ({ adjustVariantStockInTx: vi.fn() }));

import { planRefund, refundVatCents, refundedQuantities } from "@/lib/orders/refunds";

const order = { status: "PAID", paidAt: new Date(), totalCents: 3989, refundedCents: 0, shippingCents: 490, vatRatePercent: 22 } as const;
const items = [
  { id: "a", quantity: 2, unitPriceCents: 1500 },
  { id: "b", quantity: 1, unitPriceCents: 499 },
];

describe("refund arithmetic", () => {
  it("splits the VAT share of a VAT-inclusive amount to the cent", () => {
    expect(refundVatCents(10000, 22)).toBe(1803);
    expect(refundVatCents(3989, 22)).toBe(719);
    expect(refundVatCents(0, 22)).toBe(0);
  });

  it("sums refunded quantities across pending and completed refunds and ignores failed or malformed rows", () => {
    const map = refundedQuantities([
      { status: "COMPLETED", lines: [{ orderItemId: "a", quantity: 1 }] },
      { status: "PENDING", lines: [{ orderItemId: "a", quantity: 1 }, { orderItemId: "b", quantity: 1 }] },
      { status: "FAILED", lines: [{ orderItemId: "a", quantity: 5 }] },
      { status: "COMPLETED", lines: "garbage" },
      { status: "COMPLETED", lines: [{ orderItemId: 5, quantity: "x" }] },
    ]);
    expect([...map]).toEqual([["a", 2], ["b", 1]]);
  });
});

describe("planRefund", () => {
  it("prices selected lines, shipping and a signed adjustment", () => {
    expect(planRefund(order, items, [], { lines: [{ orderItemId: "a", quantity: 1 }], refundShipping: false, adjustmentCents: 0 }))
      .toEqual({ ok: true, amountCents: 1500, vatCents: 270, lines: [{ orderItemId: "a", quantity: 1 }], full: false });
    expect(planRefund(order, items, [], { lines: [{ orderItemId: "a", quantity: 2 }, { orderItemId: "b", quantity: 1 }], refundShipping: true, adjustmentCents: 0 }))
      .toMatchObject({ ok: true, amountCents: 3989, full: true });
    expect(planRefund(order, items, [], { lines: [{ orderItemId: "a", quantity: 2 }], refundShipping: false, adjustmentCents: -300 }))
      .toMatchObject({ ok: true, amountCents: 2700, vatCents: 487 });
    expect(planRefund(order, items, [], { lines: [], refundShipping: false, adjustmentCents: 250 }))
      .toMatchObject({ ok: true, amountCents: 250 });
  });

  it("drops zero quantities and refuses more than the remaining quantity or a second shipping refund", () => {
    const prior = [{ status: "COMPLETED" as const, lines: [{ orderItemId: "a", quantity: 1 }], shippingRefunded: true }];
    expect(planRefund({ ...order, refundedCents: 1990 }, items, prior, { lines: [{ orderItemId: "a", quantity: 1 }, { orderItemId: "b", quantity: 0 }], refundShipping: false, adjustmentCents: 0 }))
      .toMatchObject({ ok: true, amountCents: 1500, lines: [{ orderItemId: "a", quantity: 1 }] });
    expect(planRefund({ ...order, refundedCents: 1990 }, items, prior, { lines: [{ orderItemId: "a", quantity: 2 }], refundShipping: false, adjustmentCents: 0 }))
      .toEqual({ ok: false, reason: "invalid_lines" });
    expect(planRefund({ ...order, refundedCents: 1990 }, items, prior, { lines: [], refundShipping: true, adjustmentCents: 0 }))
      .toEqual({ ok: false, reason: "invalid_lines" });
    expect(planRefund(order, items, [], { lines: [{ orderItemId: "zzz", quantity: 1 }], refundShipping: false, adjustmentCents: 0 }))
      .toEqual({ ok: false, reason: "invalid_lines" });
    expect(planRefund(order, items, [], { lines: [{ orderItemId: "a", quantity: 1.5 }], refundShipping: false, adjustmentCents: 0 }))
      .toEqual({ ok: false, reason: "invalid_lines" });
  });

  it("refuses amounts that are zero, negative or above the remaining balance", () => {
    expect(planRefund(order, items, [], { lines: [{ orderItemId: "a", quantity: 1 }], refundShipping: false, adjustmentCents: -1500 }))
      .toEqual({ ok: false, reason: "amount" });
    expect(planRefund(order, items, [], { lines: [{ orderItemId: "a", quantity: 2 }, { orderItemId: "b", quantity: 1 }], refundShipping: true, adjustmentCents: 1 }))
      .toEqual({ ok: false, reason: "amount" });
    expect(planRefund({ ...order, refundedCents: 3989 }, items, [], { lines: [{ orderItemId: "a", quantity: 1 }], refundShipping: false, adjustmentCents: 0 }))
      .toEqual({ ok: false, reason: "amount" });
    expect(planRefund(order, items, [], { lines: [], refundShipping: false, adjustmentCents: 0 }))
      .toEqual({ ok: false, reason: "invalid_lines" });
  });

  it("refuses orders that were never paid or are already closed", () => {
    for (const status of ["PENDING", "CANCELLED", "REFUNDED"] as const) {
      expect(planRefund({ ...order, status, paidAt: status === "PENDING" ? null : order.paidAt }, items, [], { lines: [{ orderItemId: "a", quantity: 1 }], refundShipping: false, adjustmentCents: 0 }))
        .toEqual({ ok: false, reason: "not_refundable" });
    }
  });
});
