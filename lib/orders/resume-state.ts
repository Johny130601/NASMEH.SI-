import type { PlaceOrderResult } from "./create";

export type PaymentResumeState = "payment" | "waiting" | "cancelled" | "refresh" | "error";

/** Provider completion is never a client-side PAID transition. */
export function paymentResumeState(result: PlaceOrderResult): PaymentResumeState {
  if (!result.ok) return "error";
  if (result.paymentStatus === "AWAITING_WEBHOOK") return "waiting";
  if (result.paymentStatus === "PAYMENT_CANCELLED") return "cancelled";
  if (result.paymentStatus && result.paymentStatus !== "PENDING") return "refresh";
  return "payment";
}
