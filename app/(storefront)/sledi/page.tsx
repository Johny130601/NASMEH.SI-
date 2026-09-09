import type { Metadata } from "next";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { buildMetadata } from "@/lib/seo";
import { tracking as copy } from "@/lib/copy/tracking";
import { TrackingLookup } from "@/components/storefront/tracking/TrackingLookup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.title,
  description: copy.description,
  path: "/sledi",
  noindex: true,
});

/**
 * Public tracking (§12.3): tracking number or e-mail + order number. Links
 * from the shipped email and the account only prefill; every lookup still
 * passes the challenge and rate limit in the Server Action.
 */
export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ sledenje?: string; email?: string; narocilo?: string }>;
}) {
  const params = await searchParams;
  const clip = (value: string | undefined, max: number) => (value ?? "").slice(0, max);

  return (
    <section className="mx-auto max-w-md px-(--padding) py-16">
      <h1 className="text-[2rem]">{copy.title}</h1>
      <p className="mt-3 text-sm text-mid-1">{copy.intro}</p>
      <TrackingLookup
        challenge={getAuthChallengeProps()}
        defaults={{
          trackingNumber: clip(params.sledenje, 80),
          email: clip(params.email, 254),
          orderNumber: clip(params.narocilo, 20),
        }}
      />
    </section>
  );
}
