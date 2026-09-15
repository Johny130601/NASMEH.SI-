import { z } from "zod";
import { reviewPhotoPaths } from "./photos";
import { aggregateRatings } from "./aggregate";
import { reviews as copy } from "@/lib/copy";

const filterSchema = z.object({
  sort: z.enum(["newest", "highest", "lowest"]).catch("newest"),
  stars: z.enum(["", "1", "2", "3", "4", "5"]).catch(""),
  photos: z.enum(["", "1"]).catch(""),
});
export type ReviewFilters = z.infer<typeof filterSchema>;
export function parseReviewFilters(input: { sort?: unknown; stars?: unknown; photos?: unknown }): ReviewFilters {
  return filterSchema.parse(input);
}
export function reviewFilterHref(filters: ReviewFilters, change: Partial<ReviewFilters>) {
  const next = { ...filters, ...change };
  const query = new URLSearchParams({ pregled: next.sort });
  if (next.stars) query.set("zvezdice", next.stars);
  if (next.photos) query.set("foto", next.photos);
  return `?${query.toString()}#mnenja`;
}

export interface DisplayReview {
  id: string;
  status: string;
  rating: number;
  title: string | null;
  text: string;
  photos: unknown;
  orderItemId: string | null;
  merchantReply: string | null;
  createdAt: Date;
  user?: { name: string | null } | null;
}
export function publishedReviews<T extends DisplayReview>(reviews: T[]): T[] {
  return reviews.filter((review) => review.status === "PUBLISHED");
}
export function filterReviews<T extends DisplayReview>(reviews: T[], filters: ReviewFilters): T[] {
  return publishedReviews(reviews).filter((review) =>
    (!filters.stars || review.rating === Number(filters.stars)) &&
    (!filters.photos || reviewPhotoPaths(review.photos).length > 0),
  ).sort((a, b) => {
    const ratingDiff = filters.sort === "highest" ? b.rating - a.rating : filters.sort === "lowest" ? a.rating - b.rating : 0;
    return ratingDiff || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
  });
}
/**
 * Public byline (GDPR Art. 5(1)(c)): the first name and the initial of the
 * last name ("Ana K."), a single name as it is, "Kupec" without a name. The
 * review form says so before submission; the JSON-LD author uses the same value.
 */
export function reviewAuthor(review: DisplayReview) {
  const parts = (review.user?.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return copy.display.customer;
  if (parts.length === 1) return parts[0];
  const initial = Array.from(parts[parts.length - 1])[0].toLocaleUpperCase("sl-SI");
  return `${parts[0]} ${initial}.`;
}

/**
 * "How reviews are verified" (UCPD Art. 7(6)): each point states what the
 * submission and moderation code does. The moderation line follows the
 * `reviews.autoPublishMinStars` Setting, read with the same fail-closed rule
 * as the submit action (only 4 or 5 publish without review).
 */
export function reviewVerificationPoints(autoPublishMinStars: unknown): string[] {
  const v = copy.display.verification;
  const moderation = autoPublishMinStars === 4 ? v.moderationAutoFour : autoPublishMinStars === 5 ? v.moderationAutoFive : v.moderationAll;
  return [v.buyers, v.onePerItem, moderation, v.lowRatings, v.badge.replace("{label}", copy.display.verified), v.replies.replace("{label}", copy.display.merchantReply)];
}
export function reviewStructuredData(reviews: DisplayReview[]) {
  const published = publishedReviews(reviews);
  const aggregate = aggregateRatings(published.map((review) => review.rating));
  if (!aggregate.count) return {};
  return {
    aggregateRating: { "@type": "AggregateRating", ratingValue: aggregate.average.toFixed(1), reviewCount: aggregate.count },
    review: filterReviews(published, { sort: "newest", stars: "", photos: "" }).slice(0, 5).map((review) => ({
      "@type": "Review",
      author: { "@type": "Person", name: reviewAuthor(review) },
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
      ...(review.title ? { name: review.title } : {}),
      ...(review.text ? { reviewBody: review.text } : {}),
      datePublished: review.createdAt.toISOString().slice(0, 10),
    })),
  };
}
