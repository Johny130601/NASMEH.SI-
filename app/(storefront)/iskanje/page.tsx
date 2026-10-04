import type { Metadata } from "next";
import { parseSearchQuery, searchProducts } from "@/lib/search";
import { SEARCH_MAX_CHARS, SEARCH_MIN_CHARS } from "@/lib/search-limits";
import { isTestMode } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { search as copy } from "@/lib/copy";
import { searchHints } from "@/lib/copy/search-hints";
import { CatalogCard } from "@/components/storefront/catalog/CatalogCard";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.title,
  path: "/iskanje",
  noindex: true,
});

/**
 * All-results search page (§3.1): SSR, GET form works without JS. The
 * results are the same catalog cards /trgovina renders (badges, rating, unit
 * price, hooks, CTA by state), ranked by lib/search.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  // zod at the boundary (AGENTS §8.2): a repeated ?q counts once, an over-long one is cut
  // to its first SEARCH_MAX_CHARS characters and still searched (QA 2026-10-03 T1-06)
  const raw = Array.isArray(q) ? q[0] : q;
  const query = parseSearchQuery(raw);
  // the cut is said, not silent (QA 2026-10-03 v1)
  const cut = Array.from((raw ?? "").trim()).length > SEARCH_MAX_CHARS;
  const searchable = query.length >= SEARCH_MIN_CHARS;
  const cards = searchable ? await searchProducts(query, 48) : [];

  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  return (
    <section className="mx-auto max-w-(--container-wide) px-(--padding) py-12">
      <h1 className="text-[2rem]">{copy.title}</h1>

      <form action="/iskanje" method="get" role="search" className="mt-6 max-w-xl">
        <label htmlFor="search-page-input" className="sr-only">
          {copy.title}
        </label>
        <div className="flex gap-3">
          <input
            // keyed by the query: a client-side search from the header must show the new query here (QA 2026-10-03 V1-01)
            key={query}
            id="search-page-input"
            type="search"
            name="q"
            defaultValue={query}
            maxLength={SEARCH_MAX_CHARS}
            placeholder={copy.placeholder}
            aria-describedby={(query && !searchable) || cut ? "search-page-hint" : undefined}
            className="h-[3.25rem] flex-1 rounded-input border border-light-1 bg-white px-4 text-base text-dark-1 outline-none transition-colors focus:border-brand"
          />
          <UiButton type="submit" variant="primary">
            {copy.submitLabel}
          </UiButton>
        </div>
      </form>

      {/* A query too short to search says why nothing is listed (QA 2026-10-03 T1-06). */}
      {query && !searchable ? (
        <p id="search-page-hint" className="mt-4 text-sm text-mid-1" data-search-hint>
          {searchHints.minChars(SEARCH_MIN_CHARS)}
        </p>
      ) : cut ? (
        <p id="search-page-hint" className="mt-4 text-sm text-mid-1" data-search-hint="max">
          {searchHints.maxChars(SEARCH_MAX_CHARS)}
        </p>
      ) : null}

      {searchable ? (
        <>
          <p className="mt-8 text-sm text-mid-1" data-search-count={cards.length}>
            {copy.resultsFor} <strong className="text-dark-1">“{query}”</strong>:{" "}
            {copy.resultsCount(cards.length)}
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
                  <CatalogCard product={product} testToken={testToken} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
