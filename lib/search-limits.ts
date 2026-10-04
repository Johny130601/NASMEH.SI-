/**
 * Search query limits shared by /iskanje, /api/search (through lib/search)
 * and the search overlay. No imports: the overlay is a client component and
 * must not pull the catalog (and the database client) into its bundle.
 */

/** Shortest query that searches; a shorter one gets a hint instead of an empty page (QA 2026-10-03 T1-06). */
export const SEARCH_MIN_CHARS = 2;
/** Longest query kept; a longer one is cut to this length, never dropped (QA 2026-10-03 T1-06). */
export const SEARCH_MAX_CHARS = 80;

/**
 * The query as it is searched and shown back: trimmed, then cut to
 * SEARCH_MAX_CHARS characters (whole code points, so a cut never splits a
 * letter outside the BMP) and trimmed again.
 */
export function clampSearchQuery(raw: string): string {
  return Array.from(raw.trim()).slice(0, SEARCH_MAX_CHARS).join("").trim();
}
