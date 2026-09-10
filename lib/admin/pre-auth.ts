import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pre-authentication token: proof that the password and challenge already
 * passed, handed to the second login step in an httpOnly cookie. It is bound
 * to one user, expires after five minutes and can only be exchanged for a
 * session together with a valid TOTP or recovery code.
 */
export const PRE_AUTH_COOKIE = "nasmeh_preauth";
export const PRE_AUTH_TTL_MS = 5 * 60 * 1000;

const USER_ID = /^[a-z0-9]{20,40}$/i;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`pre-auth:${payload}`).digest("base64url");
}

export function signPreAuthToken(userId: string, secret: string, now = Date.now()): string {
  if (!USER_ID.test(userId)) throw new Error("invalid user id");
  const payload = `${userId}.${now + PRE_AUTH_TTL_MS}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyPreAuthToken(
  token: unknown,
  secret: string,
  now = Date.now(),
): { userId: string; expiresAt: number } | null {
  if (typeof token !== "string" || token.length > 300) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, expiry, nonce, signature] = parts;
  if (!USER_ID.test(userId) || !/^\d{1,16}$/.test(expiry) || !/^[A-Za-z0-9_-]{16}$/.test(nonce)) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = sign(`${userId}.${expiry}.${nonce}`, secret);
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return null;
  return { userId, expiresAt };
}
