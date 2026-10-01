import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { verifyRatingToken } from "@/lib/reviews/rating-token";
import { buildMetadata } from "@/lib/seo";
import { reviews as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.form.title,
  path: "/oceni",
  noindex: true,
});
metadata.referrer = "no-referrer";

/**
 * One-click email star link → full form with the rating prefilled (§10).
 * A tampered or expired token gets an explanation in the site layout with
 * the ways forward (the account, support) instead of a bare 400 text.
 */
export default async function QuickRatingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyRatingToken(token, getEnv().AUTH_SECRET);
  if (payload) redirect(`/oceni/${encodeURIComponent(payload.orderItemId)}?r=${encodeURIComponent(token)}`);
  const text = copy.invalidLink;
  return (
    <section className="mx-auto max-w-md px-(--padding) py-16" data-review-link-invalid>
      <h1 className="text-[2rem]">{text.title}</h1>
      <p className="mt-4 leading-relaxed text-mid-1">{text.body}</p>
      <p className="mt-3 leading-relaxed text-mid-1">{text.account}</p>
      <div className="mt-6">
        <UiButton href="/racun" variant="primary" fullWidth>{text.accountCta}</UiButton>
      </div>
      <p className="mt-6 text-sm leading-relaxed text-mid-1">
        {text.contact}{" "}
        <Link href="/kontakt" className="font-medium text-brand underline underline-offset-4">{text.contactCta}</Link>
      </p>
    </section>
  );
}
