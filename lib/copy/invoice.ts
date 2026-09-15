import { formatEUR } from "@/lib/pricing";
import { STORE_TIME_ZONE } from "@/lib/admin/coupons-schema";

/** Calendar dates on documents follow the store's zone, not the container's UTC clock. */
const storeDate = (date: Date) => date.toLocaleDateString("sl-SI", { timeZone: STORE_TIME_ZONE });

export const invoice = {
  title: (number: string) => `RAČUN ${number}`,
  issuedAt: (date: Date) => `Datum izdaje: ${storeDate(date)}`,
  registration: (number: string) => `Matična številka: ${number}`,
  vatId: (number: string) => `ID za DDV: ${number}`,
  email: (address: string) => `E-pošta: ${address}`,
  phone: (number: string) => `Telefon: ${number}`,
  customer: "Kupec:",
  items: "Postavke:",
  subtotal: "Vmesna vsota",
  discount: "Popust",
  shipping: "Dostava",
  total: "SKUPAJ",
  vat: (ratePercent: number, taxCents: number) =>
    `vključen DDV ${ratePercent} %: ${formatEUR(taxCents)}`,
  /** Tax base = stored total − stored VAT (the paid-order snapshot, never recalculated). */
  taxBase: (ratePercent: number, baseCents: number) =>
    `Osnova za DDV ${ratePercent} %: ${formatEUR(baseCents)}`,
  footer: "Vse cene vključujejo DDV. Nasmeh.si - hvala za vaše naročilo!",
};

/** Terms and withdrawal texts attached to the order confirmation as the customer's durable copy. */
export const legalTexts = {
  filename: (orderNumber: string) => `pogoji-in-odstop-${orderNumber}.pdf`,
  title: "Pogoji poslovanja in odstop od pogodbe",
  order: (orderNumber: string) => `Naročilo ${orderNumber}`,
  intro: "Kopija besedil za vašo evidenco, pripravljena ob pošiljanju potrditve naročila.",
  preparedAt: (date: Date) => `Pripravljeno: ${storeDate(date)}`,
  updatedAt: (date: Date) => `Zadnja sprememba besedila: ${storeDate(date)}`,
  accepted: (hash: string) => `Oznaka različice, potrjene ob oddaji naročila (SHA-256): ${hash}`,
  acceptedCopy: "Spodaj je besedilo, kot je bilo objavljeno ob oddaji naročila.",
  changedSinceAcceptance: "Besedilo je bilo po oddaji naročila spremenjeno; potrjeno različico označuje zgornja oznaka.",
  missing: (url: string) => `Besedila ob pripravi kopije ni bilo mogoče pridobiti. Naslov strani: ${url}`,
};
