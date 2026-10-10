/** Slovenian count form of "mnenje" (1 mnenje, 2 mnenji, 3–4 mnenja, 5+ mnenj). */
export function mnenjeForm(count: number): string {
  const mod100 = Math.abs(count) % 100;
  if (mod100 === 1) return "mnenje";
  if (mod100 === 2) return "mnenji";
  if (mod100 === 3 || mod100 === 4) return "mnenja";
  return "mnenj";
}

/** Homepage copy (Setting-driven parts live in Setting `home.hero`). */
export const home = {
  /**
   * The home <title> is absolute (the "%s | Nasmeh.si" template would read "Nasmeh.si | Nasmeh.si")
   * and the description says what the store sells (QA L1, T7-F8). `heading` is the page's <h1>
   * when an operator hides the hero section, which otherwise carries it (QA T7-F15).
   */
  seo: {
    title: "Nasmeh.si — beljenje zob doma: belilni trakci, ustna voda in serum",
    description: "Belilni trakci, ustna voda in serum korektor barve zob za domačo nego nasmeha. Cene z DDV, dostava po Sloveniji in varno spletno plačilo.",
    heading: "Nasmeh.si — izdelki za domače beljenje zob",
  },
  hero: {
    kicker: "Kmalu",
    title: "Nov standard domačega beljenja zob",
    subtitle:
      "Belilni trakci, ustna voda in serum korektor za domačo nego nasmeha. Trgovina se odpre kmalu — to je tehnični predogled.",
    cta: "Nakupuj zdaj",
    mediaAlt: "Nasmeh.si — predstavitveni vizual",
  },
  rail: {
    title: "Naše uspešnice",
    /** Descriptive, claim-free: it names what the store sells, not how well it sells (AGENTS §8.23). */
    subtitle: "Trakci, ustna voda, serum in paket — vse za domačo nego nasmeha.",
    shopAll: "Vsi izdelki",
    empty: "Katalog je v pripravi.",
    priceLabel: "Cena",
    addToCart: "Dodaj v košarico",
    carouselLabel: "Naše uspešnice — izdelki",
  },
  bundleBanner: {
    title: "Naši paketi",
    cta: "Nakupuj zdaj",
  },
  routineBanner: {
    /** The bundle card (home redesign 2026-10-10): eyebrow, component list label and the two actions. */
    eyebrow: "Naša popolna rutina",
    includes: "V paketu",
    addToCart: "Dodaj paket v košarico",
    details: "Več o paketu",
    title: "Trakci, ustna voda in serum v enem paketu.",
    imageAlt: "Paket popolna rutina — trakci, ustna voda in serum",
    footnote:
      "Rezultati se lahko razlikujejo od osebe do osebe. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.",
  },
  /**
   * Home review grid (2026-10-10): real published reviews only — the section is absent below
   * three of them, and every figure in it is computed from the stored rows (AGENTS §8.23).
   */
  reviews: {
    title: "Kaj pravijo stranke",
    /** "4,8 od 5 na podlagi 27 mnenj" — the count takes the Slovenian form of "mnenje". */
    summary: (average: string, count: number) => `${average} od 5 na podlagi ${count} ${mnenjeForm(count)}`,
    /** States only what the submission code enforces (buyers only); the per-product list explains the rest. */
    note: "Mnenje lahko odda samo kupec izdelka. Kako mnenja preverjamo in objavljamo, piše ob mnenjih na strani vsakega izdelka.",
    /** Accessible name of the grid. */
    listLabel: "Mnenja strank",
  },
  marqueeFallback: "Dobrodošli na Nasmeh.si",
  vatIncluded: "DDV vključen",
  // The trust strip under the hero renders through TrustRow, which carries its
  // own copy (lib/copy/pdp `trust`) and both figures from the shipping Setting.
} as const;
