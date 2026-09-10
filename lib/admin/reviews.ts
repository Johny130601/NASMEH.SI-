import type { ReviewStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** Review moderation queries (§14.9): status queue with product, rating and photo filters. */

export const REVIEW_STATUSES = ["PENDING", "PUBLISHED", "REJECTED"] as const;

export interface ReviewFilters { status: ReviewStatus; product: string; rating: number | null; withPhotos: boolean }

export function parseReviewFilters(query: Record<string, string | string[] | undefined>): ReviewFilters {
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value ?? "").trim();
  const status = single(query.status).toUpperCase();
  const rating = Number.parseInt(single(query.ocena), 10);
  return {
    status: (REVIEW_STATUSES as readonly string[]).includes(status) ? status as ReviewStatus : "PENDING",
    product: single(query.izdelek).toLowerCase().slice(0, 80),
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    withPhotos: single(query.foto) === "1",
  };
}

export async function listReviews(filters: ReviewFilters) {
  const rows = await db.review.findMany({
    where: {
      status: filters.status,
      ...(filters.product ? { product: { slug: filters.product } } : {}),
      ...(filters.rating ? { rating: filters.rating } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      product: { select: { title: true, slug: true } },
      user: { select: { name: true, email: true } },
      orderItem: { select: { order: { select: { number: true, email: true } } } },
    },
  });
  // Photo presence lives in a JSON array; filter after the fetch (queues are small).
  return filters.withPhotos ? rows.filter((row) => Array.isArray(row.photos) && row.photos.length > 0) : rows;
}

export async function reviewCounts() {
  const groups = await db.review.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<ReviewStatus, number> = { PENDING: 0, PUBLISHED: 0, REJECTED: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}

export async function reviewedProducts() {
  return db.product.findMany({ where: { reviews: { some: {} } }, select: { slug: true, title: true }, orderBy: { title: "asc" } });
}
