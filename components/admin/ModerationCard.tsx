"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteReviewPhotoAction,
  moderateReviewAction,
} from "@/app/admin/(shell)/ocene/actions";
import { reviews as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { RatingStars } from "@/components/storefront/catalog/RatingStars";

interface PendingReview {
  id: string;
  rating: number;
  title: string | null;
  text: string;
  status: "PENDING" | "PUBLISHED" | "REJECTED";
  merchantReply: string | null;
  photos: string[];
  createdAt: string;
  email: string | null;
  productTitle: string;
  productSlug: string;
}

/** /admin/ocene queue card (§14.9). */
export function ModerationCard({ review }: { review: PendingReview }) {
  const router = useRouter();
  const [reply, setReply] = useState(review.merchantReply ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const decide = (decision: "approve" | "reject" | "reply") => {
    startTransition(async () => {
      try {
      const result = await moderateReviewAction({
        reviewId: review.id,
        decision,
        merchantReply: reply,
      });
      if (result.ok) {
        setMessage(copy.admin.done);
        router.refresh();
      } else setMessage(copy.admin.error);
      } catch { setMessage(copy.admin.error); }
    });
  };


  return (
    <article className="rounded-card border border-light-2 bg-white p-5" data-mod-card={review.id}>
      <div className="flex flex-wrap items-center gap-3">
        <RatingStars rating={{ average: review.rating, count: 1 }} showCount={false} />
        <span className="text-sm font-medium text-dark-1">{review.productTitle}</span>
        <span className="text-xs text-mid-2">
          {review.email ?? "—"} · {review.createdAt}
        </span>
      </div>
      {review.title ? (
        <p className="mt-2 text-sm font-medium text-dark-1">{review.title}</p>
      ) : null}
      <p className="mt-1 text-sm text-mid-1">{review.text}</p>

      {review.photos.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {review.photos.map((url) => (
            <li key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={copy.display.photoAlt} className="h-16 w-16 rounded-card object-cover" />
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    try {
                    const result = await deleteReviewPhotoAction({ reviewId: review.id, photoUrl: url });
                    setMessage(result.ok ? copy.admin.done : copy.admin.error);
                    router.refresh();
                    } catch { setMessage(copy.admin.error); }
                  })
                }
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-btn bg-error text-xs text-white"
                aria-label={copy.admin.deletePhoto}
                disabled={pending}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-dark-1">
        {copy.admin.replyLabel}
        <textarea
          rows={2}
          maxLength={1000}
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder={copy.admin.replyPlaceholder}
          className="rounded-input border border-light-1 bg-white px-4 py-3 text-base text-dark-1 outline-none focus:border-brand"
        />
      </label>

      {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <UiButton variant="outline" disabled={pending} onClick={() => decide("reply")} data-save-reply>{copy.admin.saveReply}</UiButton>
        <UiButton variant="primary" disabled={pending} onClick={() => decide("approve")} data-approve>
          {copy.admin.approve}
        </UiButton>
        <UiButton variant="outline" disabled={pending} onClick={() => decide("reject")} data-reject>
          {copy.admin.reject}
        </UiButton>
      </div>
    </article>
  );
}
