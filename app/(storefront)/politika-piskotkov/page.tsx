import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { cmp as copy, legal } from "@/lib/copy";
import { sellerBlockLines } from "@/lib/copy/legal";
import { getCompany, getConsentConfig } from "@/lib/settings";
import { companyPlaceholderFields } from "@/lib/settings-schemas";

export const dynamic = "force-dynamic";

const SLUG = "politika-piskotkov";

export async function generateMetadata(): Promise<Metadata> {
  const page = await db.contentPage.findUnique({ where: { slug: SLUG } });
  return buildMetadata({
    title: page?.seoTitle ?? page?.title ?? SLUG,
    description: page?.seoDescription ?? undefined,
    path: `/${SLUG}`,
  });
}

/** Cookie-policy page: CMS body + LIVE cookie table with each row's consent category (spec §3.4). */
export default async function CookiePolicyPage() {
  const page = await db.contentPage.findFirst({
    where: { slug: SLUG, published: true },
  });
  if (!page) notFound();
  const [{ cookies: cookieRows }, company] = await Promise.all([getConsentConfig(), getCompany()]);
  // The controller of the cookies described below is the seller (GDPR Art. 13(1)(a)).
  const sellerLines = sellerBlockLines(company, companyPlaceholderFields(company));

  return (
    <article className="mx-auto max-w-(--container-narrow) px-(--padding) py-16">
      <h1 className="text-[2rem] md:text-[2.5rem]">{page.title}</h1>

      {!page.reviewed ? (
        <p
          role="note"
          className="mt-6 rounded-card border border-warning bg-white p-4 text-sm text-dark-1"
        >
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

      <div
        className="content-prose mt-8"
        dangerouslySetInnerHTML={{ __html: page.body }}
      />

      <h2 className="mt-12 text-2xl">{copy.policy.tableTitle}</h2>
      <div className="mt-6 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead>
            <tr className="border-b border-light-2 text-xs uppercase tracking-[0.1em] text-mid-2">
              {copy.policy.columns.map((column) => (
                <th key={column} scope="col" className="px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-light-3">
            {cookieRows.map((cookie, index) => (
              <tr key={`${index}-${cookie.name}`} data-cookie-row={cookie.name} data-cookie-category={cookie.category}>
                <td className="px-4 py-3 font-medium text-dark-1">
                  {cookie.name}
                </td>
                <td className="px-4 py-3 text-mid-1">{copy.categories[cookie.category].label}</td>
                <td className="px-4 py-3 text-mid-1">{cookie.provider}</td>
                <td className="px-4 py-3 text-mid-1">{cookie.purpose}</td>
                <td className="px-4 py-3 text-mid-1">{cookie.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
