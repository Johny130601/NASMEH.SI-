"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  trackOrderAction,
  trackShipmentAction,
  type OrderView,
  type ShipmentView,
} from "@/app/(storefront)/actions/tracking";
import { formatEUR } from "@/lib/pricing";
import { tracking as copy } from "@/lib/copy/tracking";
import { TurnstileWidget } from "../chrome/TurnstileWidget";
import { ResultHeading, useRevealOnMount } from "../ui/ResultHeading";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

interface Challenge {
  siteKey: string | null;
  testToken: string | null;
}

type Mode = "number" | "order";
type LookupMarker = "number" | "status" | "shipped" | "estimate" | "delivered";

type Result =
  | { mode: "number"; view: ShipmentView }
  | { mode: "order"; view: OrderView };

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("sl-SI") : "—";
}

/** "Checking …" under the form that asked, brought into view when that form sits at the fold; focus stays on the button. */
function PendingLine() {
  const ref = useRef<HTMLParagraphElement>(null);
  useRevealOnMount(ref, { block: "nearest", focus: false });
  return (
    <p ref={ref} role="status" className="text-sm text-mid-2" data-lookup-pending>
      {copy.pending}
    </p>
  );
}

/**
 * The refusal, announced, brought into view below the form (which stays in view for the correction) and focused —
 * unless nobody asked: the automatic lookup's refusal takes no focus.
 */
function ErrorLine({ children, focus = true }: { children: ReactNode; focus?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useRevealOnMount(ref, { block: "nearest", focus });
  return (
    <p ref={ref} role="alert" tabIndex={-1} className="text-sm text-error outline-none" data-lookup-error>
      {children}
    </p>
  );
}

/**
 * Two lookup modes on one page (§12.3): a tracking number, or e-mail + order
 * number. Each form carries its own challenge token; results render from the
 * action response, never from client-side guesses. "Checking", the answer and
 * the error appear directly under the form that was submitted and are brought
 * into view; the answer and the error take focus (QA M14), so nothing changes
 * out of sight. The buttons are aria-disabled, not disabled, while a lookup
 * runs, so focus stays on the one that was pressed instead of falling to the
 * page. Without JavaScript a form reloads the page with its values in the
 * query (trackingNumber, email, orderNumber), which the page prefills like the
 * mail links' sledenje/narocilo, and the page says the lookup needs JavaScript.
 * Opened with a tracking number (the shipped mail's link), the page looks it up
 * once by itself, and that answer takes no focus (QA 2026-10-03 T2-08).
 * Turnstile tokens are single-use, so a form's widget mounts afresh after each
 * of its lookups.
 */
export function TrackingLookup({
  challenge,
  defaults,
  autoLookup = false,
}: {
  challenge: Challenge;
  defaults: { trackingNumber: string; email: string; orderNumber: string };
  /** Look up `defaults.trackingNumber` as soon as the challenge has a token. */
  autoLookup?: boolean;
}) {
  const [trackingNumber, setTrackingNumber] = useState(defaults.trackingNumber);
  const [email, setEmail] = useState(defaults.email);
  const [orderNumber, setOrderNumber] = useState(defaults.orderNumber);
  const [numberToken, setNumberToken] = useState(challenge.testToken ?? "");
  const [orderToken, setOrderToken] = useState(challenge.testToken ?? "");
  // Remount keys of the two widgets: a fresh challenge after each lookup.
  const [numberWidget, setNumberWidget] = useState(0);
  const [orderWidget, setOrderWidget] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Mode | null>(null);
  // The answer to the automatic lookup: shown under its form, but it takes no focus.
  const [quiet, setQuiet] = useState(false);
  // Keys the feedback, so an identical second answer is a new element that is revealed again.
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();
  const autoStarted = useRef(false);

  const lookupNumber = (auto: boolean) => {
    setActive("number");
    setQuiet(auto);
    setAttempt((count) => count + 1);
    startTransition(async () => {
      const outcome = await trackShipmentAction({ trackingNumber, turnstileToken: numberToken });
      setError(outcome.ok ? null : outcome.error);
      setResult(outcome.ok ? { mode: "number", view: outcome.data } : null);
      if (challenge.siteKey) {
        setNumberToken(challenge.testToken ?? "");
        setNumberWidget((key) => key + 1);
      }
    });
  };

  const submitNumber = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    lookupNumber(false);
  };

  const submitOrder = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setActive("order");
    setQuiet(false);
    setAttempt((count) => count + 1);
    startTransition(async () => {
      const outcome = await trackOrderAction({ email, orderNumber, turnstileToken: orderToken });
      setError(outcome.ok ? null : outcome.error);
      setResult(outcome.ok ? { mode: "order", view: outcome.data } : null);
      if (challenge.siteKey) {
        setOrderToken(challenge.testToken ?? "");
        setOrderWidget((key) => key + 1);
      }
    });
  };

  // The shipped mail's link carries its tracking number: look it up once the challenge has a token — the same
  // Server Action, challenge and rate limit as a click. Nobody pressed anything, so the answer takes no focus
  // (an open cookie dialog keeps it).
  useEffect(() => {
    if (!autoLookup || autoStarted.current || (challenge.siteKey && !numberToken)) return;
    autoStarted.current = true;
    lookupNumber(true);
    // Once, when the challenge first has a token; lookupNumber reads the current values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLookup, numberToken]);

  const challengeField = (token: string, onToken: (value: string) => void, name: string, widget: number) =>
    challenge.siteKey ? (
      <TurnstileWidget key={widget} siteKey={challenge.siteKey} onToken={onToken} />
    ) : (
      <input type="hidden" name={name} value={token} readOnly />
    );

  const status = (view: ShipmentView) =>
    copy.statuses[view.status as keyof typeof copy.statuses] ?? view.status;

  /** One label/value row; `marker` names the data-lookup-* hook the tests and scripts read. */
  const row = (label: string, value: ReactNode, marker?: LookupMarker, valueClass = "text-dark-1") => (
    <div className="flex justify-between gap-4">
      <dt className="text-mid-2">{label}</dt>
      <dd
        className={valueClass}
        data-lookup-number={marker === "number" ? "" : undefined}
        data-lookup-status={marker === "status" ? "" : undefined}
        data-lookup-shipped={marker === "shipped" ? "" : undefined}
        data-lookup-estimate={marker === "estimate" ? "" : undefined}
        data-lookup-delivered={marker === "delivered" ? "" : undefined}
      >
        {value}
      </dd>
    </div>
  );

  // One feedback block, rendered under the form that asked; each attempt remounts it, so it is revealed again.
  const feedback = (mode: Mode) => {
    if (active !== mode) return null;
    if (pending) return <PendingLine key={attempt} />;
    if (error) return <ErrorLine key={attempt} focus={!quiet}>{error}</ErrorLine>;
    if (!result) return null;
    const title = result.mode === "order" ? copy.result.orderTitle : copy.result.title;
    return (
      <section
        key={attempt}
        className="rounded-card border border-light-2 bg-white p-5"
        data-lookup-result
        data-lookup-mode={result.mode}
        aria-live="polite"
      >
        {quiet ? <h2 className="text-lg">{title}</h2> : <ResultHeading className="text-lg">{title}</ResultHeading>}
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          {result.mode === "order" ? row(copy.result.numberLabel, result.view.number, "number") : null}
          {row(copy.result.statusLabel, status(result.view), "status", "font-medium text-dark-1")}
          {row(copy.result.carrierLabel, result.view.carrier ?? "—")}
          {row(
            copy.result.trackingLabel,
            result.view.trackingNumber ? (
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
            ),
            undefined,
            "text-right text-dark-1",
          )}
          {result.view.shippedAt ? row(copy.result.shippedAtLabel, formatDate(result.view.shippedAt), "shipped") : null}
          {result.view.estimate && !result.view.deliveredAt ? row(copy.result.estimateLabel, result.view.estimate, "estimate") : null}
          {result.view.deliveredAt ? row(copy.result.deliveredAtLabel, formatDate(result.view.deliveredAt), "delivered") : null}
          {result.mode === "order" ? (
            <>
              {row(copy.result.methodLabel, result.view.shippingMethod ?? "—")}
              {row(copy.result.itemsLabel, result.view.itemCount)}
              {row(copy.result.totalLabel, formatEUR(result.view.totalCents))}
              {row(copy.result.dateLabel, formatDate(result.view.createdAt))}
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
    );
  };

  return (
    <div className="mt-8 flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <form onSubmit={submitNumber} className="rounded-card border border-light-2 bg-white p-5" data-track-form="number">
          <h2 className="text-lg">{copy.byNumber.title}</h2>
          <div className="mt-4 flex flex-col gap-4">
            <UiInput
              label={copy.byNumber.numberLabel}
              name="trackingNumber"
              autoComplete="off"
              required
              maxLength={80}
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
            />
            {challengeField(numberToken, setNumberToken, "turnstileToken", numberWidget)}
            <UiButton type="submit" variant="primary" fullWidth aria-disabled={pending} className="aria-disabled:opacity-50">
              {copy.byNumber.submit}
            </UiButton>
          </div>
        </form>
        {feedback("number")}
      </div>

      <div className="flex flex-col gap-4">
        <form onSubmit={submitOrder} className="rounded-card border border-light-2 bg-white p-5" data-track-form="order">
          <h2 className="text-lg">{copy.byOrder.title}</h2>
          <div className="mt-4 flex flex-col gap-4">
            <UiInput
              label={copy.byOrder.emailLabel}
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <UiInput
              label={copy.byOrder.numberLabel}
              name="orderNumber"
              autoComplete="off"
              required
              maxLength={20}
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
            />
            {challengeField(orderToken, setOrderToken, "turnstileToken", orderWidget)}
            <UiButton type="submit" variant="outline" fullWidth aria-disabled={pending} className="aria-disabled:opacity-50">
              {copy.byOrder.submit}
            </UiButton>
          </div>
        </form>
        {feedback("order")}
      </div>
    </div>
  );
}
