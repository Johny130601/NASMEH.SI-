import { describe, expect, it } from "vitest";
import { orderMailStates, type OrderMailFields } from "@/lib/admin/order-mail-state";
import { admin as copy } from "@/lib/copy/admin";

/**
 * QA 2026-10-03 T4-03: the order detail never showed whether the confirmation and the shipment
 * notice went out — sends by the payment webhook and retries by the daily job left no trace on
 * the page. Their state is read from the order's own delivery columns.
 */
const base: OrderMailFields = {
  status: "PENDING", anonymizedAt: null, paidAt: null, shippedAt: null,
  confirmationEmailSentAt: null, confirmationEmailPending: false, confirmationEmailLastError: null,
  shippedEmailSentAt: null, shippedEmailPending: false, shippedEmailLastError: null,
};
const at = new Date("2026-10-03T11:19:20Z");

describe("order mail states", () => {
  it("says a mail is not due before payment or shipment", () => {
    expect(orderMailStates(base)).toEqual({ confirmation: { state: "notDue" }, shipped: { state: "notDue" } });
  });

  it("reports when each mail was sent", () => {
    const states = orderMailStates({ ...base, paidAt: at, shippedAt: at, confirmationEmailSentAt: at, shippedEmailSentAt: at });
    expect(states).toEqual({ confirmation: { state: "sent", at }, shipped: { state: "sent", at } });
  });

  it("shows a queued mail with the error class its last attempt stored (the daily job retries it)", () => {
    const states = orderMailStates({
      ...base, paidAt: at, shippedAt: at,
      confirmationEmailPending: true, confirmationEmailLastError: "CompanySettingMissingError",
      shippedEmailPending: true,
    });
    expect(states.confirmation).toEqual({ state: "queued", lastError: "CompanySettingMissingError" });
    expect(states.shipped).toEqual({ state: "queued", lastError: null });
  });

  it("says a mail owed by the order's stage was dropped: neither sent nor queued", () => {
    // e.g. a stock-out at capture or an erasure before delivery cleared the pending flag
    expect(orderMailStates({ ...base, status: "CANCELLED", paidAt: at }).confirmation).toEqual({ state: "notQueued" });
    expect(orderMailStates({ ...base, status: "DELIVERED", paidAt: at, shippedAt: at }).shipped).toEqual({ state: "notQueued" });
  });

  it("never promises a mail on a closed order: a cancelled unpaid order is not 'sent on payment'", () => {
    const closedOrders: Array<Partial<OrderMailFields>> = [{ status: "CANCELLED" }, { status: "REFUNDED", paidAt: at }, { status: "PAID", paidAt: at, anonymizedAt: at }];
    for (const closed of closedOrders) {
      const states = orderMailStates({ ...base, ...closed });
      expect(states.shipped).toEqual({ state: "notQueued" });
      if (!("paidAt" in closed)) expect(states.confirmation).toEqual({ state: "notQueued" });
    }
    // An open paid order still waits for its shipment.
    expect(orderMailStates({ ...base, status: "PAID", paidAt: at, confirmationEmailSentAt: at }).shipped).toEqual({ state: "notDue" });
  });

  it("prefers the send time over a stale flag and keeps a stored error short", () => {
    expect(orderMailStates({ ...base, paidAt: at, confirmationEmailSentAt: at, confirmationEmailPending: true }).confirmation).toEqual({ state: "sent", at });
    const long = orderMailStates({ ...base, paidAt: at, confirmationEmailPending: true, confirmationEmailLastError: `  ${"E".repeat(200)}  ` });
    expect(long.confirmation).toEqual({ state: "queued", lastError: "E".repeat(80) });
    expect(orderMailStates({ ...base, paidAt: at, confirmationEmailPending: true, confirmationEmailLastError: "   " }).confirmation).toEqual({ state: "queued", lastError: null });
  });

  it("has words for every state", () => {
    const m = copy.orders.detail.mails;
    expect(m.sent).toContain("{date}");
    expect(m.lastError).toContain("{error}");
    for (const text of [m.title, m.confirmation, m.shipped, m.queued, m.notDue.confirmation, m.notDue.shipped, m.notQueued]) expect(text.length).toBeGreaterThan(0);
  });
});
