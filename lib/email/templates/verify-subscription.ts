import { email as copy } from "@/lib/copy/email";
import { emailLayout, emailStyles, escapeHtml } from "./layout";

/**
 * Double opt-in verification email (spec §13.1). Carries the signed
 * withdrawal link as well (GDPR Art. 7(3)), so every subscriber has a way out
 * from the first mail on.
 */
export function renderVerifySubscriptionEmail(confirmUrl: string, unsubscribeUrl: string): string {
  const safeUrl = confirmUrl.replace(/"/g, "%22");
  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.verifySubscription.heading}</h1>
    <p style="${emailStyles.p}">${copy.verifySubscription.body}</p>
    <p style="margin:2rem 0;">
      <a href="${safeUrl}" style="${emailStyles.button}">${copy.verifySubscription.cta}</a>
    </p>
    <p style="${emailStyles.small}">
      <a href="${safeUrl}" style="${emailStyles.link}">${safeUrl}</a>
    </p>
    <p style="${emailStyles.small}">
      ${copy.verifySubscription.ignore}<br />
      ${copy.verifySubscription.footer}
    </p>
    ${renderSubscriptionUnsubscribeBlock(unsubscribeUrl)}
  `);
}

/** The withdrawal sentence and link: rendered by the code template and appended to operator overrides. */
export function renderSubscriptionUnsubscribeBlock(unsubscribeUrl: string): string {
  return `<p style="${emailStyles.small}" data-newsletter-unsubscribe>${copy.verifySubscription.unsubscribe} <a href="${escapeHtml(unsubscribeUrl)}" style="${emailStyles.link}">${copy.verifySubscription.unsubscribeCta}</a></p>`;
}
