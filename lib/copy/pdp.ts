import { lowStockLine } from "./catalog";
import { legal } from "./legal";

/**
 * The trust row under the buy button (shared with the homepage strip): every
 * figure comes from the shipping Setting at render time, never typed here.
 */
export const trust = {
  delivery: (estimate: string | null) => (estimate ? `Dostava ${estimate}` : "Dostava po Sloveniji"),
  freeShipping: (threshold: string | null) =>
    threshold === null ? "Brezplačna dostava pri vseh naročilih" : `Brezplačna dostava od ${threshold}`,
  guarantee: "30-dnevno jamstvo vračila denarja",
  guaranteeHref: "/garancija-vracila-denarja",
  securePayment: "Varno plačilo",
  securePaymentDetail: "kartica, PayPal, Apple Pay, Google Pay",
  label: "Zakaj nakup pri nas",
} as const;

/** PDP copy (product content itself lives in DB seed). */
export const pdp = {
  breadcrumbs: {
    home: "Domov",
    shop: "Trgovina",
  },
  accordions: {
    howItWorks: "Kako deluje",
    inci: "Sestavine (INCI)",
    /** The caret resolves a claim marked "^"; the page drops it when no claim on the product carries one (QA T1-14). */
    guarantee: "^Jamstvo vračila denarja",
    tested: "*Opombe k navedbam",
    delivery: "Dostava in vračila",
  },
  buyBox: {
    backorder: "Trenutno ni na zalogi — naročite zdaj, pošljemo takoj, ko izdelek prispe.",
    /** Statutory framing (PID Art. 6a): the reference stays fixed while a reduction runs, so never "v zadnjih 30 dneh". */
    omnibusPrefix: "Najnižja cena v 30 dneh pred znižanjem",
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
    lowStock: lowStockLine,
  },
  trust,
  delivery: {
    /**
     * Shipping part of the accordion, rendered from the shipping Setting: the
     * standard method's configured estimate (null = none configured) and the
     * formatted free-shipping threshold (null = every order ships free). The
     * cart grants free shipping AT the threshold, hence "od".
     */
    shipping: ({ estimate, freeThreshold }: { estimate: string | null; freeThreshold: string | null }) =>
      [
        estimate ? `Predviden rok dostave po Sloveniji: ${estimate}.` : "Dostavljamo po Sloveniji.",
        freeThreshold === null
          ? "Dostava je brezplačna pri vseh naročilih."
          : `Brezplačna dostava pri naročilih od ${freeThreshold}.`,
      ].join(" "),
    /** Returns part, after the shipping part. The sealed-goods exception is worded like the Odstop od pogodbe page and the checkout notice (Phase 9 step 4). */
    body: `14-dnevna pravica do odstopa od pogodbe; odstop ni mogoč za ${legal.sealedGoodsException}. Podrobnosti na strani Odstop od pogodbe.`,
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
    /** Fixed-bundle value math from the components' current prices (§6.6): "Vrednost 74,97 € — prihranite 33 %". */
    savingsLine: (value: string, percent: number) => `Vrednost ${value} — prihranite ${percent} %`,
    perPiece: "na kos",
  },
  notFound: "Izdelek ne obstaja",
} as const;
