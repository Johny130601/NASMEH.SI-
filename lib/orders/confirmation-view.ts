/**
 * Which face /potrditev/{n} shows for an order that is still PENDING (QA
 * 2026-09-30). The status alone cannot tell the two visits apart:
 *
 * - "awaiting": a payment was just submitted and its webhook is pending — the
 *   provider's return (Stripe adds `redirect_status`) or our own navigation
 *   after the payment panel completed (`?placilo=oddano`). The page says it is
 *   waiting for the confirmation and polls for it.
 * - "pay": everything else — the "Dokončaj plačilo" links, an order whose pay
 *   panel was never used, and a submitted attempt that has since failed (the
 *   page checks the hint against the order, `resolvePendingOrderView`). The
 *   page leads with the payment.
 *
 * The query is a UX hint only: the status still comes from the database, and
 * resuming a payment asks the provider first, so a hint can never charge twice.
 * PURE and free of zod, because the checkout's client bundle imports the path
 * helper (Phase 9 step 2); the page parses its query in `confirmation-query.ts`.
 */

export type PendingOrderView = "pay" | "awaiting";

/** Added by our own navigation once the payment panel reports a submitted payment. */
export const PAYMENT_SUBMITTED_PARAM = "placilo";
export const PAYMENT_SUBMITTED_VALUE = "oddano";
/** A pay-now link may ask for the payment explicitly; it wins over any other hint. */
export const PAY_NOW_PARAM = "placaj";
/** Stripe's return parameter after a redirect (3-D Secure and similar). */
export const STRIPE_RETURN_PARAM = "redirect_status";

/** Stripe's intent (and `redirect_status`) values for a payment that went through or is still settling. */
const STRIPE_SETTLING = new Set(["succeeded", "processing"]);
/** PayPal order states in which the buyer's payment is approved or captured. */
const PAYPAL_SETTLING = new Set(["APPROVED", "COMPLETED"]);

/**
 * A provider state in which the submitted payment went through or is still
 * settling, so only the webhook is outstanding. One set for the confirmation
 * page and `ensureOrderPayment`, so the page's face and the resume button agree.
 */
export function providerPaymentSettling(provider: string | null | undefined, status: string | null | undefined): boolean {
  if (!status) return false;
  if (provider === "stripe") return STRIPE_SETTLING.has(status);
  if (provider === "paypal") return PAYPAL_SETTLING.has(status);
  return false;
}

/** The parsed hints; an absent parameter is undefined. */
export interface ConfirmationHints {
  payNow?: string;
  submitted?: string;
  stripeStatus?: string;
}

export function pendingOrderView({ payNow, submitted, stripeStatus }: ConfirmationHints): PendingOrderView {
  if (payNow !== undefined) return "pay";
  if (stripeStatus !== undefined) return providerPaymentSettling("stripe", stripeStatus) ? "awaiting" : "pay";
  return submitted === PAYMENT_SUBMITTED_VALUE ? "awaiting" : "pay";
}

/** Timeline events (`Order.timeline`, lib/orders/timeline.ts) that say where the payment stands. */
const PAYMENT_EVENTS = new Set(["created", "payment_failed", "paid", "payment_cancelled"]);

/**
 * True when the order's latest payment event is a failed attempt
 * (`markPaymentFailed` keeps the order PENDING and only records it). Other
 * annotations are skipped; a malformed timeline reads as no failure.
 */
export function lastPaymentAttemptFailed(timeline: unknown): boolean {
  if (!Array.isArray(timeline)) return false;
  for (let index = timeline.length - 1; index >= 0; index--) {
    const entry: unknown = timeline[index];
    const event = entry && typeof entry === "object" ? (entry as { event?: unknown }).event : undefined;
    if (typeof event === "string" && PAYMENT_EVENTS.has(event)) return event === "payment_failed";
  }
  return false;
}

/** Where the checkout and the resumed payment go once the panel reports a submitted payment. */
export function paymentSubmittedPath(orderNumber: string): string {
  return `/potrditev/${encodeURIComponent(orderNumber)}?${PAYMENT_SUBMITTED_PARAM}=${PAYMENT_SUBMITTED_VALUE}`;
}
