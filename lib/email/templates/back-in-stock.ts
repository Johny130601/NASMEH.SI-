import { email as copy } from "@/lib/copy";
import { emailLayout, emailStyles } from "./layout";

/** Back-in-stock double opt-in verification (spec §5/§6). */
export function renderBackInStockEmail(
  confirmUrl: string,
  productTitle: string,
): string {
  const safeUrl = confirmUrl.replace(/"/g, "%22");
  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.backInStock.heading}</h1>
    <p style="${emailStyles.p}">${copy.backInStock.body} <strong>${productTitle}</strong>${copy.backInStock.bodySuffix}</p>
    <p style="margin:2rem 0;">
      <a href="${safeUrl}" style="${emailStyles.button}">${copy.backInStock.cta}</a>
    </p>
    <p style="${emailStyles.small}">
      <a href="${safeUrl}" style="${emailStyles.link}">${safeUrl}</a>
    </p>
    <p style="${emailStyles.small}">
      ${copy.backInStock.ignore}<br />
      ${copy.backInStock.footer}
    </p>
  `);
}
