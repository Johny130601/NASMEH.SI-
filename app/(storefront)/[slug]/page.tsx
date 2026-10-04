import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { legal } from "@/lib/copy";
import { sellerBlockLines } from "@/lib/copy/legal";
import { getCompany } from "@/lib/settings";
import { companyPlaceholderFields } from "@/lib/settings-schemas";
import { sanitizeContentHtml } from "@/lib/security/html-sanitizer";
import { withHeadingIds } from "@/lib/content/toc";
import { LegalToc, TOC_TARGET_CLASS } from "@/components/storefront/content/LegalToc";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ slug: string }>;
}

async function getPage(slug: string) {
  return db.contentPage.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return buildMetadata({
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? undefined,
    path: `/${page.slug}`,
  });
}

/** ContentPage rendering (§12.5): DEFAULT, LEGAL (draft notice), CONTACT (form link), LANDING (wide, no date). */
export default async function ContentPageRoute({ params }: Params) {
  const { slug } = await params;
  const [page, company] = await Promise.all([getPage(slug), getCompany()]);
  if (!page) notFound();
  const landing = page.template === "LANDING";
  // The legal bodies name the seller "zgoraj" (terms §1/§2, privacy §1/§16), so
  // the block has to be here (ZVPot-1 pre-contract identity), server-rendered.
  const sellerLines = sellerBlockLines(company, companyPlaceholderFields(company));
  // Operator HTML from the Phase 7 editor, sanitized again on render (AGENTS §8.24). A LEGAL
  // body then gets its <h2> ids and table of contents — added after sanitizing, from the
  // heading text only (QA 2026-10-03 T1-04).
  const body = sanitizeContentHtml(page.body);
  const { html, toc } = page.template === "LEGAL" ? withHeadingIds(body) : { html: body, toc: [] };

  return (
    <article className={`mx-auto ${landing ? "max-w-(--container-wide)" : "max-w-(--container-narrow)"} px-(--padding) py-16`} data-content-template={page.template}>
      <h1 className="text-[2rem] md:text-[2.5rem]">{page.title}</h1>

      {page.template === "LEGAL" && !page.reviewed ? (
        <p
          role="note"
          className="mt-6 rounded-card border border-warning bg-white p-4 text-sm text-dark-1"
        >
          {legal.draftNotice}
        </p>
      ) : null}

      {landing ? null : (
        <p className="mt-4 text-xs text-mid-2">
          {legal.lastUpdated}:{" "}
          {page.updatedAt.toLocaleDateString("sl-SI", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}

      {page.template === "LEGAL" ? (
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
      ) : null}

      <LegalToc entries={toc} />

      <div
        className={`content-prose mt-8 ${toc.length > 0 ? TOC_TARGET_CLASS : ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {page.template === "CONTACT" ? (
        <p className="mt-8">
          <Link href="/kontakt" className="inline-flex min-h-12 items-center rounded-btn bg-dark-1 px-6 text-sm font-medium text-white">{legal.contactCta}</Link>
        </p>
      ) : null}
    </article>
  );
}
