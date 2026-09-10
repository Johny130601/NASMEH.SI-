import { formatEUR } from "@/lib/pricing";
import { email as copy } from "@/lib/copy";
import { emailLayout, emailStyles } from "./layout";

export interface BackInStockAlertDetails {
  productTitle: string;
  productUrl: string;
  priceCents: number;
  unsubscribeUrl: string;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const attr = (url: string) => url.replace(/"/g, "%22");

/** The one transactional restock notification a confirmed subscriber agreed to (§13.1). */
export function renderBackInStockAlertEmail(details: BackInStockAlertDetails): string {
  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.backInStockAlert.heading}</h1>
    <p style="${emailStyles.p}">${copy.backInStockAlert.body} <strong>${escapeHtml(details.productTitle)}</strong></p>
    <p style="${emailStyles.p}">${copy.backInStockAlert.priceLabel}: ${formatEUR(details.priceCents)}</p>
    <p style="margin:2rem 0;">
      <a href="${attr(details.productUrl)}" style="${emailStyles.button}">${copy.backInStockAlert.cta}</a>
    </p>
    <p style="${emailStyles.small}">
      <a href="${attr(details.productUrl)}" style="${emailStyles.link}">${escapeHtml(details.productUrl)}</a>
    </p>
    <p style="${emailStyles.small}">
      ${copy.backInStockAlert.unsubscribe}
      <a href="${attr(details.unsubscribeUrl)}" style="${emailStyles.link}">${copy.backInStockAlert.unsubscribeCta}</a>
    </p>
    <p style="${emailStyles.small}">${copy.backInStockAlert.footer}</p>
  `);
}
