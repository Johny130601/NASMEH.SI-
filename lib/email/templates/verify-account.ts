import { email as copy } from "@/lib/copy/email";
import { emailLayout, emailStyles } from "./layout";

/** Account double opt-in verification (§11.1). */
export function renderVerifyAccountEmail(confirmUrl: string): string {
  const safeUrl = confirmUrl.replace(/"/g, "%22");
  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.verifyAccount.heading}</h1>
    <p style="${emailStyles.p}">${copy.verifyAccount.body}</p>
    <p style="margin:2rem 0;">
      <a href="${safeUrl}" style="${emailStyles.button}">${copy.verifyAccount.cta}</a>
    </p>
    <p style="${emailStyles.small}">
      <a href="${safeUrl}" style="${emailStyles.link}">${safeUrl}</a>
    </p>
    <p style="${emailStyles.small}">
      ${copy.verifyAccount.ignore}<br />
      ${copy.verifyAccount.footer}
    </p>
  `);
}
