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

/**
 * /trgovina (§5): title band or the collection's own banner, deep-linkable
 * tabs and the sort in a slim bar, the grid, the SEO panel.
 *
 * 2026-10-10 redesign (reference: the HiSmile "All products" page, layout
 * only): the placeholder artwork gave way to a brand-colour band carrying the
 * live heading, a claim-free subline on the all view and the product count;
 * a collection with its own uploaded banner keeps the image and the heading
 * under it. The grid runs three columns on desktop with the bundle as a
 * double-wide card (spec §5 "double-wide feature cards", built at the owner's
 * request), dense-packed so a single card fills the cell a wide one leaves.
 * The first card's image is the LCP candidate and loads eagerly; nothing in
 * the first viewport animates on load (AGENTS §8.23).
 */
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

  // Only an operator's own artwork is an image band; a desktop banner alone
  // serves both sizes. Without one the band below carries the heading.
  const bannerImage = collection?.bannerImage ?? null;
  const bannerMobile = collection?.bannerImageMobile ?? bannerImage;
  const bannerAlt = collection ? catalog.collectionBannerAlt(collection.title) : catalog.bannerAlt;

  return (
    <>
      {bannerImage ? (
        // fixed aspect boxes reserve the banner's space before the artwork arrives (no layout shift),
        // whatever size the operator uploaded; object-cover crops to the box
        <picture>
          <source srcSet={bannerMobile ?? bannerImage} media="(width < 768px)" width={800} height={500} />
          <img
            src={bannerImage}
            alt={bannerAlt}
            width={1600}
            height={500}
            fetchPriority="high"
            className="aspect-[8/5] w-full bg-light-3 object-cover md:aspect-[16/5]"
            data-collection-banner={activeKey}
          />
        </picture>
      ) : null}

      {bannerImage || headingHidden ? (
        <div className="mx-auto max-w-(--container-wide) px-(--padding) pt-10">
          <h1
            className={headingHidden ? "sr-only" : "text-[2rem] md:text-[2.5rem]"}
            data-collection-heading={headingHidden ? "hidden" : "visible"}
          >
            {heading}
          </h1>
        </div>
      ) : (
        <section className="ui-band-bg bg-brand" data-collection-band={activeKey}>
          <div className="mx-auto max-w-(--container-wide) px-(--padding) py-12 md:py-16">
            <h1
              className="text-[2.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-white md:text-[3.5rem]"
              data-collection-heading="visible"
            >
              {heading}
            </h1>
            {collection ? null : (
              <p className="mt-4 max-w-lg text-base text-white/85 md:text-lg">{catalog.subtitle}</p>
            )}
          </div>
        </section>
      )}

      {/* slim filter bar: tabs left, count and sort right */}
      <div className="border-b border-light-2 bg-white">
        <div className="mx-auto flex max-w-(--container-wide) flex-wrap items-center justify-between gap-3 px-(--padding) py-3">
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

          <div className="flex items-center gap-4">
            <span className="text-sm text-mid-2" data-product-count>{catalog.count(products.length)}</span>
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
        </div>
      </div>

      <div className="mx-auto max-w-(--container-wide) px-(--padding) py-8 md:py-10">
        {/* product grid: two columns on a phone, three on desktop; the bundle spans two (dense, so a
            single card fills the cell a wide one leaves); the chips need the row gap above a card */}
        {products.length === 0 ? (
          <p className="mt-4 text-mid-2">{catalog.empty}</p>
        ) : (
          <ul className="mt-2 grid grid-flow-dense grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8" data-product-grid>
            {products.map((product, index) => (
              <li key={product.slug} className={product.isBundle ? "col-span-2" : undefined}>
                <CatalogCard
                  product={product}
                  testToken={testToken}
                  layout={product.isBundle ? "wide" : "default"}
                  priority={index === 0}
                />
              </li>
            ))}
          </ul>
        )}

        {/* SEO text block with expander below the grid, as a light panel */}
        <section className="ui-reveal mt-14 rounded-panel bg-light-3 p-6 md:mt-16 md:p-10">
          <h2 className="text-xl">{catalog.seoBlock.title}</h2>
          <p className="mt-3 max-w-(--container-narrow) text-sm leading-6 text-mid-1">
            {catalog.seoBlock.teaser}
          </p>
          <details className="group mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center text-sm font-medium text-dark-1 underline underline-offset-4 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">{catalog.seoBlock.expand}</span>
              <span className="hidden group-open:inline">
                {catalog.seoBlock.collapse}
              </span>
            </summary>
            <p className="mt-3 max-w-(--container-narrow) text-sm leading-6 text-mid-1">
              {catalog.seoBlock.more}
            </p>
          </details>
        </section>
      </div>
    </>
  );
}
