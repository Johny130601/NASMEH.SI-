import { z } from "zod";
import { getSearchCatalog, type CatalogProduct, type ProductSearchText } from "@/lib/catalog";

/** /api/search + /iskanje input contract (AGENTS §8.2). */
export const searchQuerySchema = z.string().trim().min(1).max(80);

/** Parse a raw ?q value; returns "" for anything unusable (never throws). */
export function parseSearchQuery(raw: string | null | undefined): string {
  const parsed = searchQuerySchema.safeParse(raw ?? "");
  return parsed.success ? parsed.data : "";
}

/** Case- and accent-insensitive comparison form ("Čiščenje" → "ciscenje"). */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sl");
}

/** The query as folded words, AND-ed by the match; at most six count. */
export function searchWords(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean).slice(0, 6);
}

export interface SearchEntry<T> {
  card: T;
  text: ProductSearchText;
}

/**
 * Relevance (§3.1, QA L7): every word has to occur in the product's
 * human-readable text — the title, the description, the merchandising and
 * PDP copy that `productSearchText` collects — and never in a slug, a JSON
 * key or a cross-sell handle. Products whose TITLE carries every word rank
 * first, the rest follow; ties keep the catalog order the entries arrive in.
 * PURE: the same function ranks the instant results and the results page.
 */
export function rankSearchResults<T>(query: string, entries: Array<SearchEntry<T>>, limit = 24): T[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  const ranked: Array<{ card: T; rank: number; index: number }> = [];
  entries.forEach((entry, index) => {
    const title = fold(entry.text.title);
    const body = fold(entry.text.body);
    if (words.every((word) => title.includes(word))) {
      ranked.push({ card: entry.card, rank: 0, index });
    } else if (words.every((word) => title.includes(word) || body.includes(word))) {
      ranked.push({ card: entry.card, rank: 1, index });
    }
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((entry) => entry.card);
}

/**
 * Site search (§3.1): the listed, search-visible products (the same rule as
 * the catalog — nothing unbuyable, hidden or withdrawn), ranked by
 * `rankSearchResults`. Results are full catalog cards, so /iskanje renders
 * exactly what /trgovina renders. Shared by /api/search (instant) and
 * /iskanje (SSR results page).
 */
export async function searchProducts(query: string, limit = 24): Promise<CatalogProduct[]> {
  if (searchWords(query).length === 0) return [];
  return rankSearchResults(query, await getSearchCatalog(), limit);
}
