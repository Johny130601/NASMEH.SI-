"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resumeOrderPaymentAction } from "@/app/(storefront)/actions/payment";
import type { PlaceOrderResult } from "@/lib/orders/create";
import { paymentResumeState } from "@/lib/orders/resume-state";
import { paymentSubmittedPath } from "@/lib/orders/confirmation-view";
import { orders } from "@/lib/copy/checkout";
import { UiButton } from "../ui/UiButton";
import dynamic from "next/dynamic";

// Loaded when the customer resumes a payment, like the checkout's own panel (Phase 9 step 2).
const ProviderPaymentPanel = dynamic(
  () => import("./ProviderPaymentPanel").then((module) => module.ProviderPaymentPanel),
  { ssr: false, loading: () => <div data-pay-panel-loading aria-hidden="true" className="h-24 animate-pulse rounded-card bg-light-3" /> },
);

/**
 * Load payment details only through the ownership-checked server action.
 * `awaiting`: the page shows its waiting face (a payment is in flight).
 */
export function ResumeOrderPayment({ orderNumber, stripeKey, paypalClientId, awaiting }: {
  orderNumber: string;
  stripeKey: string | null;
  paypalClientId: string | null;
  awaiting: boolean;
}) {
  const router = useRouter();
  const [info, setInfo] = useState<Extract<PlaceOrderResult, { ok: true }> | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "cancelled" | "error">("idle");
  const [pending, startTransition] = useTransition();
  // The page moved from waiting to its pay face (the submitted attempt failed): nothing is in flight
  // any more, so the waiting note gives way to the payment button (adjusted during render, not in an effect).
  const [pageAwaiting, setPageAwaiting] = useState(awaiting);
  if (pageAwaiting !== awaiting) {
    setPageAwaiting(awaiting);
    if (!awaiting && state === "waiting") setState("idle");
  }

  // A submitted payment (or a status that moved on) switches the page to its waiting face, which
  // polls for the webhook; a page opened to pay has no poll of its own (QA 2026-09-30).
  const waitForWebhook = () => {
    setInfo(null);
    setState("waiting");
    router.replace(paymentSubmittedPath(orderNumber), { scroll: false });
  };
  const resume = () => startTransition(async () => {
    setState("idle");
    try {
      const result = await resumeOrderPaymentAction({ orderNumber });
      const next = paymentResumeState(result);
      if (next === "payment" && result.ok) setInfo(result);
      else if (next === "waiting" || next === "refresh") waitForWebhook();
      else if (next === "cancelled") setState("cancelled");
      else setState("error");
    } catch {
      setState("error");
    }
  });

  if (info) return <div className="mt-6"><ProviderPaymentPanel
    key={orderNumber}
    initial={info}
    stripeKey={stripeKey}
    paypalClientId={paypalClientId}
    onComplete={waitForWebhook}
  /></div>;

  if (state === "cancelled") return <div className="mt-6">
    <p role="alert" className="text-sm text-error">{orders.confirmation.paymentCancelled}</p>
    <UiButton href="/checkout" variant="outline" className="mt-3">{orders.confirmation.newCheckout}</UiButton>
  </div>;

  if (state === "waiting") return <div className="mt-6">
    <p role="status" className="text-sm text-mid-1">{orders.confirmation.paymentWaiting}</p>
    <UiButton className="mt-3" variant="outline" onClick={resume} disabled={pending}>
      {orders.confirmation.checkPaymentStatus}
    </UiButton>
  </div>;

  return <div className="mt-6">
    {state === "error" ? <p role="alert" className="mb-3 text-sm text-error">{orders.confirmation.resumeFailed}</p> : null}
    <UiButton variant="primary" onClick={resume} disabled={pending} data-resume-payment>
      {orders.confirmation.resumePayment}
    </UiButton>
  </div>;
}
