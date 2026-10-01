import type { CatalogProduct } from "@/lib/catalog";
import { catalog } from "@/lib/copy/catalog";

/**
 * /trgovina sort order (§5): the `?razvrsti=` value is a slug from the copy
 * file's option list. PURE, so the URL contract is unit-tested without a page.
 */
export type SortKey = keyof typeof catalog.sort.options;

export const SORT_KEYS = Object.keys(catalog.sort.options) as SortKey[];
export const DEFAULT_SORT: SortKey = "priporoceno";

/**
 * Retired slugs (misspelt Slovenian, QA L10) keep working: a shared or
 * bookmarked link resolves to the correctly spelt key, and every link the
 * page renders uses the new one.
 */
export const SORT_ALIASES: Readonly<Record<string, SortKey>> = {
  "cena-vzpadno": "cena-narascajoce",
  "cena-padajco": "cena-padajoce",
};

/** The sort a raw `?razvrsti=` value asks for; unknown or absent → the default. */
export function resolveSortKey(raw: string | string[] | undefined | null): SortKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return DEFAULT_SORT;
  if (SORT_KEYS.includes(value as SortKey)) return value as SortKey;
  // own keys only: an inherited name (`constructor`, `__proto__`) is not a sort
  return Object.hasOwn(SORT_ALIASES, value) ? SORT_ALIASES[value] : DEFAULT_SORT;
}

/** Sorted copy; "priporoceno" keeps the merchandising order the products arrive in. */
export function applySort(products: CatalogProduct[], sort: SortKey): CatalogProduct[] {
  const sorted = [...products];
  switch (sort) {
    case "najnovejse":
      return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case "cena-narascajoce":
      return sorted.sort((a, b) => a.priceCents - b.priceCents);
    case "cena-padajoce":
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
