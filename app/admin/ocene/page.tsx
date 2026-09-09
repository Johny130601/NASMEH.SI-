import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { reviewPhotoPaths } from "@/lib/reviews/photos";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { reviews as copy } from "@/lib/copy";
import { ReviewSettings } from "@/components/admin/ReviewSettings";
import { getSetting } from "@/lib/settings";
import type { ReviewSettings as ReviewSettingsValues } from "@/lib/reviews/settings";
import { ModerationCard } from "@/components/admin/ModerationCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.admin.title,
  path: "/admin/ocene",
  noindex: true,
});

/** /admin/ocene — minimal operable moderation queue (§14.9). */
export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  if ((await auth())?.user?.role !== "ADMIN") redirect("/prijava");
  const query = await searchParams;
  const status = query.status === "PUBLISHED" || query.status === "REJECTED" ? query.status : "PENDING";
  const pending = await db.review.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    include: {
      product: { select: { title: true, slug: true } },
      orderItem: { include: { order: { select: { email: true } } } },
    },
  });

  const [autoPublish, delay] = await Promise.all([
    getSetting<unknown>("reviews.autoPublishMinStars"), getSetting<unknown>("reviews.requestDelayDays"),
  ]);
  const initial: ReviewSettingsValues = {
    autoPublishMinStars: autoPublish === 4 || autoPublish === 5 ? autoPublish : 0,
    requestDelayDays: typeof delay === "number" && Number.isInteger(delay) && delay >= 7 && delay <= 10 ? delay : 7,
  };
  return (
    <section className="mx-auto max-w-(--container-narrow) px-(--padding) py-16">
      <h1 className="text-[2rem]">{copy.admin.title}</h1>
      <ReviewSettings initial={initial} />
      <nav aria-label={copy.admin.title} className="mt-5 flex flex-wrap gap-4">
        {([ ["PENDING", copy.admin.pending], ["PUBLISHED", copy.admin.published], ["REJECTED", copy.admin.rejected] ] as const).map(([value, label]) => (
          <Link key={value} href={`?status=${value}`} aria-current={status === value ? "page" : undefined} className="text-sm underline underline-offset-4">{label}</Link>
        ))}
      </nav>
      {pending.length === 0 ? (
        <p className="mt-6 text-sm text-mid-2">{copy.admin.empty}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4" data-mod-queue>
          {pending.map((review) => (
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
                  email: review.orderItem?.order.email ?? null,
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
