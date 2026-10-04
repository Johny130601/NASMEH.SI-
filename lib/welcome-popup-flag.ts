/**
 * The welcome popup's "not again this session" flag (§9.3): a session cookie
 * — no Max-Age or Expires, so the browser drops it when it closes — listed in
 * the cookie table as `nasmeh_welcome_seen` (lib/copy/cmp.ts). A cookie and
 * not sessionStorage, which is per tab: once dismissed, the popup stays away
 * in every tab of the browser session, a tab a mail link opens included (QA
 * 2026-10-03 T1-07). The popup sets it when it is dismissed or submitted, the
 * footer sign-up and the newsletter confirmation set it on success, so a
 * visitor who just gave their e-mail is not asked for it again (QA T7-F14).
 * It is a convenience flag, never consent, and the server never reads it.
 * Browser-only helpers without imports; blocked cookies read as "not seen"
 * and a failed write is ignored (the popup may then show again).
 */
export const WELCOME_SEEN_KEY = "nasmeh_welcome_seen";

export function welcomeSeenThisSession(): boolean {
  try {
    const jar = globalThis.document?.cookie ?? "";
    return jar.split(";").some((pair) => pair.trim().startsWith(`${WELCOME_SEEN_KEY}=`));
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  try {
    const doc = globalThis.document;
    if (!doc) return;
    const secure = globalThis.location?.protocol === "https:" ? "; Secure" : "";
    doc.cookie = `${WELCOME_SEEN_KEY}=1; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* blocked cookies: the popup may show again */
  }
}
