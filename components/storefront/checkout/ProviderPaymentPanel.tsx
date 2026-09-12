"use client";

import { useMemo, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
// The package's main entry injects Stripe.js (250 kB) as a side effect of being imported, i.e. on
// the first checkout step; the pure entry loads it when loadStripe runs — at the payment step, with a key.
import { loadStripe } from "@stripe/stripe-js/pure";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { capturePayPalAction, resumeOrderPaymentAction } from "@/app/(storefront)/actions/payment";
import { testDriverPayAction, type TestPayOutcome } from "@/app/(storefront)/actions/checkout";
import type { PlaceOrderResult } from "@/lib/orders/create";
import { paymentResumeState } from "@/lib/orders/resume-state";
import { checkout, orders } from "@/lib/copy";
import { formatEUR } from "@/lib/pricing";
import { UiButton } from "../ui/UiButton";

type PaymentInfo = Extract<PlaceOrderResult, { ok: true }>;

export function ProviderPaymentPanel({ initial, stripeKey, paypalClientId, onComplete }: {
  initial: PaymentInfo; stripeKey: string | null; paypalClientId: string | null; onComplete: (number: string) => void;
}) {
  const [info, setInfo] = useState(initial);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const state = paymentResumeState(info);
  const stripe = useMemo(() => stripeKey && info.provider === "stripe" && state === "payment"
    ? loadStripe(stripeKey, { locale: "sl" }) : null, [stripeKey, info.provider, state]);
  const complete = () => onComplete(info.orderNumber);
  const retry = () => startTransition(async () => {
    setError(false);
    try {
      const result = await resumeOrderPaymentAction({ orderNumber: info.orderNumber });
      if (result.ok) {
        setInfo(result);
        // Only actual persisted terminal states navigate to their confirmation.
        // Provider acceptance/cancellation gets its own UI and no pay controls.
        if (paymentResumeState(result) === "refresh") onComplete(result.orderNumber);
      } else setError(true);
    } catch { setError(true); }
  });
  const testPay = (outcome: TestPayOutcome) => startTransition(async () => {
    setError(false);
    try {
      const result = await testDriverPayAction({ orderNumber: info.orderNumber, outcome });
      if (result.ok || result.status === "stockout") complete(); else setError(true);
    } catch { setError(true); }
  });
  return <section className="rounded-card border border-light-2 bg-white p-6" data-pay-panel>
    <h2 className="text-xl">{checkout.pay.title}</h2>
    <p className="mt-2 text-sm">{info.orderNumber}</p>
    <p className="mt-3 text-lg font-medium">{checkout.summary.total}: {formatEUR(info.totalCents)}</p>
    {state === "cancelled" ? <div className="mt-5">
      <p role="alert">{orders.confirmation.paymentCancelled}</p>
      <UiButton className="mt-3" variant="outline" onClick={() => window.location.assign("/checkout")}>{orders.confirmation.newCheckout}</UiButton>
    </div> : state === "waiting" || state === "refresh" ? <div className="mt-5">
      <p role="status">{orders.confirmation.paymentWaiting}</p>
      <UiButton className="mt-3" variant="outline" onClick={retry} disabled={pending}>{orders.confirmation.checkPaymentStatus}</UiButton>
    </div> : info.paymentUnavailable ? <div className="mt-5"><p role="status">{checkout.pay.unavailable}</p><UiButton onClick={retry} disabled={pending}>{checkout.pay.retry}</UiButton></div> : <>
      {info.provider === "test" ? <div className="mt-5 flex flex-wrap gap-3">
        <UiButton onClick={() => testPay("success")} disabled={pending} data-test-pay-success>{checkout.pay.testSuccess}</UiButton>
        <UiButton onClick={() => testPay("sca_fail")} disabled={pending} data-test-pay-sca>{checkout.pay.testScaFail}</UiButton>
        <UiButton onClick={() => testPay("failure")} disabled={pending} data-test-pay-failure>{checkout.pay.testFailure}</UiButton>
      </div> : null}
      {info.provider === "stripe" && stripe && info.clientSecret ? <Elements stripe={stripe} options={{ clientSecret: info.clientSecret, locale: "sl" }}>
        <StripeForm orderNumber={info.orderNumber} onComplete={complete} />
      </Elements> : null}
      {info.provider === "paypal" && paypalClientId && info.intentId ? <div className="mt-5"><PayPalScriptProvider options={{ clientId: paypalClientId, currency: "EUR", intent: "capture", components: "buttons" }}>
        <PayPalButtons createOrder={async () => info.intentId!} onApprove={async () => {
          try {
            const result = await capturePayPalAction({ orderNumber: info.orderNumber });
            if (result.ok) complete(); else setError(true);
          } catch { setError(true); }
        }} onError={() => setError(true)} onCancel={() => setError(true)} />
      </PayPalScriptProvider></div> : null}
    </>}
    {error ? <p role="alert" className="mt-4 text-sm text-error">{checkout.pay.failed}</p> : null}
  </section>;
}

function StripeForm({ orderNumber, onComplete }: { orderNumber: string; onComplete: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <form className="mt-5 flex flex-col gap-4" onSubmit={async event => {
    event.preventDefault();
    if (!stripe || !elements || pending) return;
    setPending(true); setError(false);
    try {
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/potrditev/${encodeURIComponent(orderNumber)}` }, redirect: "if_required" });
      if (result.error) setError(true); else onComplete();
    } catch { setError(true); } finally { setPending(false); }
  }}>
    <PaymentElement />
    <UiButton type="submit" disabled={!stripe || !elements || pending}>{pending ? checkout.pay.processing : checkout.pay.confirm}</UiButton>
    {error ? <p role="alert" className="text-sm text-error">{checkout.pay.failed}</p> : null}
  </form>;
}
