/** /trgovina + product-card copy. */

/** Slovenian count form of "kos" (dual and plural: 1 kos, 2 kosa, 3–4 kosi, 5+ kosov). */
export function kosForm(count: number): string {
  const mod100 = Math.abs(count) % 100;
  if (mod100 === 1) return "kos";
  if (mod100 === 2) return "kosa";
  if (mod100 === 3 || mod100 === 4) return "kosi";
  return "kosov";
}

/** The real remaining units (lib/catalog `lowStockUnits`), never a made-up figure. */
export function lowStockLine(units: number): string {
  return `Samo še ${units} ${kosForm(units)} na zalogi`;
}

export const catalog = {
  title: "Trgovina",
  /** The placeholder banner (all products). A collection's own banner is described by its title. */
  bannerAlt: "Nasmeh.si trgovina — promocijski pas",
  collectionBannerAlt: (title: string) => `Kolekcija ${title} — promocijski pas`,
  /**
   * Tabs (§5): "Vsi izdelki" plus one per collection that has products, titled
   * by the Collection record — nothing else is typed here.
   */
  tabs: {
    all: "Vsi izdelki",
  },
  sort: {
    label: "Razvrsti",
    /** The keys are the `?razvrsti=` slugs (lib/catalog-sort keeps the retired ones as aliases). */
    options: {
      priporoceno: "Priporočeno",
      najnovejse: "Najnovejše",
      "cena-narascajoce": "Cena ↑",
      "cena-padajoce": "Cena ↓",
      "naziv-az": "Naziv A–Ž",
      "naziv-za": "Naziv Ž–A",
    } as const,
  },
  card: {
    addToCart: "Dodaj v košarico",
    adding: "Dodajam …",
    added: "Dodano ✓",
    /** The line is already at its per-order cap, so the add changed nothing (no figure: the cap is per variant). */
    atCap: "V košarici je že največja dovoljena količina.",
    /** The add did not go through: sold out meanwhile, refused, or the request failed. */
    addFailed: "Dodajanje ni uspelo. Poskusite znova.",
    /** The product sold out (or was withdrawn) since the page was opened (QA 2026-10-03 T5-07). */
    soldOutNow: "Izdelek je medtem razprodan.",
    unavailableNow: "Izdelek trenutno ni na voljo.",
    buildBundle: "Sestavi paket",
    notifyMe: "Obvestite me",
    soldOut: "Razprodano",
    moreSwatches: "+N",
    vatIncluded: "DDV vključen",
    /** History-backed reduction (lib/pricing percentOff, rounded down): "−20 %". */
    percentOff: (percent: number) => `−${percent} %`,
    /** Fixed-bundle value math from the components' current prices (§6.6). */
    bundleValue: (value: string, percent: number) => `Vrednost ${value} · prihranite ${percent} %`,
    lowStock: lowStockLine,
  },
  seoBlock: {
    title: "Beljenje zob, pošteno povedano",
    teaser:
      "Nasmeh.si je slovenska trgovina za domačo nego nasmeha: belilni trakci brez peroksida, ustna voda za globinsko čiščenje in serum korektor za začasno optično korekcijo.",
    more:
      "Verjamemo v kozmetiko brez pretiravanja: jasne sestavine (INCI na vsaki strani izdelka), navedbe z opombami, ki pojasnijo, na kaj se nanašajo, in cene, ki vedno vključujejo DDV. Pošteno povemo, kaj izdelek naredi in česa ne. Za izdelke velja 30-dnevno jamstvo vračila denarja pod pogoji, objavljenimi na strani Jamstvo vračila denarja.",
    expand: "Preberi več +",
    collapse: "Preberi manj −",
  },
  empty: "V tej kolekciji trenutno ni izdelkov.",
} as const;
