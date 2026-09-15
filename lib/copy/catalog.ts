/** /trgovina + product-card copy. */
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
    added: "Dodano ✓",
    buildBundle: "Sestavi paket",
    notifyMe: "Obvestite me",
    soldOut: "Razprodano",
    moreSwatches: "+N",
    vatIncluded: "DDV vključen",
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
