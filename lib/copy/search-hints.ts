/**
 * Search hints (QA 2026-10-03 T1-06): what /iskanje and the search overlay say
 * when a query is too short to search, instead of showing an empty form with
 * no reason. The length is passed in (lib/search-limits), never typed here.
 */

/** Slovenian number agreement for "znak" — singular / dual / 3–4 plural / 5+ genitive. */
export function znakForm(count: number): string {
  const mod100 = Math.abs(count) % 100;
  if (mod100 === 1) return "znak";
  if (mod100 === 2) return "znaka";
  if (mod100 === 3 || mod100 === 4) return "znaki";
  return "znakov";
}

export const searchHints = {
  /** "Vnesite vsaj 2 znaka." */
  minChars: (count: number) => `Vnesite vsaj ${count} ${znakForm(count)}.`,
  /** "Iskanje upošteva prvih 80 znakov." — a longer query is cut, and says so. */
  maxChars: (count: number) => `Iskanje upošteva prvih ${count} ${znakForm(count)}.`,
} as const;
