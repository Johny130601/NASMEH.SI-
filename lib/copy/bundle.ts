import { kosForm } from "./catalog";

/**
 * Bundle-builder copy (/sestavi-paket, the step between a product page and
 * the cart).
 *
 * Every figure this module shows arrives already formatted from the server
 * (AGENTS §8.23): the helpers take strings and counts, never cents, so no
 * price, percentage or saving can be typed into copy or worked out here.
 *
 * Two things are deliberately absent. There is no subscription percentage,
 * because this store has no recurring-payment path and a saving nobody can
 * buy is a misleading claim; the row only says that monthly delivery is not
 * available yet. It asks for nothing and stores nothing, so it confirms
 * nothing either (AGENTS §8.23, QA 2026-10-03 T1-02). And there is no "free
 * gift" or "extra unit" wording, because nothing in the data model can prove
 * such a claim (UCPD Annex I point 20).
 */

/**
 * Slovenian number agreement — singular / dual / 3–4 plural / 5+ genitive.
 * Same shape as `kosForm`, which stays the canonical example.
 */
function form(
  count: number,
  forms: readonly [string, string, string, string],
): string {
  const mod100 = Math.abs(count) % 100;
  if (mod100 === 1) return forms[0];
  if (mod100 === 2) return forms[1];
  if (mod100 === 3 || mod100 === 4) return forms[2];
  return forms[3];
}

export function izdelekForm(count: number): string {
  return form(count, ["izdelek", "izdelka", "izdelki", "izdelkov"]);
}

export function dodatekForm(count: number): string {
  return form(count, ["dodatek", "dodatka", "dodatki", "dodatkov"]);
}

export function izbranForm(count: number): string {
  return form(count, ["izbran", "izbrana", "izbrani", "izbranih"]);
}

/** "3 dodatki izbrani" — the counter above the add-on row. */
export function selectedLine(count: number): string {
  return `${count} ${dodatekForm(count)} ${izbranForm(count)}`;
}

/**
 * "2 izdelka + 3 dodatki" — what the summary says is in the bundle. No
 * product category is named: the builder starts from any product, and
 * "za beljenje" on a mouthwash is a claim it does not make (QA C2-F19).
 */
export function bundleContents(units: number, addOns: number): string {
  const base = `${units} ${izdelekForm(units)}`;
  if (addOns === 0) return base;
  return `${base} + ${addOns} ${dodatekForm(addOns)}`;
}

const OFFER_SUBTITLES: Record<number, string> = {
  1: "Za začetek",
  2: "Zate in za bližnjega",
  3: "Zaloga za dlje",
};

const OFFER_SUBTITLE_FALLBACK = "Zaloga za dlje";

export const bundle = {
  /** Product-neutral: the page opens from a mouthwash as well as from the strips (QA C2-F19). */
  title: "Sestavite svojo rutino",
  subtitle: "Izberite ponudbo. Dodajte dodatke.",

  /** The chosen product, beside the offer grid. */
  product: {
    /** Only shown when the variant says something the product name does not. */
    variantLabel: (sku: string) => `Šifra: ${sku}`,
  },

  offers: {
    /** Accessible name of the radio group; the grid carries no visible heading. */
    legend: "Izberite ponudbo",
    /** "2 kosa" — the units this offer puts in the cart. */
    units: (count: number) => `${count} ${kosForm(count)}`,
    /**
     * One line per unit count. The offer row is Setting-driven, so a count the
     * operator adds falls back to the stocking-up line rather than rendering
     * an empty slot.
     */
    subtitle: (units: number) =>
      OFFER_SUBTITLES[units] ?? OFFER_SUBTITLE_FALLBACK,
    /**
     * Badge on the offer that gives back the most per unit, ranked at render
     * time from the engine's own decision — never by position in the grid.
     */
    badge: "Najboljša izbira",
    /** The cart already holds at least this many, so the offer changes nothing. */
    redundant: "Že v košarici",
  },

  /** The fourth card: what the chosen quantity alone comes to. */
  offerSummary: {
    title: "Izbrana ponudba",
    quantity: "Količina",
    saving: "Prihranek",
    pay: "Za plačilo",
    /** Announces the recomputed figure when the quantity changes. */
    liveLabel: "Znesek izbrane ponudbe",
  },

  /**
   * Information only: no control, no e-mail asked for, nothing stored — so no
   * thank-you either, which would confirm something that did not happen
   * (AGENTS §8.23, QA 2026-10-03 T1-02).
   */
  subscription: {
    title: "Mesečna dostava",
    note: "Redna dostava izdelka še ni na voljo.",
    soon: "Kmalu",
  },

  addOns: {
    title: "Dodajte k paketu",
    subtitle: "Dopolnite svojo rutino.",
    selected: selectedLine,
    add: "Dodaj k paketu",
    added: "Dodano v paket",
    /** Accessible name of the whole add-on control. */
    toggleLabel: (title: string) => `Dodaj k paketu: ${title}`,
    /** The shopper already has this one; the bundle keeps what is there. */
    inCart: "Že v košarici",
  },

  /** The closing summary: the whole selection, and the only way to the cart. */
  summary: {
    title: "Vaš paket",
    contents: bundleContents,
    /** Row label for the main product's chosen quantity. */
    mainLine: (title: string, units: number) => `${title} × ${units}`,
    addOnsLabel: "Dodatki",
    noAddOns: "Brez dodatkov",
    /** Kept so the saving and the amount due reconcile on screen. */
    subtotal: "Vmesna vsota",
    totalSaving: "Skupni prihranek",
    shipping: "Dostava",
    shippingFree: "Brezplačna",
    pay: "Za plačilo",
    /** Named so the shopper recognises the same line on the cart. */
    discountCode: (code: string) => `s kodo ${code}`,
    /** Lines already in the cart that this module did not put there. */
    otherLines: (count: number) =>
      `Vključuje ${count} ${izdelekForm(count)} že v košarici`,
    cta: "Dodaj v košarico",
    vatNote: "Cene vključujejo DDV. Stroški dostave se lahko spremenijo glede na izbrani način.",
    /** Announces a recomputed total to assistive technology. */
    liveLabel: "Skupni znesek",
  },

  notices: {
    /** Something landed short of the selection: a rule, not a failure. */
    capped: "Nekaterih izdelkov ni bilo mogoče dodati v izbrani količini. Preverite košarico.",
    failed: "Paketa ni bilo mogoče dodati. Poskusite znova.",
    adding: "Dodajam …",
  },

  /** No offer resolved for this product. */
  empty: {
    title: "Paketa za ta izdelek ni mogoče sestaviti",
    body: "Izdelek si lahko ogledate v trgovini ali nadaljujete na košarico.",
    cart: "Na košarico",
    shop: "Nazaj v trgovino",
  },
} as const;
