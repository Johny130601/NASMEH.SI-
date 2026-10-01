import type { Metadata } from "next";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { buildMetadata } from "@/lib/seo";
import { getCompany } from "@/lib/settings";
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
 * passes the challenge and rate limit in the Server Action. The forms' own
 * field names prefill too: without JavaScript a submit reloads this page with
 * them, so the typed values stay (QA T4-F9).
 */
export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, company] = await Promise.all([searchParams, getCompany()]);
  const first = (...values: Array<string | string[] | undefined>) => {
    for (const value of values) {
      const text = Array.isArray(value) ? value[0] : value;
      if (text) return text;
    }
    return "";
  };
  const clip = (value: string, max: number) => value.slice(0, max);

  return (
    <section className="mx-auto max-w-md px-(--padding) py-16">
      <h1 className="text-[2rem]">{copy.title}</h1>
      <p className="mt-3 text-sm text-mid-1">{copy.intro}</p>
      {/* The forms submit their values back here (same parameter names), but the checked lookup needs JavaScript. */}
      <noscript>
        <p role="note" className="mt-4 rounded-card border border-warning bg-white p-4 text-sm text-dark-1" data-tracking-noscript>
          {copy.noScript}
          {company?.email ? (
            <>
              {" "}{copy.noScriptMail}{" "}
              <a href={`mailto:${company.email}`} className="underline underline-offset-4">{company.email}</a>.
            </>
          ) : null}
        </p>
      </noscript>
      <TrackingLookup
        challenge={getAuthChallengeProps()}
        defaults={{
          trackingNumber: clip(first(params.sledenje, params.trackingNumber), 80),
          email: clip(first(params.email), 254),
          orderNumber: clip(first(params.narocilo, params.orderNumber), 20),
        }}
      />
    </section>
  );
}
