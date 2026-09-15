/** Legal/content-page copy. */
export const legal = {
  draftNotice:
    "Osnutek dokumenta — besedilo je v strokovnem pregledu (D4). Končna različica bo objavljena pred zagonom trgovine.",
  lastUpdated: "Zadnja posodobitev",
  contactCta: "Pišite nam",
  backHome: "Na domačo stran",
  /**
   * The withdrawal exception in the words of Directive 2011/83/EU Art. 16(e): all three
   * conditions (sealed, unsuitable for return for health or hygiene reasons, unsealed after
   * delivery). Every short notice (checkout, PDP, confirmation e-mail, withdrawal form and PDF)
   * and the Odstop od pogodbe and terms pages use exactly this phrase; D4 review pending.
   */
  sealedGoodsException:
    "zapečateno blago, ki zaradi varovanja zdravja ali higienskih razlogov ni primerno za vračilo in je bilo po dobavi odpečateno",
  /** Seller identity rendered from the `company` Setting above legal bodies (web page and legal-texts PDF). */
  seller: {
    title: "Podatki o prodajalcu",
    registration: "Matična številka",
    vatId: "ID za DDV",
    email: "E-pošta",
    phone: "Telefon",
    missing: "Podatki o prodajalcu trenutno niso na voljo.",
  },
} as const;
