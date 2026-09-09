import { email as copy } from "@/lib/copy";
import { emailLayout, emailStyles } from "./layout";

/** Double opt-in verification email (spec §13.1). */
export function renderVerifySubscriptionEmail(confirmUrl: string): string {
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
  `);
}
