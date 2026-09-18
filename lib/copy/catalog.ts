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
  bannerAlt: "Nasmeh.si trgovina — promocijski pas",
  tabs: {
    all: "Vsi izdelki",
    beljenje: "Beljenje",
    paketi: "Paketi",
  },
  sort: {
    label: "Razvrsti",
    options: {
      priporoceno: "Priporočeno",
      najnovejse: "Najnovejše",
      "cena-vzpadno": "Cena ↑",
      "cena-padajco": "Cena ↓",
      "naziv-az": "Naziv A–Ž",
      "naziv-za": "Naziv Ž–A",
    } as const,
  },
  card: {
    addToCart: "Dodaj v košarico",
    adding: "Dodajam …",
    added: "Dodano ✓",
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
