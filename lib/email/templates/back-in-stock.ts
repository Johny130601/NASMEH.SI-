import { email as copy } from "@/lib/copy/email";
import { emailLayout, emailStyles, escapeHtml } from "./layout";

/**
 * Back-in-stock double opt-in verification (spec §5/§6). Carries the signed
 * one-click withdrawal link as well, so the alert can be withdrawn from the
 * first mail on, before it fires (legal checklist MK-7, QA 2026-10-03
 * BIS-UNSUB) — the same way out the newsletter's first mail gives.
 */
export function renderBackInStockEmail(
  confirmUrl: string,
  productTitle: string,
  unsubscribeUrl: string,
): string {
  const safeUrl = confirmUrl.replace(/"/g, "%22");
  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.backInStock.heading}</h1>
    <p style="${emailStyles.p}">${copy.backInStock.body} <strong>${escapeHtml(productTitle)}</strong>${copy.backInStock.bodySuffix}</p>
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
    ${renderBackInStockUnsubscribeBlock(unsubscribeUrl)}
  `);
}

/** The withdrawal block; also appended after an operator override, which cannot remove it. */
export function renderBackInStockUnsubscribeBlock(unsubscribeUrl: string): string {
  return `<p style="${emailStyles.small}" data-bis-unsubscribe>${copy.backInStock.unsubscribe} <a href="${escapeHtml(unsubscribeUrl)}" style="${emailStyles.link}">${copy.backInStock.unsubscribeCta}</a></p>`;
}
