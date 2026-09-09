import Link from "next/link";
import { reviewPhotoPaths, reviewPhotoSrcSet } from "@/lib/reviews/photos";
import { parseReviewFilters, filterReviews, publishedReviews, reviewFilterHref, reviewAuthor, type DisplayReview } from "@/lib/reviews/display";
import { aggregateRatings } from "@/lib/reviews/aggregate";
import { reviews as copy } from "@/lib/copy";
import { RatingStars } from "../catalog/RatingStars";
import { UiIcon } from "../ui/UiIcon";
import { UiPill } from "../ui/UiPill";

type SortKey = keyof typeof copy.display.sort;

interface ReviewsSectionProps {
  reviews: DisplayReview[];
  sort?: unknown;
  stars?: unknown;
  photos?: unknown;
}

/** PDP reviews (§10): summary + distribution, photo wall, cards, sort/filter SSR. */
export function ReviewsSection({
  reviews,
  sort = "newest",
  stars = "",
  photos = "",
}: ReviewsSectionProps) {
  const published = publishedReviews(reviews);
  const filters = parseReviewFilters({ sort, stars, photos });
  const aggregate = aggregateRatings(published.map((review) => review.rating));
  const photoWall = published.flatMap((review) => reviewPhotoPaths(review.photos));
  const sorted = filterReviews(published, filters);
  const sortKey = filters.sort;
  const href = (change: Partial<typeof filters>) => reviewFilterHref(filters, change);

  return (
    <section id="mnenja" data-reviews-section className="mt-20 max-w-(--container-narrow)">
      <h2 className="text-2xl md:text-[2rem]">{copy.display.title}</h2>

      {aggregate.count === 0 ? (
        <p className="mt-4 text-sm text-mid-2">{copy.display.empty}</p>
      ) : (
        <>
          {/* summary + distribution */}
          <div className="mt-6 grid gap-6 rounded-card border border-light-2 bg-white p-6 md:grid-cols-2">
            <div className="flex items-center gap-4">
              <p className="text-5xl font-light text-dark-1">{aggregate.average.toFixed(1)}</p>
              <div>
                <RatingStars
                  rating={{ average: aggregate.average, count: aggregate.count }}
                />
                <p className="mt-1 text-xs text-mid-2">
                  {copy.display.basedOn} {aggregate.count} {copy.display.reviewsCount}
                </p>
              </div>
            </div>
            <div aria-label={copy.display.distribution}>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = aggregate.distribution[star - 1];
                const percent = aggregate.percentDistribution[star - 1];
                return (
                  <div key={star} className="flex items-center gap-2 text-xs text-mid-1">
                    <span className="w-3">{star}★</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-btn bg-light-2">
                      <div
                        className="h-full rounded-btn bg-brand"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="w-6 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* photo wall */}
          {photoWall.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-dark-1">{copy.display.photoWall}</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {photoWall.slice(0, 12).map((url) => (
                  <li key={url} className="h-20 w-20 overflow-hidden rounded-card bg-light-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} srcSet={reviewPhotoSrcSet(url)} sizes="80px" alt={copy.display.photoAlt} loading="lazy" className="h-full w-full object-cover" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* sort + filters (SSR links) */}
          <div className="mt-8 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-mid-2">{copy.display.sortLabel}:</span>
            {(Object.keys(copy.display.sort) as SortKey[]).map((key) => (
              <Link
                key={key}
                href={href({ sort: key })}
                data-sort={key}
                className={`rounded-btn px-3 py-1.5 transition-colors ${
                  sortKey === key ? "bg-dark-1 text-white" : "bg-light-3 text-dark-1 hover:bg-light-2"
                }`}
              >
                {copy.display.sort[key]}
              </Link>
            ))}
            <span className="ml-4 text-mid-2">{copy.display.filterStars}:</span>
            <Link
              href={href({ stars: "" })}
              className={`rounded-btn px-3 py-1.5 transition-colors ${
                !filters.stars ? "bg-dark-1 text-white" : "bg-light-3 text-dark-1 hover:bg-light-2"
              }`}
            >
              {copy.display.allStars}
            </Link>
            {([5, 4, 3, 2, 1] as const).map((star) => (
              <Link
                key={star}
                href={href({ stars: String(star) as typeof filters.stars })}
                data-filter-stars={star}
                className={`rounded-btn px-3 py-1.5 transition-colors ${
                  filters.stars === String(star) ? "bg-dark-1 text-white" : "bg-light-3 text-dark-1 hover:bg-light-2"
                }`}
              >
                {star}★
              </Link>
            ))}
            <Link
              href={href({ photos: filters.photos ? "" : "1" })}
              data-filter-photos
              className={`rounded-btn px-3 py-1.5 transition-colors ${
                filters.photos === "1" ? "bg-dark-1 text-white" : "bg-light-3 text-dark-1 hover:bg-light-2"
              }`}
            >
              {copy.display.filterPhotos}
            </Link>
          </div>

          {sorted.length === 0 ? <p className="mt-6 text-sm text-mid-2">{copy.display.noMatches}</p> : null}
          {/* review cards */}
          <ul className="mt-6 flex flex-col gap-4" data-review-list>
            {sorted.map((review) => (
              <li key={review.id} data-review-id={review.id} className="rounded-card border border-light-2 bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <RatingStars rating={{ average: review.rating, count: 1 }} showCount={false} />
                  {review.title ? (
                    <span className="text-sm font-medium text-dark-1">{review.title}</span>
                  ) : null}
                  {review.orderItemId ? (
                    <UiPill variant="success">{copy.display.verified}</UiPill>
                  ) : null}
                </div>
                {review.text ? (
                  <p className="mt-2 text-sm leading-6 text-mid-1">{review.text}</p>
                ) : null}
                {reviewPhotoPaths(review.photos).length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {reviewPhotoPaths(review.photos).map((url) => (
                      <li key={url} className="h-16 w-16 overflow-hidden rounded-card bg-light-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} srcSet={reviewPhotoSrcSet(url)} sizes="80px" alt={copy.display.photoAlt} loading="lazy" className="h-full w-full object-cover" />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 flex items-center gap-2 text-xs text-mid-2">
                  <UiIcon name="star" className="h-3 w-3" />
                  {reviewAuthor(review)} ·{" "}
                  {review.createdAt.toLocaleDateString("sl-SI", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                {review.merchantReply ? (
                  <div className="mt-3 rounded-card bg-light-4 p-4">
                    <p className="text-xs font-medium text-dark-1">
                      {copy.display.merchantReply}
                    </p>
                    <p className="mt-1 text-sm text-mid-1">{review.merchantReply}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8 rounded-card border border-light-2 bg-light-4 p-5 text-center">
        <Link href="/racun" className="text-sm font-medium text-dark-1 underline underline-offset-4">{copy.display.writeCta}</Link>
        <p className="mt-1 text-xs text-mid-2">{copy.display.writeNote}</p>
      </div>
    </section>
  );
}
