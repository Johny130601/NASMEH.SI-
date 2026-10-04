import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { listReviews, parseReviewFilters, REVIEW_STATUSES, reviewCounts, reviewedProducts } from "@/lib/admin/reviews";
import { reviewPhotoPaths } from "@/lib/reviews/photos";
import { admin, reviews as copy } from "@/lib/copy";
import { isAnonymisedEmail } from "@/lib/admin/customers";
import { ReviewSettings } from "@/components/admin/ReviewSettings";
import { getSetting } from "@/lib/settings";
import type { ReviewSettings as ReviewSettingsValues } from "@/lib/reviews/settings";
import { ModerationCard } from "@/components/admin/ModerationCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: copy.admin.title, robots: { index: false, follow: false } };

const inputClass = "rounded-input border border-light-1 bg-white px-3 py-2 text-sm text-dark-1";

/** /admin/ocene — moderation queue with filters and verified-purchase linkage (§14.9). */
export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("reviews:moderate");
  const filters = parseReviewFilters(await searchParams);
  const [queue, counts, products, autoPublish, delay] = await Promise.all([
    listReviews(filters), reviewCounts(), reviewedProducts(),
    getSetting<unknown>("reviews.autoPublishMinStars"), getSetting<unknown>("reviews.requestDelayDays"),
  ]);
  const initial: ReviewSettingsValues = {
    autoPublishMinStars: autoPublish === 4 || autoPublish === 5 ? autoPublish : 0,
    requestDelayDays: typeof delay === "number" && Number.isInteger(delay) && delay >= 7 && delay <= 10 ? delay : 7,
  };
  const statusLabels = { PENDING: copy.admin.pending, PUBLISHED: copy.admin.published, REJECTED: copy.admin.rejected } as const;
  const keep = (status: string) => {
    const params = new URLSearchParams({ status });
    if (filters.product) params.set("izdelek", filters.product);
    if (filters.rating) params.set("ocena", String(filters.rating));
    if (filters.withPhotos) params.set("foto", "1");
    return `?${params.toString()}`;
  };

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-reviews>
      <h1 className="text-[2rem]">{copy.admin.title}</h1>
      <ReviewSettings initial={initial} />
      <nav aria-label={copy.admin.title} className="mt-5 flex flex-wrap gap-4">
        {REVIEW_STATUSES.map((value) => (
          <Link key={value} href={keep(value)} aria-current={filters.status === value ? "page" : undefined} className={`text-sm underline underline-offset-4 ${filters.status === value ? "font-medium" : ""}`} data-review-status={value}>
            {statusLabels[value]} ({counts[value]})
          </Link>
        ))}
      </nav>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-card border border-light-2 bg-white p-4" aria-label={copy.admin.filters.title} data-review-filters>
        <input type="hidden" name="status" value={filters.status} />
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.admin.filters.product}
          <select name="izdelek" defaultValue={filters.product} className={inputClass}>
            <option value="">{copy.admin.filters.all}</option>
            {products.map((product) => <option key={product.slug} value={product.slug}>{product.title}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.admin.filters.rating}
          <select name="ocena" defaultValue={filters.rating ?? ""} className={inputClass}>
            <option value="">{copy.admin.filters.all}</option>
            {[5, 4, 3, 2, 1].map((stars) => <option key={stars} value={stars}>{stars} ★</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="foto" value="1" defaultChecked={filters.withPhotos} className="size-4 accent-brand" />
          {copy.admin.filters.photos}
        </label>
        <button type="submit" className="rounded-btn bg-dark-1 px-4 py-2 text-sm text-white">{copy.admin.filters.apply}</button>
        <Link href={`?status=${filters.status}`} className="rounded-btn border border-light-1 px-4 py-2 text-sm">{copy.admin.filters.reset}</Link>
      </form>
      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-mid-2">{copy.admin.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4" data-mod-queue>
          {queue.map((review) => (
            <li key={review.id}>
              <ModerationCard
                review={{
                  id: review.id,
                  rating: review.rating,
                  title: review.title,
                  text: review.text,
                  photos: reviewPhotoPaths(review.photos),
                  merchantReply: review.merchantReply,
                  status: review.status,
                  createdAt: review.createdAt.toLocaleDateString("sl-SI"),
                  // an erased buyer's placeholder reads as the neutral label, as on every staff screen (QA 2026-10-03 V4-01)
                  email: ((email) => (email && isAnonymisedEmail(email) ? admin.common.anonymised : email))(review.orderItem?.order.email ?? review.user?.email ?? null),
                  customerName: review.user?.name ?? null,
                  orderNumber: review.orderItem?.order.number ?? null,
                  productTitle: review.product.title,
                  productSlug: review.product.slug,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
