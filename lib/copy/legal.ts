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

/** The `company` Setting fields the seller block prints (`companySchema` in lib/settings-schemas.ts). */
export interface SellerIdentity {
  name: string;
  address: string;
  registrationNumber: string;
  vatId: string;
  email: string;
  phone?: string;
}

/**
 * The seller block above a legal body (the bodies say the details are "navedeni
 * zgoraj"): name, address, registration and VAT id, e-mail and the telephone
 * when one is set. Null — the page prints `seller.missing` instead — when the
 * Setting is absent or still holds seed placeholders, so no page claims an
 * identity the store does not have. The caller passes
 * `companyPlaceholderFields(company)` (lib/settings-schemas.ts), which keeps
 * the schemas out of this copy module and its client bundles.
 */
export function sellerBlockLines(
  seller: SellerIdentity | null,
  placeholderFields: readonly string[] = [],
): string[] | null {
  if (!seller || placeholderFields.length > 0) return null;
  const phone = seller.phone?.trim();
  return [
    seller.name,
    seller.address,
    `${legal.seller.registration}: ${seller.registrationNumber} · ${legal.seller.vatId}: ${seller.vatId}`,
    `${legal.seller.email}: ${seller.email}`,
    ...(phone ? [`${legal.seller.phone}: ${phone}`] : []),
  ];
}
