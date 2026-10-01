/**
 * The welcome popup's "not again this session" flag (§9.3): a sessionStorage
 * key, not a cookie, listed in the cookie table as `nasmeh_welcome_seen`
 * (lib/copy/cmp.ts). The popup sets it when it is dismissed or submitted, and
 * the footer sign-up sets it on success, so a visitor who just gave their
 * e-mail is not asked for it again in the same tab (QA T7-F14). Browser-only
 * helpers without imports; blocked storage reads as "not seen" and a failed
 * write is ignored (the popup may then show again this session).
 */
export const WELCOME_SEEN_KEY = "nasmeh_welcome_seen";

export function welcomeSeenThisSession(): boolean {
  try {
    return Boolean(globalThis.sessionStorage?.getItem(WELCOME_SEEN_KEY));
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  try {
    globalThis.sessionStorage?.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    /* blocked storage: the popup may show again this session */
  }
}
