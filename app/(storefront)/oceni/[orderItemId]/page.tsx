import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { reviews as copy } from "@/lib/copy";
import { ReviewForm } from "@/components/storefront/reviews/ReviewForm";
import { canReviewItem } from "@/lib/reviews/access";
import { verifyRatingToken } from "@/lib/reviews/rating-token";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.form.title,
  path: "/oceni",
  noindex: true,
});
metadata.referrer = "no-referrer";

/** /oceni/[orderItemId] — review form (owner session or signed email token). */
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderItemId: string }>;
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const { orderItemId } = await params;
  const query = await searchParams;
  const r = typeof query.r === "string" ? query.r : "";

  const item = await db.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: true, variant: { include: { product: true } }, review: true },
  });
  if (!item || item.order.status !== "DELIVERED" || !item.variant) notFound();

  // session owner renders directly; guests need the signed token (?r=)
  const session = await auth();
  const secret = getEnv().AUTH_SECRET;
  if (!canReviewItem({ orderItemId, orderUserId: item.order.userId, sessionUserId: session?.user?.id, token: r, secret })) {
    // back to this form after signing in, not to the account page (QA 2026-10-03 N7)
    if (!r && !session?.user) redirect(`/prijava?callbackUrl=${encodeURIComponent(`/oceni/${orderItemId}`)}`);
    notFound();
  }
  // Only a star the shopper clicked in the review mail is preselected; from the
  // account no rating is chosen for them (a default 5 would inflate ratings,
  // UCPD Annex I 23b; QA 2026-10-03 T3-04).
  const defaultRating = verifyRatingToken(r, secret)?.rating ?? null;

  return (
    <section className="mx-auto max-w-md px-(--padding) py-16">
      <h1 className="text-[2rem]">{copy.form.title}</h1>
      <div className="mt-8">
        <ReviewForm
          orderItemId={item.id}
          defaultRating={defaultRating}
          ratingToken={r}
          productTitle={item.variant.product.title}
          alreadySubmitted={Boolean(item.review)}
        />
      </div>
    </section>
  );
}
