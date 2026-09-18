/** Homepage copy (Setting-driven parts live in Setting `home.hero`). */
export const home = {
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
    title: "Trakci, ustna voda in serum v enem paketu.",
    imageAlt: "Paket popolna rutina — trakci, ustna voda in serum",
    footnote:
      "Rezultati se lahko razlikujejo od osebe do osebe. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.",
  },
  marqueeFallback: "Dobrodošli na Nasmeh.si",
  vatIncluded: "DDV vključen",
  /** Trust strip under the hero; the delivery and threshold figures come from the shipping Setting. */
  trust: {
    label: "Zakaj Nasmeh.si",
    vat: "Cene z DDV, brez presenečenj",
  },
} as const;
