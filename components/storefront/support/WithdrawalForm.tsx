"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { submitWithdrawalAction } from "@/app/(storefront)/actions/returns";
import { returns } from "@/lib/copy/returns";
import { WITHDRAWAL_DELIVERY_STATUSES, type WithdrawalDeliveryStatus } from "@/lib/support/topics";
import { useAuthChallenge, type AuthChallengeProps } from "../auth/AuthChallenge";
import { UiButton } from "../ui/UiButton";
import { UiFormField, UiInput } from "../ui/UiInput";
import { ResultHeading } from "../ui/ResultHeading";

const copy = returns.withdrawal;
const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";

/**
 * Online model withdrawal form (§12.4). A matching order e-mail links the order; a notice
 * that matches no order is still recorded, because any timely statement is a valid withdrawal.
 */
export function WithdrawalForm({
  challenge, requestKey: initialRequestKey, defaults, maxDate, privacyHref,
}: {
  challenge: AuthChallengeProps;
  requestKey: string;
  defaults: { name: string; email: string };
  maxDate: string;
  /** `legal.links` privacy path. */
  privacyHref: string;
}) {
  const [requestKey] = useState(initialRequestKey);
  const human = useAuthChallenge(challenge);
  const [pending, startSubmit] = useTransition();
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<WithdrawalDeliveryStatus | null>(null);
  const [receipt, setReceipt] = useState<{ reference: string; orderLinked: boolean } | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    const data = new FormData(event.currentTarget);
    submitting.current = true;
    startSubmit(async () => {
      try {
        const result = await submitWithdrawalAction(data);
        if (result.ok && result.reference) setReceipt({ reference: result.reference, orderLinked: result.orderLinked !== false });
        else setError(result.error ?? copy.errors.failed);
      } catch { setError(copy.errors.failed); }
      finally { submitting.current = false; human.reset(); }
    });
  }

  if (receipt) return (
    <div role="status" data-withdrawal-success className="rounded-card border border-success bg-white p-6 md:p-8">
      <ResultHeading as="h3" className="text-2xl font-semibold">{copy.success.title}</ResultHeading>
      <p className="mt-3 leading-relaxed text-mid-1">{copy.success.body}</p>
      <p className="mt-6 text-sm font-medium">{copy.success.reference}</p>
      <p data-withdrawal-reference className="mt-1 break-all text-xl font-semibold text-brand">{receipt.reference}</p>
      {receipt.orderLinked ? null : <p data-withdrawal-unlinked className="mt-5 text-sm leading-relaxed text-mid-1">{copy.success.unlinked}</p>}
      <p className="mt-5 text-sm leading-relaxed text-mid-1">{copy.success.statutory}</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5" data-withdrawal-form>
      <input type="hidden" name="requestKey" value={requestKey} />
      <fieldset disabled={pending} className="space-y-5">
        <UiInput id="withdrawal-name" label={copy.fields.name} name="name" autoComplete="name" defaultValue={defaults.name} required minLength={2} maxLength={120} />
        <UiInput id="withdrawal-email" label={copy.fields.email} name="email" type="email" autoComplete="email" defaultValue={defaults.email} required maxLength={254} />
        <UiInput id="withdrawal-address" label={copy.fields.address} name="address" autoComplete="street-address" required minLength={5} maxLength={300} />
        <UiInput id="withdrawal-order" label={copy.fields.orderNumber} hint={copy.fields.orderNumberHint} name="orderNumber" required maxLength={20} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-dark-1">{copy.fields.deliveryStatus}</legend>
          <div className="flex flex-col gap-2 text-sm text-mid-1 md:flex-row md:gap-6">
            {WITHDRAWAL_DELIVERY_STATUSES.map(value => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="deliveryStatus" value={value} required checked={delivery === value} onChange={() => setDelivery(value)} className="size-4 accent-brand" />
                {value === "received" ? copy.fields.delivery.received : copy.fields.delivery.notReceived}
              </label>
            ))}
          </div>
        </fieldset>
        {delivery === "received" ? (
          <UiInput id="withdrawal-received" label={copy.fields.receivedAt} name="receivedAt" type="date" required max={maxDate} />
        ) : null}
        <UiFormField label={copy.fields.items} htmlFor="withdrawal-items">
          <textarea id="withdrawal-items" name="items" required minLength={5} maxLength={2000} rows={4} aria-describedby="withdrawal-items-hint" className={textareaClass} />
          <p id="withdrawal-items-hint" className="text-sm leading-relaxed text-mid-1">{copy.fields.itemsHint}</p>
        </UiFormField>
        <UiFormField label={copy.fields.note} htmlFor="withdrawal-note">
          <textarea id="withdrawal-note" name="note" maxLength={2000} rows={3} className={textareaClass} />
        </UiFormField>
        <div className="space-y-2">
          <label className="flex items-start gap-3 text-sm leading-relaxed text-mid-1">
            <input name="privacyAccepted" type="checkbox" required className="mt-1 size-4 shrink-0 accent-brand" />
            <span>{copy.privacy}</span>
          </label>
          <Link href={privacyHref} className="ml-7 inline-block text-sm text-mid-1 underline underline-offset-4">{copy.privacyLink}</Link>
        </div>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
      {human.field}
      <UiButton type="submit" fullWidth disabled={pending || human.waiting}>{pending ? copy.submitting : copy.submit}</UiButton>
    </form>
  );
}
