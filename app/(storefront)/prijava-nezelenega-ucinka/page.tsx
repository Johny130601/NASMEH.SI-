import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { adverse as copy } from "@/lib/copy/adverse";
import { getLegalLinks } from "@/lib/settings";
import { getContactSettings } from "@/lib/support/settings";
import { AdverseEventForm } from "@/components/storefront/support/AdverseEventForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.title,
  description: copy.description,
  path: "/prijava-nezelenega-ucinka",
});

/** Adverse-event report page (§12.6): structured form routed to the compliance mailbox. */
export default async function AdverseEventPage() {
  const [session, settings, products, legalLinks] = await Promise.all([
    auth(),
    getContactSettings(),
    db.product.findMany({
      where: { status: { in: ["ACTIVE", "ARCHIVED"] } },
      select: { slug: true, title: true },
      orderBy: { title: "asc" },
    }),
    getLegalLinks(),
  ]);

  return (
    <div className="mx-auto w-full max-w-(--container-narrow) px-[var(--padding)] py-10 md:py-16">
      <header className="max-w-2xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-brand">{copy.eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{copy.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-mid-1 md:text-lg">{copy.intro}</p>
        <p role="note" className="mt-4 rounded-card border border-warning bg-white p-4 text-sm text-dark-1">{copy.notEmergency}</p>
      </header>
      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
        <AdverseEventForm
          challenge={getAuthChallengeProps()}
          requestKey={randomUUID()}
          products={products}
          defaults={{ name: session?.user?.name ?? "", email: session?.user?.email ?? "" }}
          maxDate={new Date().toISOString().slice(0, 10)}
          privacyHref={legalLinks.privacy}
        />
        <aside className="rounded-card bg-light-3 p-6" aria-labelledby="adverse-channel-title">
          <h2 id="adverse-channel-title" className="text-lg font-semibold">{copy.eyebrow}</h2>
          <p className="mt-3 break-words text-sm text-mid-1">
            <a className="underline underline-offset-4" href={`mailto:${settings.complianceEmail}`}>{settings.complianceEmail}</a>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-mid-1">{settings.responseTime}</p>
        </aside>
      </div>
    </div>
  );
}
