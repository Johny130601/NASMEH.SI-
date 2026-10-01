/**
 * Where sign-in returns to (QA T3-F1). The middleware and the checkout hint
 * pass the page the shopper wanted as `callbackUrl`; it is honoured only as a
 * same-origin relative path, so a crafted link can never send a fresh session
 * to another site. The sign-in and registration pages themselves and API routes
 * are never a destination. No imports: the login page, its action and the
 * post-login router share it.
 */
const PLACEHOLDER_ORIGIN = "http://callback.invalid";

export function safeCallbackPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > 512) return null;
  // Protocol-relative ("//host"), backslash tricks ("/\host") and control characters are refused outright.
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  if (/^\/(prijava|registracija|api)(\/|$)/.test(url.pathname)) return null;
  // The normalised path is what the redirect sends, so it passes the same checks
  // again: dot segments collapse "/.//evil.com" or "/a/..//evil.com" into the
  // protocol-relative "//evil.com", which a browser resolves off-site.
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.length > 2048) return null;
  return path;
}

/** The customer's destination after sign-in: the requested page, never the admin. */
export function customerLanding(callback: string | null): string {
  return callback && !/^\/admin(\/|$|\?|#)/.test(callback) ? callback : "/racun";
}

/** Staff land in the admin; a requested admin page is kept. */
export function staffLanding(callback: string | null): string {
  return callback && /^\/admin(\/|$|\?|#)/.test(callback) ? callback : "/admin";
}

/**
 * The address typed in a failed sign-in, kept for the next render of the form
 * only (QA T3-F2): the no-JavaScript path reloads the page, and an e-mail
 * address never travels in a URL. Scoped to /prijava and short-lived.
 */
export const LOGIN_EMAIL_COOKIE = "nasmeh_login_email";
export const LOGIN_EMAIL_COOKIE_PATH = "/prijava";
