import type { Order } from "@prisma/client";
import { z } from "zod";
import { getPaymentProvider } from "@/lib/payments";
import {
  PAY_NOW_PARAM,
  PAYMENT_SUBMITTED_PARAM,
  STRIPE_RETURN_PARAM,
  lastPaymentAttemptFailed,
  pendingOrderView,
  providerPaymentSettling,
  type PendingOrderView,
} from "./confirmation-view";

/**
 * The /potrditev/{n} query at its boundary (AGENTS §8.2): search params arrive
 * as string | string[] | undefined, the first value counts, and anything
 * malformed reads as absent — which is the "pay" face, the safe default.
 * Server only; the client bundle imports `confirmation-view` without zod.
 */
const param = z
  .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.string().max(64).optional())
  .catch(undefined);

const confirmationQuerySchema = z.object({
  [PAY_NOW_PARAM]: param,
  [PAYMENT_SUBMITTED_PARAM]: param,
  [STRIPE_RETURN_PARAM]: param,
});

export function pendingOrderViewFromQuery(query: unknown): PendingOrderView {
  const parsed = confirmationQuerySchema.safeParse(query ?? {});
  if (!parsed.success) return "pay";
  return pendingOrderView({
    payNow: parsed.data[PAY_NOW_PARAM],
    submitted: parsed.data[PAYMENT_SUBMITTED_PARAM],
    stripeStatus: parsed.data[STRIPE_RETURN_PARAM],
  });
}

type PaymentOrder = Pick<Order, "timeline" | "paymentProvider" | "stripePaymentIntentId" | "paypalOrderId">;

/**
 * The face of a PENDING order: the query's hint, checked against the order.
 * The submitted marker and Stripe's return stay in the address bar and the
 * history, so a hint that a payment is in flight can outlive the attempt
 * (review of QA 2026-09-30). When the order's latest payment event is a failed
 * attempt the hint alone cannot tell "that attempt failed" from "a retry after
 * an earlier failure is settling", so the provider is asked — read-only, and
 * only in that case: the page leads with the payment unless the provider still
 * reports the payment settling, the same answer the resume button would get
 * (`ensureOrderPayment`). A provider that cannot answer leaves the hint as is;
 * the waiting face polls, so it corrects itself once the provider answers.
 */
export async function resolvePendingOrderView(order: PaymentOrder, hinted: PendingOrderView): Promise<PendingOrderView> {
  if (hinted === "pay" || !lastPaymentAttemptFailed(order.timeline)) return hinted;
  const name = order.paymentProvider;
  if (name !== "stripe" && name !== "paypal" && name !== "test") return hinted;
  const intentId = name === "paypal" ? order.paypalOrderId : order.stripePaymentIntentId;
  const provider = getPaymentProvider(name);
  if (!intentId || !provider) return hinted;
  try {
    const handle = await provider.retrieveIntent(intentId);
    return providerPaymentSettling(name, handle.status) ? "awaiting" : "pay";
  } catch {
    return hinted;
  }
}
