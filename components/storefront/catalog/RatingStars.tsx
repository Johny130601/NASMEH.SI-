import { UiIcon } from "../ui/UiIcon";

/**
 * Honest rating display: renders real stars + count from Review aggregates;
 * renders nothing visible when there are no reviews yet (no fake stars).
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
          <span className="flex items-center gap-0.5" role="img" aria-label={`${rating.average.toFixed(1)} / 5`}>
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
