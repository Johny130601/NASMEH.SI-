/**
 * The two order mails with a durable retry queue — the order confirmation and
 * the shipment notice (lib/orders/confirmation-delivery.ts, shipped-delivery.ts)
 * — as the admin order detail shows them (QA 2026-10-03 T4-03). Read from the
 * order's own delivery columns, so a send by the payment webhook, by the daily
 * job's retry or by a staff re-send all show the same way:
 *
 * - `sent`: accepted by SMTP at `at`;
 * - `queued`: waiting for the next attempt (the daily job retries it), with the
 *   error class the last failed attempt stored, if any;
 * - `notDue`: not yet owed — the open order is unpaid (confirmation) or not
 *   yet shipped;
 * - `notQueued`: neither sent nor queued, and never will be by itself — the
 *   delivery dropped it, or the order was cancelled, refunded, never fulfilled
 *   or anonymised before it went out (a cancelled unpaid order never reads
 *   "sent on payment").
 *
 * The delivery code keeps no attempt counter, so no count is shown.
 */
export type OrderMailState =
  | { state: "sent"; at: Date }
  | { state: "queued"; lastError: string | null }
  | { state: "notDue" }
  | { state: "notQueued" };

export interface OrderMailFields {
  status: string;
  anonymizedAt: Date | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  confirmationEmailSentAt: Date | null;
  confirmationEmailPending: boolean;
  confirmationEmailLastError: string | null;
  shippedEmailSentAt: Date | null;
  shippedEmailPending: boolean;
  shippedEmailLastError: string | null;
}

function mailState(sentAt: Date | null, pending: boolean, lastError: string | null, due: boolean): OrderMailState {
  if (sentAt) return { state: "sent", at: sentAt };
  if (pending) return { state: "queued", lastError: lastError?.trim() ? lastError.trim().slice(0, 80) : null };
  return due ? { state: "notQueued" } : { state: "notDue" };
}

export function orderMailStates(order: OrderMailFields): { confirmation: OrderMailState; shipped: OrderMailState } {
  // A closed order owes no further mail: what was not sent by then never will be.
  const closed = order.status === "CANCELLED" || order.status === "REFUNDED" || order.anonymizedAt !== null;
  return {
    confirmation: mailState(order.confirmationEmailSentAt, order.confirmationEmailPending, order.confirmationEmailLastError, closed || order.paidAt !== null),
    shipped: mailState(order.shippedEmailSentAt, order.shippedEmailPending, order.shippedEmailLastError, closed || order.shippedAt !== null),
  };
}
