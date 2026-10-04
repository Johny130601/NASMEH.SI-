"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { submitAdverseEventAction } from "@/app/(storefront)/actions/adverse";
import { adverse as copy } from "@/lib/copy/adverse";
import { ADVERSE_REPORTER_TYPES } from "@/lib/support/topics";
import { useAuthChallenge, type AuthChallengeProps } from "../auth/AuthChallenge";
import { supportPhotosWithinLimits } from "../reviews/photo-downscale";
import { UiButton } from "../ui/UiButton";
import { UiFormField, UiInput } from "../ui/UiInput";
import { ResultHeading } from "../ui/ResultHeading";

const selectClass = "min-h-[3.25rem] w-full rounded-input border border-light-1 bg-white px-4 text-base outline-none focus:border-brand";
const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";

function YesNo({ name, label }: { name: "ongoing" | "medicalTreatment"; label: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-dark-1">{label}</legend>
      <div className="flex gap-6 text-sm text-mid-1">
        {(["yes", "no"] as const).map(value => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name={name} value={value} required className="size-4 accent-brand" />
            {value === "yes" ? copy.reaction.yes : copy.reaction.no}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Adverse-event report (§12.6): structured fields; the batch number or an explicit "unknown". */
export function AdverseEventForm({
  challenge, requestKey: initialRequestKey, products, defaults, maxDate, privacyHref,
}: {
  challenge: AuthChallengeProps;
  requestKey: string;
  products: Array<{ slug: string; title: string }>;
  defaults: { name: string; email: string };
  maxDate: string;
  /** `legal.links` privacy path. */
  privacyHref: string;
}) {
  const [requestKey] = useState(initialRequestKey);
  const human = useAuthChallenge(challenge);
  const [pending, startSubmit] = useTransition();
  const submitting = useRef(false);
  const photos = useRef<HTMLInputElement>(null);
  const [batchUnknown, setBatchUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    const data = new FormData(event.currentTarget);
    // Send only actual selections (the untouched input yields an empty part).
    const selected = Array.from(photos.current?.files ?? []);
    data.delete("photos");
    submitting.current = true;
    startSubmit(async () => {
      let sent = false;
      try {
        // A phone photo over the cap is downscaled in the browser before it is
        // refused, as on the review form (QA 2026-10-03 T3-06).
        const files = await supportPhotosWithinLimits(selected);
        if (!files) { setError(copy.errors.photos); return; }
        for (const file of files) data.append("photos", file, file.name);
        sent = true;
        const result = await submitAdverseEventAction(data);
        if (result.ok && result.reference) setReference(result.reference);
        else setError(result.error ?? copy.errors.failed);
      } catch { setError(copy.errors.failed); }
      finally { submitting.current = false; if (sent) human.reset(); }
    });
  }

  if (reference) return (
    <div role="status" data-adverse-success className="rounded-card border border-success bg-white p-6 md:p-8">
      <ResultHeading className="text-2xl font-semibold">{copy.success.title}</ResultHeading>
      <p className="mt-3 leading-relaxed text-mid-1">{copy.success.body}</p>
      <p className="mt-6 text-sm font-medium">{copy.success.reference}</p>
      <p data-adverse-reference className="mt-1 break-all text-xl font-semibold text-brand">{reference}</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-9" data-adverse-form>
      <input type="hidden" name="requestKey" value={requestKey} />
      <fieldset disabled={pending} className="space-y-5">
        <legend className="mb-2 text-xl font-semibold">{copy.sections.reporter}</legend>
        <UiInput id="adverse-name" label={copy.reporter.name} name="name" autoComplete="name" defaultValue={defaults.name} required minLength={2} maxLength={120} />
        <UiInput id="adverse-email" label={copy.reporter.email} name="email" type="email" autoComplete="email" defaultValue={defaults.email} required maxLength={254} />
        <UiInput id="adverse-phone" label={copy.reporter.phone} name="phone" type="tel" autoComplete="tel" maxLength={40} />
        <UiFormField label={copy.reporter.type} htmlFor="adverse-reporter-type">
          <select id="adverse-reporter-type" name="reporterType" required defaultValue="USER" className={selectClass}>
            {ADVERSE_REPORTER_TYPES.map(type => <option key={type} value={type}>{copy.reporter.types[type]}</option>)}
          </select>
        </UiFormField>
      </fieldset>

      <fieldset disabled={pending} className="space-y-5">
        <legend className="mb-2 text-xl font-semibold">{copy.sections.product}</legend>
        <UiFormField label={copy.product.select} htmlFor="adverse-product">
          <select id="adverse-product" name="productSlug" required defaultValue="" className={selectClass}>
            <option value="" disabled>{copy.product.choose}</option>
            {products.map(product => <option key={product.slug} value={product.slug}>{product.title}</option>)}
          </select>
        </UiFormField>
        {/* A disabled input is not submitted, so "unknown" sends no stale batch number. */}
        <UiInput id="adverse-batch" label={copy.product.batch} hint={copy.product.batchHint} name="batchNumber" required={!batchUnknown} disabled={batchUnknown} minLength={3} maxLength={40} />
        <label className="flex items-start gap-3 text-sm leading-relaxed text-mid-1">
          <input name="batchUnknown" type="checkbox" checked={batchUnknown} onChange={event => setBatchUnknown(event.target.checked)} className="mt-1 size-4 shrink-0 accent-brand" />
          <span>{copy.product.batchUnknown}</span>
        </label>
        <UiInput id="adverse-purchase-place" label={copy.product.purchasePlace} name="purchasePlace" required minLength={2} maxLength={120} />
        <UiInput id="adverse-purchase-date" label={copy.product.purchaseDate} name="purchaseDate" type="date" max={maxDate} />
        <UiInput id="adverse-order" label={copy.product.orderNumber} hint={copy.product.orderNumberHint} name="orderNumber" maxLength={20} />
      </fieldset>

      <fieldset disabled={pending} className="space-y-5">
        <legend className="mb-2 text-xl font-semibold">{copy.sections.reaction}</legend>
        <UiFormField label={copy.reaction.reasonLabel} htmlFor="adverse-reason">
          <select id="adverse-reason" name="reason" defaultValue="REACTION" className={selectClass}>
            <option value="REACTION">{copy.reaction.reasons.REACTION}</option>
            <option value="PRODUCT_SAFETY">{copy.reaction.reasons.PRODUCT_SAFETY}</option>
          </select>
        </UiFormField>
        <UiFormField label={copy.reaction.description} htmlFor="adverse-description">
          <textarea id="adverse-description" name="description" required minLength={20} maxLength={5000} rows={6} aria-describedby="adverse-description-hint" className={textareaClass} />
          <p id="adverse-description-hint" className="text-sm leading-relaxed text-mid-1">{copy.reaction.descriptionHint}</p>
        </UiFormField>
        <UiInput id="adverse-onset" label={copy.reaction.onsetDate} name="onsetDate" type="date" max={maxDate} />
        <YesNo name="ongoing" label={copy.reaction.ongoing} />
        <YesNo name="medicalTreatment" label={copy.reaction.medicalTreatment} />
        <UiFormField label={copy.reaction.medicalDetails} htmlFor="adverse-medical">
          <textarea id="adverse-medical" name="medicalDetails" maxLength={2000} rows={3} className={textareaClass} />
        </UiFormField>
        <UiFormField label={copy.reaction.photos} htmlFor="adverse-photos">
          <input id="adverse-photos" name="photos" type="file" ref={photos} accept="image/jpeg,image/png,image/webp" multiple aria-describedby="adverse-photos-hint" className="w-full min-w-0 rounded-input border border-light-1 p-3 text-sm file:mr-3 file:rounded-btn file:border-0 file:bg-light-3 file:px-4 file:py-2" />
          <p id="adverse-photos-hint" className="text-sm leading-relaxed text-mid-1">{copy.reaction.photosHint}</p>
        </UiFormField>
      </fieldset>

      <fieldset disabled={pending} className="space-y-3">
        <legend className="mb-2 text-xl font-semibold">{copy.sections.consent}</legend>
        <label className="flex items-start gap-3 text-sm leading-relaxed text-mid-1">
          <input name="privacyAccepted" type="checkbox" required className="mt-1 size-4 shrink-0 accent-brand" />
          <span>{copy.consent.privacy}</span>
        </label>
        <Link href={privacyHref} className="ml-7 inline-block text-sm text-mid-1 underline underline-offset-4">{copy.consent.privacyLink}</Link>
        <label className="flex items-start gap-3 text-sm leading-relaxed text-mid-1">
          <input name="contactPermission" type="checkbox" className="mt-1 size-4 shrink-0 accent-brand" />
          <span>{copy.consent.contact}</span>
        </label>
      </fieldset>

      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
      {human.field}
      <UiButton type="submit" fullWidth disabled={pending || human.waiting}>{pending ? copy.submitting : copy.submit}</UiButton>
    </form>
  );
}
