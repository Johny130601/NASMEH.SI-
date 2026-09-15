import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Newsletter withdrawal links (GDPR Art. 7(3)): `<subscriberId>-<hmac>`.
 * Same construction as the restock-alert token (lib/back-in-stock/
 * unsubscribe-token.ts) under its own HMAC purpose, so a token for one store
 * never verifies for the other. The separator is a hyphen, not a dot: the
 * middleware matcher skips dotted paths, and this route should keep the
 * per-request CSP and the maintenance allow-list like every other page.
 * The id never contains a hyphen, so the first one splits the token.
 */

const ID_PATTERN = /^[a-z0-9]{20,40}$/i;
const PURPOSE = "newsletter-unsubscribe:";

function sign(subscriberId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${PURPOSE}${subscriberId}`).digest("base64url");
}

export function signNewsletterUnsubscribeToken(subscriberId: string, secret: string): string {
  if (!ID_PATTERN.test(subscriberId)) throw new Error("invalid subscriber id");
  return `${subscriberId}-${sign(subscriberId, secret)}`;
}

export function verifyNewsletterUnsubscribeToken(token: string | null | undefined, secret: string): string | null {
  if (!token || token.length > 128) return null;
  const separator = token.indexOf("-");
  if (separator <= 0) return null;
  const id = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!ID_PATTERN.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = sign(id, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return id;
}

export function newsletterUnsubscribePath(subscriberId: string, secret: string): string {
  return `/odjava-novice/${signNewsletterUnsubscribeToken(subscriberId, secret)}`;
}
