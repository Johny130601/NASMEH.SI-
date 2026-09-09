/** PDP copy (product content itself lives in DB seed). */
export const pdp = {
  breadcrumbs: {
    home: "Domov",
    shop: "Trgovina",
  },
  accordions: {
    howItWorks: "Kako deluje",
    inci: "Sestavine (INCI)",
    guarantee: "^Jamstvo vračila denarja",
    tested: "*Testirano za rezultate",
    delivery: "Dostava in vračila",
  },
  buyBox: {
    omnibusPrefix: "Najnižja cena v zadnjih 30 dneh",
    klarnaPrefix: "ali 3 obroka po",
    klarnaSuffix: "s Klarna",
    quantity: "Količina",
    decrease: "Zmanjšaj količino",
    increase: "Povečaj količino",
    addToCart: "Dodaj v košarico",
    addBundleToCart: "Dodaj paket v košarico",
    atcPhaseNote: "Nakup bo na voljo v fazi 3 — oglejte si izdelek.",
    guarantee: "30-dnevno jamstvo vračila denarja",
    vatIncluded: "DDV vključen",
  },
  delivery: {
    body: "Dostava v 2–4 delovnih dneh po Sloveniji. Brezplačna dostava pri naročilih nad 45 €. 14-dnevna pravica do odstopa za neodprte izdelke — podrobnosti na strani Odstop od pogodbe.",
  },
  crossSell: "Dopolni svojo rutino",
  faq: {
    title: "Imate vprašanja? Imamo odgovore.",
  },
  reviews: {
    title: "Mnenja kupcev",
    mountNote: "Mnenja prihajajo v fazi 5.",
  },
  alsoBought: "Ljudje tudi kupujejo",
  bundle: {
    components: "Vsebina paketa",
    quantitySuffix: "×",
    savingsLine: "vrednost",
    savingsSave: "— prihranite",
    perPiece: "na kos",
  },
  notFound: "Izdelek ne obstaja",
} as const;
