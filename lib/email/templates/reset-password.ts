import { email as copy } from "@/lib/copy/email";
import { emailLayout, emailStyles } from "./layout";

/** Password reset email (§11.1). */
export function renderResetPasswordEmail(resetUrl: string): string {
  const safeUrl = resetUrl.replace(/"/g, "%22");
  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.resetPassword.heading}</h1>
    <p style="${emailStyles.p}">${copy.resetPassword.body}</p>
    <p style="margin:2rem 0;">
      <a href="${safeUrl}" style="${emailStyles.button}">${copy.resetPassword.cta}</a>
    </p>
    <p style="${emailStyles.small}">
      <a href="${safeUrl}" style="${emailStyles.link}">${safeUrl}</a>
    </p>
    <p style="${emailStyles.small}">
      ${copy.resetPassword.ignore}<br />
      ${copy.resetPassword.footer}
    </p>
  `);
}
