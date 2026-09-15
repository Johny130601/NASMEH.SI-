import type { Metadata } from "next";
import { searchProducts } from "@/lib/search";
import type { CatalogProduct } from "@/lib/catalog";
import { getPriceReductions } from "@/lib/omnibus";
import { buildMetadata } from "@/lib/seo";
import { search as copy } from "@/lib/copy";
import { CatalogCard } from "@/components/storefront/catalog/CatalogCard";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.title,
  path: "/iskanje",
  noindex: true,
});

/** All-results search page (§3.1): SSR, GET form works without JS. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results = query.length >= 2 ? await searchProducts(query, 48) : [];
  // same Omnibus gate as every other card surface (one batched history query)
  const reductions = await getPriceReductions(results);

  const cards: CatalogProduct[] = results.map((result) => ({
    slug: result.slug,
    title: result.title,
    variantId: result.variantId,
    sku: result.sku,
    priceCents: result.priceCents,
    reduction: reductions.get(result.variantId) ?? null,
    stock: result.stock,
    soldOut: result.soldOut,
    backorderNote: null,
    maxCartQuantity: 5,
    imageUrl: result.imageUrl,
    imageAlt: result.imageAlt,
    badges: [],
    variantCount: 1,
    rating: null,
    unitPrice: null,
    isBundle: false,
    createdAt: new Date(0),
  }));

  return (
    <section className="mx-auto max-w-(--container-wide) px-(--padding) py-12">
      <h1 className="text-[2rem]">{copy.title}</h1>

      <form action="/iskanje" method="get" role="search" className="mt-6 max-w-xl">
        <label htmlFor="search-page-input" className="sr-only">
          {copy.title}
        </label>
        <div className="flex gap-3">
          <input
            id="search-page-input"
            type="search"
            name="q"
            defaultValue={query}
            placeholder={copy.placeholder}
            className="h-[3.25rem] flex-1 rounded-input border border-light-1 bg-white px-4 text-base text-dark-1 outline-none transition-colors focus:border-brand"
          />
          <UiButton type="submit" variant="primary">
            {copy.submitLabel}
          </UiButton>
        </div>
      </form>

      {query.length >= 2 ? (
        <>
          <p className="mt-8 text-sm text-mid-1">
            {copy.resultsFor} <strong className="text-dark-1">“{query}”</strong>:{" "}
            {cards.length} {copy.resultsCount}
          </p>
          {cards.length === 0 ? (
            <div className="mt-12 max-w-md">
              <h2 className="text-xl">{copy.zeroTitle}</h2>
              <p className="mt-2 text-sm text-mid-1">{copy.zeroBody}</p>
            </div>
          ) : (
            <ul className="mt-8 grid grid-cols-2 gap-x-2 gap-y-8 md:grid-cols-4 md:gap-x-5">
              {cards.map((product) => (
                <li key={product.slug}>
                  <CatalogCard product={product} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
