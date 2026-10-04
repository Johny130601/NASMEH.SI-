"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { lookupContactOrderAction, submitContactAction } from "@/app/(storefront)/actions/contact";
import { contact } from "@/lib/copy/contact";
import { TOPIC_CODES, topicReasons, type ReasonCode, type TopicCode } from "@/lib/support/topics";
import { useAuthChallenge, type AuthChallengeProps } from "../auth/AuthChallenge";
import { supportPhotosWithinLimits } from "../reviews/photo-downscale";
import { UiButton } from "../ui/UiButton";
import { UiFormField, UiInput } from "../ui/UiInput";
import { ResultHeading } from "../ui/ResultHeading";

interface ContactOrder { number: string; status: string; createdAt: string }
interface ContactFormProps {
  settings: { supportEmail: string; complianceEmail: string; hours: string; responseTime: string };
  challenge: AuthChallengeProps;
  requestKey: string;
  isSignedIn: boolean;
  accountOrders: ContactOrder[];
  defaults: { name: string; email: string };
  /** Preselected topic from a validated `?tema=` link (complaints page CTAs). */
  initialTopic?: TopicCode | null;
  /** `legal.links` privacy path. */
  privacyHref: string;
}

/** Static routes of the structured forms; the generic message path stays available beside them. */
const ADVERSE_FORM_PATH = "/prijava-nezelenega-ucinka";
const WITHDRAWAL_FORM_PATH = "/odstop-od-pogodbe";

const selectClass = "min-h-[3.25rem] w-full rounded-input border border-light-1 bg-white px-4 text-base outline-none focus:border-brand";
const iconPaths: Record<TopicCode, string> = {
  TRACKING: "M3 5h11v12H3z M14 9h4l3 4v4h-7 M7 17a2 2 0 1 0 0 .01 M17 17a2 2 0 1 0 0 .01",
  CHANGE: "m15 4 5 5 M4 20l4-1L20 7a2 2 0 0 0-4-4L4 15z",
  CANCEL: "M8 8l8 8 M16 8l-8 8 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  RETURN: "M8 7H4v-4 M4 7a9 9 0 1 1-1 9 M8 12h9 M8 12l3-3 M8 12l3 3",
  WRONG: "m3 7 9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10 M8 5l9 4 M9 15h6",
  DAMAGED: "m3 7 9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11l-2 4 3 1-1 5",
  ADVICE: "M9 18h6 M10 21h4 M8 14a7 7 0 1 1 8 0l-1 4H9z",
  ADVERSE: "m12 3 10 18H2z M12 9v5 M12 17v.01",
  OTHER: "M4 4h16v12H9l-5 4z M8 10h.01 M12 10h.01 M16 10h.01",
};

function orderLabel(order: ContactOrder) {
  const status = contact.orderStatuses[order.status as keyof typeof contact.orderStatuses] ?? contact.order.statusUnavailable;
  const date = new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana" }).format(new Date(order.createdAt));
  return `${order.number} · ${status} · ${date}`;
}

export function ContactForm({ settings, challenge, requestKey: initialRequestKey, isSignedIn, accountOrders, defaults, initialTopic = null, privacyHref }: ContactFormProps) {
  const [requestKey] = useState(initialRequestKey);
  const [topic, setTopic] = useState<TopicCode | null>(initialTopic);
  const [reason, setReason] = useState<ReasonCode>(initialTopic ? topicReasons[initialTopic][0] : "OTHER");
  const [accountOrder, setAccountOrder] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupNumber, setLookupNumber] = useState("");
  const [provenOrder, setProvenOrder] = useState<ContactOrder | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const lookupSequence = useRef(0);
  const [lookupPending, startLookup] = useTransition();
  const lookupHuman = useAuthChallenge(challenge);
  const finalHuman = useAuthChallenge(challenge);
  const [pending, startSubmit] = useTransition();
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const photos = useRef<HTMLInputElement>(null);

  function chooseTopic(value: TopicCode) {
    if (photos.current) photos.current.value = "";
    setTopic(value);
    setReason(topicReasons[value][0]);
    setError(null);
  }

  function invalidateLookup() {
    lookupSequence.current += 1;
    setProvenOrder(null);
    setLookupError(null);
  }

  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sequence = ++lookupSequence.current;
    setProvenOrder(null);
    setLookupError(null);
    startLookup(async () => {
      try {
        const result = await lookupContactOrderAction({ email: lookupEmail.trim(), orderNumber: lookupNumber.trim().toUpperCase(), turnstileToken: lookupHuman.token });
        // Ignore a reply if either proof input changed while this request was running.
        if (sequence !== lookupSequence.current) return;
        if (result.ok && result.order) setProvenOrder(result.order);
        else setLookupError(result.error ?? contact.errors.orderNotFound);
      } catch {
        if (sequence === lookupSequence.current) setLookupError(contact.errors.orderNotFound);
      } finally { lookupHuman.reset(); }
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    if (!topic) { setError(contact.message.chooseTopic); return; }
    const data = new FormData(event.currentTarget);
    // An untouched file input creates an empty-filename multipart part, which
    // can decode as a string. Send only actual selections; named empty files
    // remain invalid instead of silently disappearing from the request.
    const selected = Array.from(photos.current?.files ?? []);
    data.delete("photos");
    submitting.current = true;
    startSubmit(async () => {
      let sent = false;
      try {
        // A phone photo over the cap is downscaled in the browser before it is
        // refused, as on the review form (QA 2026-10-03 T3-06).
        const files = await supportPhotosWithinLimits(selected);
        if (!files) { setError(contact.errors.photos); return; }
        for (const file of files) data.append("photos", file, file.name);
        sent = true;
        const result = await submitContactAction(data);
        if (result.ok && result.reference) setReference(result.reference);
        else setError(result.error ?? contact.errors.failed);
      } catch { setError(contact.errors.failed); }
      finally { submitting.current = false; if (sent) finalHuman.reset(); }
    });
  }

  if (reference) return (
    <div role="status" data-contact-success className="rounded-card border border-success bg-white p-6 md:p-8">
      <ResultHeading className="text-2xl font-semibold">{contact.success.title}</ResultHeading>
      <p className="mt-3 leading-relaxed text-mid-1">{contact.success.body}</p>
      <p className="mt-6 text-sm font-medium">{contact.success.reference}</p>
      <p data-contact-reference className="mt-1 break-all text-xl font-semibold text-brand">{reference}</p>
      <p className="mt-5 text-sm leading-relaxed text-mid-1">{settings.responseTime}</p>
    </div>
  );

  return (
    <div className="min-w-0 space-y-9" data-contact-flow>
      <fieldset disabled={pending}>
        <legend className="mb-5 text-xl font-semibold">{contact.topicTitle}</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {TOPIC_CODES.map(code => (
            <label key={code} className="relative cursor-pointer">
              <input className="peer sr-only" type="radio" name="contact-topic" value={code} checked={topic === code} onChange={() => chooseTopic(code)} />
              <span className="flex h-full flex-col items-start gap-2 rounded-card border border-light-1 bg-white p-4 transition-colors hover:border-mid-3 peer-checked:border-brand peer-checked:bg-light-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mb-1 text-brand"><path d={iconPaths[code]} /></svg>
                <span className="text-sm font-semibold leading-snug">{contact.topics[code].label}</span>
                <span className="text-xs leading-relaxed text-mid-1">{contact.topics[code].description}</span>
              </span>
            </label>
          ))}
        </div>
        {topic && topicReasons[topic].length > 1 ? <div className="mt-5">
          <UiFormField label={contact.reasonLabel} htmlFor="contact-reason">
            <select id="contact-reason" value={reason} onChange={event => setReason(event.target.value as ReasonCode)} className={selectClass}>
              {topicReasons[topic].map(code => <option key={code} value={code}>{contact.reasons[code]}</option>)}
            </select>
          </UiFormField>
        </div> : null}
        {topic === "ADVERSE" ? <p data-contact-structured-form="adverse" className="mt-5 rounded-card bg-light-3 p-4 text-sm leading-relaxed text-mid-1">
          {contact.message.adverseForm}{" "}
          <Link href={ADVERSE_FORM_PATH} className="font-medium text-brand underline underline-offset-4">{contact.message.adverseFormLink}</Link>
        </p> : null}
        {topic === "RETURN" && reason === "WITHDRAWAL" ? <p data-contact-structured-form="withdrawal" className="mt-5 rounded-card bg-light-3 p-4 text-sm leading-relaxed text-mid-1">
          {contact.message.withdrawalForm}{" "}
          <Link href={WITHDRAWAL_FORM_PATH} className="font-medium text-brand underline underline-offset-4">{contact.message.withdrawalFormLink}</Link>
        </p> : null}
      </fieldset>

      <section aria-labelledby="contact-order-title" className="border-t border-light-2 pt-8">
        <h2 id="contact-order-title" className="text-xl font-semibold">{contact.order.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-mid-1">{contact.order.intro}</p>
        {isSignedIn ? (
          accountOrders.length ? <div className="mt-5">
            <UiFormField label={contact.order.accountLabel} htmlFor="contact-account-order">
              <select id="contact-account-order" data-contact-account-orders value={accountOrder} onChange={event => setAccountOrder(event.target.value)} disabled={pending} className={selectClass}>
                <option value="">{contact.order.none}</option>
                {accountOrders.map(order => <option key={order.number} value={order.number}>{orderLabel(order)}</option>)}
              </select>
            </UiFormField>
          </div> : <p className="mt-4 text-sm text-mid-1">{contact.order.accountEmpty}</p>
        ) : (
          <details className="mt-4 rounded-card border border-light-1 p-4" data-contact-order-details>
            <summary className="cursor-pointer text-sm font-medium">{contact.order.lookupTitle}</summary>
            <form onSubmit={lookup} className="mt-5 space-y-4" data-contact-lookup>
              <UiInput id="contact-lookup-email" label={contact.order.email} name="email" type="email" autoComplete="email" required maxLength={254} value={lookupEmail} disabled={pending} onChange={event => { invalidateLookup(); setLookupEmail(event.target.value); }} />
              <UiInput id="contact-lookup-number" label={contact.order.number} hint={contact.order.numberHint} name="orderNumber" required maxLength={40} value={lookupNumber} disabled={pending} onChange={event => { invalidateLookup(); setLookupNumber(event.target.value); }} />
              {lookupHuman.field}
              <UiButton type="submit" variant="outline" disabled={pending || lookupPending || lookupHuman.waiting}>{lookupPending ? contact.order.looking : contact.order.lookup}</UiButton>
              {lookupError ? <p role="alert" className="text-sm text-error">{lookupError}</p> : null}
            </form>
            {provenOrder ? <div data-contact-proven-order role="status" className="mt-5 rounded-card bg-light-3 p-4 text-sm">
              <p className="font-medium">{contact.order.linked}</p>
              <p className="mt-2 break-words text-mid-1">{orderLabel(provenOrder)}</p>
              <button type="button" disabled={pending} onClick={invalidateLookup} className="mt-3 underline underline-offset-4">{contact.order.remove}</button>
            </div> : null}
          </details>
        )}
      </section>

      <form onSubmit={submit} className="space-y-5 border-t border-light-2 pt-8" data-contact-form>
        <h2 className="text-xl font-semibold">{contact.message.title}</h2>
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="topic" value={topic ?? ""} />
        <input type="hidden" name="reason" value={reason} />
        <input type="hidden" name="orderNumber" value={isSignedIn ? accountOrder : provenOrder?.number ?? ""} />
        <input type="hidden" name="orderEmail" value={!isSignedIn && provenOrder ? lookupEmail.trim() : ""} />
        <fieldset disabled={pending} className="space-y-5">
          <UiInput id="contact-name" label={contact.message.name} name="name" autoComplete="name" defaultValue={defaults.name} required minLength={2} maxLength={120} />
          <UiInput id="contact-email" label={contact.message.email} name="email" type="email" autoComplete="email" defaultValue={defaults.email} required maxLength={254} />
          {topic === "ADVERSE" ? <p className="rounded-card bg-light-3 p-4 text-sm leading-relaxed text-mid-1">{contact.message.adverse}</p> : null}
          <UiFormField label={contact.message.text} htmlFor="contact-message">
            <textarea id="contact-message" name="message" required minLength={10} maxLength={5000} rows={7} aria-describedby="contact-message-hint" className="w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand" />
            <p id="contact-message-hint" className="text-sm leading-relaxed text-mid-1">{contact.message.hint}</p>
          </UiFormField>
          {topic === "WRONG" || topic === "DAMAGED" || topic === "RETURN" ? <UiFormField label={contact.message.photos} htmlFor="contact-photos">
            <input id="contact-photos" name="photos" type="file" ref={photos} accept="image/jpeg,image/png,image/webp" multiple aria-describedby="contact-photos-hint" className="w-full min-w-0 rounded-input border border-light-1 p-3 text-sm file:mr-3 file:rounded-btn file:border-0 file:bg-light-3 file:px-4 file:py-2" />
            <p id="contact-photos-hint" className="text-sm leading-relaxed text-mid-1">{contact.message.photosHint}</p>
          </UiFormField> : null}
          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm leading-relaxed text-mid-1">
              <input name="privacyAccepted" type="checkbox" required className="mt-1 size-4 shrink-0 accent-brand" />
              <span>{contact.message.privacy}</span>
            </label>
            <Link href={privacyHref} className="ml-7 inline-block text-sm text-mid-1 underline underline-offset-4">{contact.message.privacyLink}</Link>
          </div>
        </fieldset>
        {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
        {finalHuman.field}
        <UiButton type="submit" fullWidth disabled={pending || finalHuman.waiting}>{pending ? contact.message.submitting : contact.message.submit}</UiButton>
      </form>
    </div>
  );
}
