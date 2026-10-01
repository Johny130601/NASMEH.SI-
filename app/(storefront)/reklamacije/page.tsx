import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { sanitizeContentHtml } from "@/lib/security/html-sanitizer";
import { buildMetadata } from "@/lib/seo";
import { legal } from "@/lib/copy";
import { sellerBlockLines } from "@/lib/copy/legal";
import { returns } from "@/lib/copy/returns";
import { getCompany } from "@/lib/settings";
import { companyPlaceholderFields } from "@/lib/settings-schemas";

export const dynamic = "force-dynamic";

const SLUG = "reklamacije";
const CTAS = [
  { href: "/kontakt?tema=DAMAGED", label: returns.complaints.damaged, key: "damaged" },
  { href: "/kontakt?tema=WRONG", label: returns.complaints.wrong, key: "wrong" },
  { href: "/odstop-od-pogodbe", label: returns.complaints.withdrawal, key: "withdrawal" },
  { href: "/prijava-nezelenega-ucinka", label: returns.complaints.adverse, key: "adverse" },
  { href: "/garancija-vracila-denarja", label: returns.complaints.guarantee, key: "guarantee" },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const page = await db.contentPage.findUnique({ where: { slug: SLUG } });
  return buildMetadata({
    title: page?.seoTitle ?? page?.title ?? SLUG,
    description: page?.seoDescription ?? undefined,
    path: `/${SLUG}`,
  });
}

/** Complaints page (§12.4): CMS process text + guided entry points into the real forms. */
export default async function ComplaintsPage() {
  const [page, company] = await Promise.all([
    db.contentPage.findFirst({ where: { slug: SLUG, published: true } }),
    getCompany(),
  ]);
  if (!page) notFound();
  // A complaint goes to the seller, so the body's process text needs the identity above it.
  const sellerLines = sellerBlockLines(company, companyPlaceholderFields(company));

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

      <section aria-labelledby="complaint-cta-title" className="mt-8 rounded-card border border-light-2 bg-white p-6" data-complaint-ctas>
        <h2 id="complaint-cta-title" className="text-xl">{returns.complaints.ctaTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-mid-1">{returns.complaints.ctaIntro}</p>
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {CTAS.map((cta) => (
            <li key={cta.key}>
              <Link
                href={cta.href}
                data-complaint-cta={cta.key}
                className="flex h-full items-center rounded-card border border-light-1 bg-white px-4 py-3 text-sm font-medium text-dark-1 transition-colors hover:border-brand"
              >
                {cta.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Operator HTML is sanitised on save and again here (AGENTS §8.24). */}
      <div className="content-prose mt-10" dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(page.body) }} />
    </article>
  );
}
