import { db } from "@/lib/db";
import { PURCHASABLE_PRODUCT_WHERE } from "@/lib/cart/visibility";
import { aggregateRatings } from "./aggregate";
import { reviewAuthor } from "./display";

/** Below this many published reviews the home grid is not rendered at all (no sparse, no padded grid). */
export const HOME_REVIEWS_MIN = 3;
/** Two rows of three on desktop. */
export const HOME_REVIEWS_LIMIT = 6;

export interface HomeReview {
  id: string;
  rating: number;
  title: string | null;
  text: string;
  /** Public byline (lib/reviews/display reviewAuthor). */
  author: string;
  /** Linked to an order line: the "verified buyer" pill. */
  verified: boolean;
  /** Month and year of publication in Slovenian ("oktober 2026"). */
  date: string;
  product: { slug: string; title: string };
}

export interface HomeReviews {
  reviews: HomeReview[];
  /** Over every published review in the store, rounded as the product pages round. */
  aggregate: { average: number; count: number };
}

const monthFormatter = new Intl.DateTimeFormat("sl-SI", { month: "long", year: "numeric" });

/** "oktober 2026" — the card names the month, not the day (the exact date adds nothing a shopper needs). */
export function reviewMonth(date: Date): string {
  return monthFormatter.format(date);
}

/** Pure selection rule, unit-tested: the grid needs at least HOME_REVIEWS_MIN reviews with text. */
export function homeReviewsShown(count: number): boolean {
  return count >= HOME_REVIEWS_MIN;
}

/**
 * The newest published reviews with text on products a shopper can still buy
 * (one query), plus the store-wide aggregate over every published review (the
 * figure the grid's summary line states). Null when there are too few: the
 * section is absent rather than thin — nothing here is ever padded or typed
 * (AGENTS §8.23).
 */
export async function getHomeReviews(): Promise<HomeReviews | null> {
  const [rows, ratings] = await Promise.all([
    db.review.findMany({
      where: { status: "PUBLISHED", text: { not: "" }, product: PURCHASABLE_PRODUCT_WHERE },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: HOME_REVIEWS_LIMIT,
      select: {
        id: true,
        rating: true,
        title: true,
        text: true,
        orderItemId: true,
        createdAt: true,
        user: { select: { name: true } },
        product: { select: { slug: true, title: true } },
      },
    }),
    db.review.findMany({ where: { status: "PUBLISHED" }, select: { rating: true } }),
  ]);
  if (!homeReviewsShown(rows.length)) return null;
  const aggregate = aggregateRatings(ratings.map((row) => row.rating));
  return {
    reviews: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      title: row.title,
      text: row.text,
      author: reviewAuthor({ ...row, status: "PUBLISHED", photos: null, merchantReply: null }),
      verified: row.orderItemId !== null,
      date: reviewMonth(row.createdAt),
      product: row.product,
    })),
    aggregate: { average: aggregate.average, count: aggregate.count },
  };
}
