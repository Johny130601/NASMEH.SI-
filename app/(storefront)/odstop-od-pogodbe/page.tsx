import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAuthChallengeProps } from "@/lib/auth-challenge";
import { db } from "@/lib/db";
import { sanitizeContentHtml } from "@/lib/security/html-sanitizer";
import { withHeadingIds } from "@/lib/content/toc";
import { LegalToc, TOC_TARGET_CLASS } from "@/components/storefront/content/LegalToc";
import { buildMetadata } from "@/lib/seo";
import { legal } from "@/lib/copy";
import { sellerBlockLines } from "@/lib/copy/legal";
import { returns } from "@/lib/copy/returns";
import { getCompany, getLegalLinks } from "@/lib/settings";
import { companyPlaceholderFields } from "@/lib/settings-schemas";
import { shopToday } from "@/lib/support/validation";
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
  const [page, session, legalLinks, company] = await Promise.all([
    db.contentPage.findFirst({ where: { slug: SLUG, published: true } }),
    auth(),
    getLegalLinks(),
    getCompany(),
  ]);
  if (!page) notFound();
  const copy = returns.withdrawal;
  // The body's §1 tells the consumer whom to notify "zgoraj" (CRD Annex I(A)).
  const sellerLines = sellerBlockLines(company, companyPlaceholderFields(company));
  // the body's <h2>s get ids and a table of contents (spec §12.5 "legal w/ TOC")
  const { html, toc } = withHeadingIds(sanitizeContentHtml(page.body));

  return (
    <article className="mx-auto max-w-(--container-narrow) px-(--padding) py-16">
      <h1 className="text-[2rem] md:text-[2.5rem]">{page.title}</h1>
      {page.template === "LEGAL" && !page.reviewed ? (
        <p role="note" className="mt-6 rounded-card border border-warning bg-white p-4 text-sm text-dark-1">
          {legal.draftNotice}
        </p>
      ) : null}

      <section className="mt-6 rounded-card border border-light-2 bg-white p-4" data-seller-block>
        <h2 className="text-sm font-medium text-dark-1">{legal.seller.title}</h2>
        {sellerLines ? (
          <address className="mt-2 text-xs not-italic leading-6 text-mid-1">
            {sellerLines.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </address>
        ) : (
          <p className="mt-2 text-xs text-mid-2">{legal.seller.missing}</p>
        )}
      </section>

      <LegalToc entries={toc} />

      {/* Operator HTML is sanitised on save and again here (AGENTS §8.24); the heading ids and the contents are added after that (QA 2026-10-03 T1-04). */}
      <div className={`content-prose mt-8 ${toc.length > 0 ? TOC_TARGET_CLASS : ""}`} dangerouslySetInnerHTML={{ __html: html }} />

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
            maxDate={shopToday()}
            privacyHref={legalLinks.privacy}
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
