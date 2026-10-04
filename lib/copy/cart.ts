import { kosForm } from "./catalog";

/** /cart page copy. */
export const cart = {
  title: "Vaša košarica",
  progress: {
    // "od": free shipping applies AT the threshold (>=), and the page swaps
    // "45 €" for the formatted Setting — the figure is never typed copy.
    empty: "Odklenite brezplačno dostavo pri naročilih od 45 €",
    inProgress: "📦 Samo še €X vas loči do brezplačne dostave",
    reached: "🎉 Čestitamo! Odklenili ste brezplačno dostavo!",
  },
  klarna: "ali 3 enostavna obroka po",
  klarnaSuffix: "s Klarna",
  line: {
    decrease: "Zmanjšaj količino",
    increase: "Povečaj količino",
    remove: "Odstrani izdelek",
    /** The line's real cap (maxCartQuantity: 5 by default, 1 for bundles), declined in Slovenian (QA C2-F1). */
    maxQuantity: (max: number) => `Največ ${max} ${kosForm(max)} na naročilo`,
    /** The line sits at the stock, below the per-order cap: no count is stated, only the fact at render time. */
    stockLimit: "Več kosov trenutno ni na zalogi.",
    /** The line sold out while it sat in the cart: it keeps its quantity, but cannot be ordered (QA 2026-09-30). */
    soldOut: "Ni več na zalogi — odstranite izdelek, da nadaljujete z nakupom.",
    bundleContents: "Vsebina paketa",
    /** Offer label pill on a bundle line (spec §7.1 "PAKET"); shown in capitals by the pill, read as a word. */
    bundlePill: "Paket",
    omnibusPrefix: "Najnižja cena v 30 dneh pred znižanjem",
    perUnit: "na kos",
  },
  crossSell: "Ljudje tudi kupujejo",
  checkout: {
    cta: "Na blagajno",
    note: "Varen nakup — cene vključujejo DDV.",
    /** "Na blagajno" is blocked while a line is sold out. */
    soldOutBlocked: "Nekaterih izdelkov ni več na zalogi. Odstranite jih, da nadaljujete na blagajno.",
    /** Screen-reader text for the payment badge row: the badges themselves are decorative (QA C2-F5). */
    paymentMethods: (methods: string) => `Sprejemamo: ${methods}.`,
  },
  summary: {
    subtotal: "Vmesna vsota",
    shipping: "Dostava",
    shippingFree: "Brezplačna",
    /** Nothing in the cart can be bought (every line sold out): no shipping to state, free or paid. */
    shippingNone: "—",
    total: "Skupaj",
    vatLine: "vključen DDV",
  },
  empty: {
    title: "Vaša košarica je prazna",
    body: "Dodajte izdelke in vrnite se — košarica se shrani tudi brez računa.",
    cta: "Nakupuj vse izdelke",
  },
  koda: {
    activeLabel: "Aktivna koda",
    rejectedLabel: "Koda",
    remove: "Odstrani kodo",
    phaseNote: "Koda se aktivira s popustom v fazi 4.",
    invalid: "Koda ni veljavna.",
    /** /koda/{CODE} refusals name the code; with another code active, that one stays (QA C2-F2). */
    invalidCode: (code: string) => `Koda ${code} ni veljavna.`,
    keptActive: (code: string) => `Aktivna ostaja koda ${code}.`,
  },
  /** Confirmation card after "Dodaj v košarico" (no drawer cart at P1, §15). */
  toast: {
    added: "Dodano v košarico",
    view: "Poglej košarico",
    close: "Zapri obvestilo",
    line: (quantity: number, price: string) => `${quantity} × ${price}`,
  },
} as const;
