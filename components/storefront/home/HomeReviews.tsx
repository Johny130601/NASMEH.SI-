import Link from "next/link";
import type { HomeReviews as HomeReviewsData } from "@/lib/reviews/home";
import { formatAverage } from "@/lib/reviews/aggregate";
import { home } from "@/lib/copy/home";
import { reviews as reviewsCopy } from "@/lib/copy/reviews";
import { RatingStars } from "../catalog/RatingStars";
import { UiPill } from "../ui/UiPill";

/**
 * Home review grid (2026-10-10 redesign, research 02 §5 social proof): the
 * newest published reviews as quote cards — stars, title, text, byline with
 * the verified-buyer pill, the product (linking to its reviews) and the month.
 * The summary line is the store-wide aggregate. The page renders it only when
 * lib/reviews/home returns data, so there is never an empty or padded grid.
 * Phones get the first three cards; the grid reveals on scroll and the cards
 * cascade in (.ui-reveal-stagger) and lift on hover (transform and opacity).
 */
export function HomeReviews({ data }: { data: HomeReviewsData }) {
  const { reviews, aggregate } = data;
  return (
    <section id="mnenja-strank" className="ui-reveal mx-auto max-w-(--container-wide) px-(--padding) py-16" data-home-reviews>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl md:text-[2rem]">{home.reviews.title}</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-mid-1" data-home-reviews-summary>
          <RatingStars rating={aggregate} showCount={false} />
          <span>{home.reviews.summary(formatAverage(aggregate.average), aggregate.count)}</span>
        </p>
      </div>

      <ul className="ui-reveal-stagger mt-8 grid gap-4 md:grid-cols-3 md:gap-5" aria-label={home.reviews.listLabel}>
        {reviews.map((review, index) => (
          <li
            key={review.id}
            className={`group relative flex flex-col rounded-panel bg-white p-6 shadow-card transition-[translate] duration-300 ease-out-quart after:pointer-events-none after:absolute after:inset-0 after:rounded-panel after:opacity-0 after:shadow-card-hover after:transition-opacity after:duration-300 after:ease-out-quart hover:-translate-y-1 hover:after:opacity-100 ${
              index >= 3 ? "max-md:hidden" : ""
            }`}
            data-home-review
          >
            <RatingStars rating={{ average: review.rating, count: 1 }} showCount={false} />
            {review.title ? <p className="mt-4 font-medium text-dark-1">{review.title}</p> : null}
            <blockquote className={`${review.title ? "mt-1.5" : "mt-4"} text-sm leading-6 text-dark-2 line-clamp-5`}>
              „{review.text}“
            </blockquote>
            <footer className="mt-auto pt-5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-dark-1">
                {review.author}
                {review.verified ? <UiPill variant="success">{reviewsCopy.display.verified}</UiPill> : null}
              </p>
              <p className="mt-1 text-xs text-mid-2">
                <Link href={`/izdelek/${review.product.slug}#mnenja`} className="underline-offset-2 hover:underline">
                  {review.product.title}
                </Link>
                {" · "}
                {review.date}
              </p>
            </footer>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs text-mid-2">{home.reviews.note}</p>
    </section>
  );
}
