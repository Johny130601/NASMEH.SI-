import type { Metadata } from "next";
import Link from "next/link";
import { getCatalogProducts, type CatalogProduct } from "@/lib/catalog";
import { getOmnibusLowestCents } from "@/lib/omnibus";
import { isTestMode } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { catalog } from "@/lib/copy";
import { CatalogCard } from "@/components/storefront/catalog/CatalogCard";
import { UiIcon } from "@/components/storefront/ui/UiIcon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: catalog.title,
  description: catalog.seoBlock.teaser,
  path: "/trgovina",
});

type SortKey = keyof typeof catalog.sort.options;
type TabKey = keyof typeof catalog.tabs;

const SORTS = Object.keys(catalog.sort.options) as SortKey[];
const TABS = Object.keys(catalog.tabs) as TabKey[];

function applySort(products: CatalogProduct[], sort: SortKey): CatalogProduct[] {
  const sorted = [...products];
  switch (sort) {
    case "najnovejse":
      return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case "cena-vzpadno":
      return sorted.sort((a, b) => a.priceCents - b.priceCents);
    case "cena-padajco":
      return sorted.sort((a, b) => b.priceCents - a.priceCents);
    case "naziv-az":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, "sl"));
    case "naziv-za":
      return sorted.sort((a, b) => b.title.localeCompare(a.title, "sl"));
    case "priporoceno":
    default:
      return sorted; // seed/collection merchandising order
  }
}

/** /trgovina (§5): banner, deep-linkable tabs, sort in URL, grid, SEO block. */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ kolekcija?: string; razvrsti?: string }>;
}) {
  const params = await searchParams;
  const tab: TabKey = TABS.includes(params.kolekcija as TabKey)
    ? (params.kolekcija as TabKey)
    : "all";
  const sort: SortKey = SORTS.includes(params.razvrsti as SortKey)
    ? (params.razvrsti as SortKey)
    : "priporoceno";

  const products = applySort(
    await getCatalogProducts(
      tab === "all" ? undefined : { collectionSlug: tab },
    ),
    sort,
  );

  // Omnibus lines for discounted cards (few — per-product lookup)
  const omnibusBySlug = new Map<string, number>();
  for (const product of products) {
    if (
      product.compareAtPriceCents !== null &&
      product.compareAtPriceCents > product.priceCents
    ) {
      const lowest = await getOmnibusLowestCents(product.variantId);
      if (lowest !== null) omnibusBySlug.set(product.slug, lowest);
    }
  }

  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  const hrefFor = (nextTab: TabKey, nextSort: SortKey) =>
    `/trgovina?kolekcija=${nextTab}&razvrsti=${nextSort}`;

  return (
    <>
      {/* full-width promo banner (separate mobile crop) */}
      {/* intrinsic sizes reserve the banner's box before the artwork arrives (no layout shift) */}
      <picture>
        <source srcSet="/uploads/placeholder-trgovina-mobile.svg" media="(width < 768px)" width={800} height={500} />
        <img
          src="/uploads/placeholder-trgovina-wide.svg"
          alt={catalog.bannerAlt}
          width={1600}
          height={500}
          className="h-auto w-full object-cover"
        />
      </picture>

      <div className="mx-auto max-w-(--container-wide) px-(--padding) py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* collection tabs — deep-linkable */}
          <nav aria-label={catalog.title}>
            <ul className="flex flex-wrap gap-2" data-collection-tabs>
              {TABS.map((key) => (
                <li key={key}>
                  <Link
                    href={hrefFor(key, sort)}
                    aria-current={tab === key ? "page" : undefined}
                    data-tab={key}
                    className={`inline-flex h-10 items-center rounded-btn px-5 text-sm font-medium transition-colors ${
                      tab === key
                        ? "bg-dark-1 text-white"
                        : "bg-light-3 text-dark-1 hover:bg-light-2"
                    }`}
                  >
                    {catalog.tabs[key]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* sort dropdown as SSR-friendly details menu (sort in URL) */}
          <details className="group relative" data-sort-menu>
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-btn border border-light-1 bg-white px-4 text-sm text-dark-1 [&::-webkit-details-marker]:hidden">
              <span className="text-mid-2">{catalog.sort.label}:</span>
              <span className="font-medium">{catalog.sort.options[sort]}</span>
              <UiIcon
                name="chevron-down"
                className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <ul className="absolute right-0 z-30 mt-2 w-56 rounded-card border border-light-2 bg-white p-2 shadow-xl">
              {SORTS.map((key) => (
                <li key={key}>
                  <Link
                    href={hrefFor(tab, key)}
                    aria-current={sort === key ? "true" : undefined}
                    className={`block rounded-input px-3 py-2 text-sm transition-colors ${
                      sort === key
                        ? "bg-light-3 font-medium text-dark-1"
                        : "text-mid-1 hover:bg-light-4"
                    }`}
                  >
                    {catalog.sort.options[key]}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>

        {/* product grid */}
        {products.length === 0 ? (
          <p className="mt-12 text-mid-2">{catalog.empty}</p>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-x-2 gap-y-8 md:grid-cols-4 md:gap-x-5">
            {products.map((product) => (
              <li key={product.slug}>
                <CatalogCard
                  product={product}
                  omnibusLowestCents={omnibusBySlug.get(product.slug) ?? null}
                  testToken={testToken}
                />
              </li>
            ))}
          </ul>
        )}

        {/* SEO text block with expander below grid */}
        <section className="mt-16 max-w-(--container-narrow)">
          <h2 className="text-xl">{catalog.seoBlock.title}</h2>
          <p className="mt-3 text-sm leading-6 text-mid-1">
            {catalog.seoBlock.teaser}
          </p>
          <details className="group mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center text-sm font-medium text-dark-1 underline underline-offset-4 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">{catalog.seoBlock.expand}</span>
              <span className="hidden group-open:inline">
                {catalog.seoBlock.collapse}
              </span>
            </summary>
            <p className="mt-3 text-sm leading-6 text-mid-1">
              {catalog.seoBlock.more}
            </p>
          </details>
        </section>
      </div>
    </>
  );
}
