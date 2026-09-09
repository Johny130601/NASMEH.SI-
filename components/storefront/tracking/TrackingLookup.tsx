"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  trackOrderAction,
  trackShipmentAction,
  type OrderView,
  type ShipmentView,
} from "@/app/(storefront)/actions/tracking";
import { formatEUR } from "@/lib/pricing";
import { tracking as copy } from "@/lib/copy/tracking";
import { TurnstileWidget } from "../chrome/TurnstileWidget";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

interface Challenge {
  siteKey: string | null;
  testToken: string | null;
}

type Result =
  | { mode: "number"; view: ShipmentView }
  | { mode: "order"; view: OrderView };

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("sl-SI") : "—";
}

/**
 * Two lookup modes on one page (§12.3): a tracking number, or e-mail + order
 * number. Each form carries its own challenge token; results render from the
 * action response, never from client-side guesses.
 */
export function TrackingLookup({
  challenge,
  defaults,
}: {
  challenge: Challenge;
  defaults: { trackingNumber: string; email: string; orderNumber: string };
}) {
  const [trackingNumber, setTrackingNumber] = useState(defaults.trackingNumber);
  const [email, setEmail] = useState(defaults.email);
  const [orderNumber, setOrderNumber] = useState(defaults.orderNumber);
  const [numberToken, setNumberToken] = useState(challenge.testToken ?? "");
  const [orderToken, setOrderToken] = useState(challenge.testToken ?? "");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submitNumber = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const outcome = await trackShipmentAction({ trackingNumber, turnstileToken: numberToken });
      setError(outcome.ok ? null : outcome.error);
      setResult(outcome.ok ? { mode: "number", view: outcome.data } : null);
    });
  };

  const submitOrder = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const outcome = await trackOrderAction({ email, orderNumber, turnstileToken: orderToken });
      setError(outcome.ok ? null : outcome.error);
      setResult(outcome.ok ? { mode: "order", view: outcome.data } : null);
    });
  };

  const challengeField = (token: string, onToken: (value: string) => void, name: string) =>
    challenge.siteKey ? (
      <TurnstileWidget siteKey={challenge.siteKey} onToken={onToken} />
    ) : (
      <input type="hidden" name={name} value={token} readOnly />
    );

  const status = (view: ShipmentView) =>
    copy.statuses[view.status as keyof typeof copy.statuses] ?? view.status;

  return (
    <div className="mt-8 flex flex-col gap-8">
      <form onSubmit={submitNumber} className="rounded-card border border-light-2 bg-white p-5" data-track-form="number">
        <h2 className="text-lg">{copy.byNumber.title}</h2>
        <div className="mt-4 flex flex-col gap-4">
          <UiInput
            label={copy.byNumber.numberLabel}
            name="trackingNumber"
            autoComplete="off"
            required
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
          />
          {challengeField(numberToken, setNumberToken, "turnstileToken")}
          <UiButton type="submit" variant="primary" fullWidth disabled={pending}>
            {copy.byNumber.submit}
          </UiButton>
        </div>
      </form>

      <form onSubmit={submitOrder} className="rounded-card border border-light-2 bg-white p-5" data-track-form="order">
        <h2 className="text-lg">{copy.byOrder.title}</h2>
        <div className="mt-4 flex flex-col gap-4">
          <UiInput
            label={copy.byOrder.emailLabel}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <UiInput
            label={copy.byOrder.numberLabel}
            name="orderNumber"
            autoComplete="off"
            required
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
          />
          {challengeField(orderToken, setOrderToken, "turnstileToken")}
          <UiButton type="submit" variant="outline" fullWidth disabled={pending}>
            {copy.byOrder.submit}
          </UiButton>
        </div>
      </form>

      {pending ? <p role="status" className="text-sm text-mid-2">{copy.pending}</p> : null}

      {error ? (
        <p role="alert" className="text-sm text-error" data-lookup-error>
          {error}
        </p>
      ) : null}

      {result ? (
        <section
          className="rounded-card border border-light-2 bg-white p-5"
          data-lookup-result
          data-lookup-mode={result.mode}
          aria-live="polite"
        >
          <h2 className="text-lg">{result.mode === "order" ? copy.result.orderTitle : copy.result.title}</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            {result.mode === "order" ? (
              <div className="flex justify-between gap-4">
                <dt className="text-mid-2">{copy.byOrder.numberLabel}</dt>
                <dd className="text-dark-1" data-lookup-number>{result.view.number}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-mid-2">{copy.result.statusLabel}</dt>
              <dd className="font-medium text-dark-1" data-lookup-status>{status(result.view)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mid-2">{copy.result.carrierLabel}</dt>
              <dd className="text-dark-1">{result.view.carrier ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mid-2">{copy.result.trackingLabel}</dt>
              <dd className="text-right text-dark-1">
                {result.view.trackingNumber ? (
                  result.view.trackingLink ? (
                    <a
                      href={result.view.trackingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand underline underline-offset-2"
                      data-tracking-link
                    >
                      {result.view.trackingNumber}
                    </a>
                  ) : (
                    <span data-tracking-number>{result.view.trackingNumber}</span>
                  )
                ) : (
                  copy.result.noTracking
                )}
              </dd>
            </div>
            {result.view.shippedAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-mid-2">{copy.result.shippedAtLabel}</dt>
                <dd className="text-dark-1" data-lookup-shipped>{formatDate(result.view.shippedAt)}</dd>
              </div>
            ) : null}
            {result.view.estimate && !result.view.deliveredAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-mid-2">{copy.result.estimateLabel}</dt>
                <dd className="text-dark-1" data-lookup-estimate>{result.view.estimate}</dd>
              </div>
            ) : null}
            {result.view.deliveredAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-mid-2">{copy.result.deliveredAtLabel}</dt>
                <dd className="text-dark-1" data-lookup-delivered>{formatDate(result.view.deliveredAt)}</dd>
              </div>
            ) : null}
            {result.mode === "order" ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-mid-2">{copy.result.methodLabel}</dt>
                  <dd className="text-dark-1">{result.view.shippingMethod ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-mid-2">{copy.result.itemsLabel}</dt>
                  <dd className="text-dark-1">{result.view.itemCount}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-mid-2">{copy.result.totalLabel}</dt>
                  <dd className="text-dark-1">{formatEUR(result.view.totalCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-mid-2">{copy.result.dateLabel}</dt>
                  <dd className="text-dark-1">{formatDate(result.view.createdAt)}</dd>
                </div>
              </>
            ) : null}
          </dl>
          {result.view.trackingLink ? (
            <a
              href={result.view.trackingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-brand underline underline-offset-2"
            >
              {copy.result.trackLink}
            </a>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
