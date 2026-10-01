import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/lib/jobs/restock-alerts", () => ({ sendPendingRestockAlerts: vi.fn() }));
vi.mock("@/lib/orders/status-mail", () => ({ notifyOrderStatus: vi.fn() }));
vi.mock("@/lib/orders/transitions", () => ({ timelinePush: vi.fn() }));
vi.mock("@/lib/inventory/stock", () => ({ adjustVariantStockInTx: vi.fn() }));

import { fullRefundRequest, owesCapturedPayment, planRefund, refundVatCents, refundedQuantities } from "@/lib/orders/refunds";

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

describe("captured payment owed back (QA M3)", () => {
  // A stock-out at capture: CANCELLED, paid, flagged. A coupon took 3,00 € off the lines.
  const owed = { status: "CANCELLED", paidAt: new Date(), totalCents: 3689, refundedCents: 0, shippingCents: 490, vatRatePercent: 22, refundRequired: true } as const;
  const whole = { lines: [{ orderItemId: "a", quantity: 2 }, { orderItemId: "b", quantity: 1 }], refundShipping: true, adjustmentCents: -300 };

  it("recognises only a flagged, paid order outside the fulfilment statuses", () => {
    expect(owesCapturedPayment(owed)).toBe(true);
    expect(owesCapturedPayment({ ...owed, status: "PENDING" })).toBe(true); // paid after the buyer was erased
    expect(owesCapturedPayment({ ...owed, refundRequired: false })).toBe(false);
    expect(owesCapturedPayment({ ...owed, paidAt: null })).toBe(false);
    expect(owesCapturedPayment({ ...owed, status: "PAID" })).toBe(false);
    expect(owesCapturedPayment({ ...owed, status: "REFUNDED" })).toBe(false);
  });

  it("builds the whole remaining balance: every line, the shipping and the discount as an adjustment", () => {
    expect(fullRefundRequest(owed, items, [])).toEqual(whole);
    const prior = [{ status: "COMPLETED" as const, lines: [{ orderItemId: "a", quantity: 1 }], shippingRefunded: true }];
    expect(fullRefundRequest({ ...owed, refundedCents: 1990 }, items, prior))
      .toEqual({ lines: [{ orderItemId: "a", quantity: 1 }, { orderItemId: "b", quantity: 1 }], refundShipping: false, adjustmentCents: -300 });
  });

  it("refunds a CANCELLED order that owes its captured payment, in full only", () => {
    expect(planRefund(owed, items, [], whole)).toMatchObject({ ok: true, amountCents: 3689, full: true });
    // A partial refund would leave the flag set and the awaiting-refund queue never clearing.
    expect(planRefund(owed, items, [], { lines: [{ orderItemId: "a", quantity: 1 }], refundShipping: false, adjustmentCents: 0 }))
      .toEqual({ ok: false, reason: "amount" });
    // Without the flag a cancelled order stays closed to refunds.
    expect(planRefund({ ...owed, refundRequired: false }, items, [], whole)).toEqual({ ok: false, reason: "not_refundable" });
    expect(planRefund({ ...owed, paidAt: null }, items, [], whole)).toEqual({ ok: false, reason: "not_refundable" });
  });

  it("settles an order whose coupon discount exceeds the amount paid", () => {
    // 34,90 € line with a 60 % code (−20,94 €) plus 4,90 € shipping: 18,86 € captured, the discount is larger.
    const bigDiscount = { ...owed, totalCents: 1886 };
    const line = [{ id: "a", quantity: 1, unitPriceCents: 3490 }];
    const request = fullRefundRequest(bigDiscount, line, []);
    expect(request).toEqual({ lines: [{ orderItemId: "a", quantity: 1 }], refundShipping: true, adjustmentCents: -2094 });
    expect(planRefund(bigDiscount, line, [], request)).toMatchObject({ ok: true, amountCents: 1886, full: true });
    // A 100 % code leaves only the shipping captured; the balance still goes back whole.
    const shippingOnly = { ...owed, totalCents: 490 };
    expect(planRefund(shippingOnly, line, [], fullRefundRequest(shippingOnly, line, []))).toMatchObject({ ok: true, amountCents: 490, full: true });
    // After a refund the provider made itself (no lines recorded), exactly the rest.
    const partlyBack = { ...bigDiscount, refundedCents: 500 };
    expect(planRefund(partlyBack, line, [], fullRefundRequest(partlyBack, line, []))).toMatchObject({ ok: true, amountCents: 1386, full: true });
  });

  it("bounds a negative adjustment by the gross value refunded, a positive one by the total", () => {
    const paid = { ...order, totalCents: 1886 };
    const line = [{ id: "a", quantity: 1, unitPriceCents: 3490 }];
    // A paid order cancelled with the same big discount: the cancellation's full refund plans too.
    expect(planRefund(paid, line, [], { lines: [{ orderItemId: "a", quantity: 1 }], refundShipping: true, adjustmentCents: -2094 }))
      .toMatchObject({ ok: true, amountCents: 1886, full: true });
    expect(planRefund(paid, line, [], { lines: [{ orderItemId: "a", quantity: 1 }], refundShipping: false, adjustmentCents: -3491 }))
      .toEqual({ ok: false, reason: "amount" });
    expect(planRefund(paid, line, [], { lines: [], refundShipping: false, adjustmentCents: 1887 }))
      .toEqual({ ok: false, reason: "amount" });
    expect(planRefund(paid, line, [], { lines: [], refundShipping: false, adjustmentCents: 1.5 }))
      .toEqual({ ok: false, reason: "amount" });
  });
});
