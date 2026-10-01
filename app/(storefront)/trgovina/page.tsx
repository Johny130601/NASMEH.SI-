import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { getCatalogCollections, getCatalogProducts, type CatalogCollection } from "@/lib/catalog";
import { applySort, resolveSortKey, SORT_KEYS, type SortKey } from "@/lib/catalog-sort";
import { isTestMode } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { catalog } from "@/lib/copy";
import { CatalogCard } from "@/components/storefront/catalog/CatalogCard";
import { SortMenu } from "@/components/storefront/catalog/SortMenu";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ kolekcija?: string | string[]; razvrsti?: string | string[] }>;

const ALL = "all";

/** Committed placeholders (public/uploads) for the all-products view and any collection without a banner. */
const PLACEHOLDER_BANNER = "/uploads/placeholder-trgovina-wide.svg";
const PLACEHOLDER_BANNER_MOBILE = "/uploads/placeholder-trgovina-mobile.svg";

// One collections query per request, shared by generateMetadata and the page.
const loadCollections = cache(getCatalogCollections);

/**
 * The collection a `?kolekcija=` value names, or null for the all-products
 * view — also for an unknown handle, which shows everything without
 * pretending to be a collection (no tab, no title, no canonical of its own).
 */
function selectCollection(collections: CatalogCollection[], raw: string | string[] | undefined): CatalogCollection | null {
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug || slug === ALL) return null;
  return collections.find((collection) => collection.slug === slug) ?? null;
}

const hrefFor = (collectionSlug: string, sort: SortKey) =>
  `/trgovina?kolekcija=${encodeURIComponent(collectionSlug)}&razvrsti=${sort}`;

/** Title, description, canonical and robots from the Collection record (§14.3); the shop's own for the all view. */
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const collection = selectCollection(await loadCollections(), params.kolekcija);
  return buildMetadata({
    title: collection ? (collection.seoTitle ?? collection.title) : catalog.title,
    description: collection?.seoDescription ?? catalog.seoBlock.teaser,
    path: collection ? `/trgovina?kolekcija=${encodeURIComponent(collection.slug)}` : "/trgovina",
    noindex: collection?.noindex ?? false,
  });
}

/** /trgovina (§5): collection banner, deep-linkable tabs, sort in URL, grid, SEO block. */
export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, collections] = await Promise.all([searchParams, loadCollections()]);
  const collection = selectCollection(collections, params.kolekcija);
  const sort = resolveSortKey(params.razvrsti);
  const activeKey = collection?.slug ?? ALL;

  // cards carry their Omnibus-backed reduction (one batched history query)
  const products = applySort(
    await getCatalogProducts(collection ? { collectionSlug: collection.slug } : undefined),
    sort,
  );

  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  const tabs = [
    { key: ALL, label: catalog.tabs.all },
    ...collections.map((entry) => ({ key: entry.slug, label: entry.title })),
  ];

  // The heading is live text — never baked into the banner artwork (§15). The
  // collection's "hide banner text" switch takes it off the screen only: the
  // page keeps its <h1> for assistive technology and search engines.
  const heading = collection?.title ?? catalog.title;
  const headingHidden = collection?.hideBannerText ?? false;

  // The collection's own crops when it has them; a desktop banner alone serves
  // both sizes rather than a placeholder that does not belong to it.
  const banner = collection?.bannerImage ?? PLACEHOLDER_BANNER;
  const bannerMobile = collection?.bannerImageMobile ?? collection?.bannerImage ?? PLACEHOLDER_BANNER_MOBILE;
  const bannerAlt = collection ? catalog.collectionBannerAlt(collection.title) : catalog.bannerAlt;

  return (
    <>
      {/* full-width promo banner (separate mobile crop) */}
      {/* fixed aspect boxes reserve the banner's space before the artwork arrives (no layout shift),
          whatever size the operator uploaded; object-cover crops to the box */}
      <picture>
        <source srcSet={bannerMobile} media="(width < 768px)" width={800} height={500} />
        <img
          src={banner}
          alt={bannerAlt}
          width={1600}
          height={500}
          fetchPriority="high"
          className="aspect-[8/5] w-full bg-light-3 object-cover md:aspect-[16/5]"
          data-collection-banner={activeKey}
        />
      </picture>

      <div className="mx-auto max-w-(--container-wide) px-(--padding) py-10">
        <h1
          className={headingHidden ? "sr-only" : "text-[2rem] md:text-[2.5rem]"}
          data-collection-heading={headingHidden ? "hidden" : "visible"}
        >
          {heading}
        </h1>

        <div className={`flex flex-wrap items-center justify-between gap-4 ${headingHidden ? "" : "mt-6"}`}>
          {/* collection tabs — deep-linkable, one per collection that has products */}
          <nav aria-label={catalog.title}>
            <ul className="flex flex-wrap gap-2" data-collection-tabs>
              {tabs.map((tab) => (
                <li key={tab.key}>
                  <Link
                    href={hrefFor(tab.key, sort)}
                    aria-current={activeKey === tab.key ? "page" : undefined}
                    data-tab={tab.key}
                    className={`inline-flex h-10 items-center rounded-btn px-5 text-sm font-medium transition-colors ${
                      activeKey === tab.key
                        ? "bg-dark-1 text-white"
                        : "bg-light-3 text-dark-1 hover:bg-light-2"
                    }`}
                  >
                    {tab.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* sort dropdown: SSR details of links (sort in URL), folding on choice/Escape/outside click after mount */}
          <SortMenu label={catalog.sort.label} current={catalog.sort.options[sort]}>
            <ul className="absolute right-0 z-30 mt-2 w-56 rounded-card border border-light-2 bg-white p-2 shadow-xl">
              {SORT_KEYS.map((key) => (
                <li key={key}>
                  <Link
                    href={hrefFor(activeKey, key)}
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
          </SortMenu>
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
