"use client";

import { useState, useTransition, type FormEvent } from "react";
import { submitReviewAction } from "@/app/(storefront)/actions/reviews";
import { reviews as copy } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { UiIcon } from "../ui/UiIcon";

/** Review form (§10): stars, title, text, ≤4 photos, optional attributes. */
export function ReviewForm({
  orderItemId,
  defaultRating,
  ratingToken,
  productTitle,
  alreadySubmitted = false,
}: {
  orderItemId: string;
  defaultRating: number;
  ratingToken: string;
  productTitle: string;
  alreadySubmitted?: boolean;
}) {
  const [rating, setRating] = useState(defaultRating);
  const [result, setResult] = useState<{ ok: boolean; error?: string; auto?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("rating", String(rating));
    form.set("orderItemId", orderItemId);
    form.set("ratingToken", ratingToken);
    startTransition(async () => {
      try {
        const outcome = await submitReviewAction(form);
        setResult({ ok: outcome.ok, error: outcome.error, auto: outcome.autoPublished });
      } catch { setResult({ ok: false, error: copy.form.genericError }); }
    });
  };

  if (result?.ok) {
    return (
      <div data-review-success className="rounded-card border border-success bg-white p-6 text-center">
        <p className="text-sm text-dark-1">
          {result.auto ? copy.form.successAuto : copy.form.success}
        </p>
      </div>
    );
  }

  // Keep this component mounted when the action revalidates its parent route:
  // the submitting browser retains its success state, while a fresh visit
  // correctly shows the existing-review notice and no submission controls.
  if (alreadySubmitted) return <p role="status">{copy.form.duplicate}</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-review-form>
      <p className="text-sm text-mid-1">{productTitle}</p>

      <fieldset>
        <legend className="text-sm font-medium text-dark-1">
          {copy.form.ratingLabel}
        </legend>
        <div className="mt-2 flex gap-1" role="radiogroup" aria-label={copy.form.ratingLabel}>
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer p-1">
              <input type="radio" name="rating" value={value} checked={rating === value}
                onChange={() => setRating(value)} aria-label={`${value} ${copy.display.starsLabel}`}
                className="peer sr-only" data-star={value} />
              <UiIcon name="star" className={`h-8 w-8 rounded-input peer-focus-visible:outline-2 peer-focus-visible:outline-brand ${value <= rating ? "fill-brand text-brand" : "text-light-1"}`} />
            </label>
          ))}
        </div>
      </fieldset>

      <UiInput
        label={copy.form.titleLabel}
        name="title"
        placeholder={copy.form.titlePlaceholder}
        maxLength={120}
      />
      <label className="flex flex-col gap-1.5 text-sm font-medium text-dark-1">
        {copy.form.textLabel}
        <textarea
          name="text"
          rows={4}
          maxLength={2000}
          placeholder={copy.form.textPlaceholder}
          className="rounded-input border border-light-1 bg-white px-4 py-3 text-base text-dark-1 outline-none transition-colors focus:border-brand"
        />
      </label>

      <div>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-dark-1">
          {copy.form.photosLabel}
          <input
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="text-sm text-mid-1"
            data-photos-input
          />
        </label>
        <p className="mt-1 text-xs text-mid-2">{copy.form.photosNote}</p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-dark-1">
        {copy.form.sensitivityLabel}
        <select
          name="sensitivity"
          defaultValue=""
          className="h-[3.25rem] rounded-input border border-light-1 bg-white px-4 text-base text-dark-1 outline-none focus:border-brand"
        >
          <option value="">—</option>
          {copy.form.sensitivityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-mid-1">
        <input type="checkbox" name="recommend" />
        {copy.form.recommendLabel}
      </label>

      {result?.error ? (
        <p role="alert" className="text-sm text-error">
          {result.error}
        </p>
      ) : null}
      <UiButton type="submit" variant="primary" fullWidth disabled={pending}>
        {copy.form.submit}
      </UiButton>
    </form>
  );
}
