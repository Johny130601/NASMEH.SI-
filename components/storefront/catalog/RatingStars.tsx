import { formatAverage } from "@/lib/reviews/aggregate";
import { reviews } from "@/lib/copy/reviews";
import { UiIcon } from "../ui/UiIcon";

/**
 * Honest rating display: renders real stars + count from Review aggregates;
 * renders nothing visible when there are no reviews yet (no fake stars).
 * The stars are read out as "Ocena 3,5 od 5": the same decimal comma as the
 * visible average (formatAverage); only the JSON-LD keeps the dotted figure.
 */
export function RatingStars({
  rating,
  showCount = true,
  className = "",
}: {
  rating: { average: number; count: number } | null;
  showCount?: boolean;
  className?: string;
}) {
  return (
    <span
      data-rating-slot
      className={`inline-flex items-center gap-1 ${className}`}
      aria-hidden={rating === null}
    >
      {rating && rating.count > 0 ? (
        <>
          <span className="flex items-center gap-0.5" role="img" aria-label={reviews.display.ratingAria(formatAverage(rating.average))}>
            {Array.from({ length: 5 }, (_, index) => (
              <UiIcon
                key={index}
                name="star"
                className={`h-3.5 w-3.5 ${
                  index < Math.round(rating.average)
                    ? "fill-brand text-brand"
                    : "text-light-1"
                }`}
              />
            ))}
          </span>
          {showCount ? (
            <span className="text-xs text-mid-2">({rating.count})</span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
