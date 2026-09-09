import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { legal } from "@/lib/copy";
import { returns } from "@/lib/copy/returns";
import { WithdrawalForm } from "@/components/storefront/support/WithdrawalForm";

export const dynamic = "force-dynamic";

const SLUG = "odstop-od-pogodbe";

export async function generateMetadata(): Promise<Metadata> {
  const page = await db.contentPage.findUnique({ where: { slug: SLUG } });
  return buildMetadata({
    title: page?.seoTitle ?? page?.title ?? SLUG,
    description: page?.seoDescription ?? undefined,
    path: `/${SLUG}`,
  });
}

/** Withdrawal page (§12.4): CMS legal body + online model form + downloadable PDF. */
export default async function WithdrawalPage() {
  const [page, session] = await Promise.all([
    db.contentPage.findFirst({ where: { slug: SLUG, published: true } }),
    auth(),
  ]);
  if (!page) notFound();
  const copy = returns.withdrawal;

  return (
    <article className="mx-auto max-w-(--container-narrow) px-(--padding) py-16">
      <h1 className="text-[2rem] md:text-[2.5rem]">{page.title}</h1>
      {page.template === "LEGAL" && !page.reviewed ? (
        <p role="note" className="mt-6 rounded-card border border-warning bg-white p-4 text-sm text-dark-1">
          {legal.draftNotice}
        </p>
      ) : null}
      <div className="content-prose mt-8" dangerouslySetInnerHTML={{ __html: page.body }} />

      <section aria-labelledby="withdrawal-form-title" className="mt-12 border-t border-light-2 pt-10" data-withdrawal-section>
        <h2 id="withdrawal-form-title" className="text-2xl">{copy.formTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-mid-1">{copy.formIntro}</p>
        <p className="mt-4 text-sm text-mid-1">
          <a href={`/${SLUG}/obrazec.pdf`} download data-withdrawal-pdf className="text-brand underline underline-offset-4">
            {copy.pdfCta}
          </a>
          {" "}· {copy.pdfNote}
        </p>
        <div className="mt-8">
          <WithdrawalForm
            challenge={getAuthChallengeProps()}
            requestKey={randomUUID()}
            defaults={{ name: session?.user?.name ?? "", email: session?.user?.email ?? "" }}
            maxDate={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <p className="mt-8 text-sm text-mid-1">
          <Link href="/garancija-vracila-denarja" data-guarantee-link className="underline underline-offset-4">
            {returns.guarantee.readMore}
          </Link>
        </p>
      </section>
    </article>
  );
}
