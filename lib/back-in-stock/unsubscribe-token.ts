import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * One-click unsubscribe links for restock alerts: `<subscriptionId>.<hmac>`.
 * The id is the only payload, so the link stays valid until the row is gone
 * and cannot be forged for another subscription. Tamper → null.
 */

const ID_PATTERN = /^[a-z0-9]{20,40}$/i;

function sign(subscriptionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`back-in-stock-unsubscribe:${subscriptionId}`).digest("base64url");
}

export function signUnsubscribeToken(subscriptionId: string, secret: string): string {
  if (!ID_PATTERN.test(subscriptionId)) throw new Error("invalid subscription id");
  return `${subscriptionId}.${sign(subscriptionId, secret)}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined, secret: string): string | null {
  if (!token || token.length > 128) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!ID_PATTERN.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = sign(id, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return id;
}
