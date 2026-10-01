import { createHmac, timingSafeEqual } from "node:crypto";

/** Maintenance/password-mode cookie (spec §3.6). */
export const MAINTENANCE_COOKIE = "nasmeh_maintenance";
export const MAINTENANCE_MAX_AGE_S = 60 * 60 * 24; // 24h

const COOKIE_PAYLOAD = "nasmeh:maintenance-unlock:v2";

/**
 * The token proves "the gate was unlocked with the CURRENT password, at most
 * 24 h ago": it is keyed by AUTH_SECRET and bound to the stored password hash
 * and to its issue time, so changing the password revokes every earlier unlock
 * and the browser's cookie age is enforced server-side too (QA 2026-09-29, T7-F10).
 */
export function maintenanceCookieValue(secret: string, passwordHash: string, issuedAtMs = Date.now()): string {
  const issued = Math.floor(issuedAtMs / 1000).toString(10);
  return `${issued}.${signature(secret, passwordHash, issued)}`;
}

function signature(secret: string, passwordHash: string, issued: string): string {
  return createHmac("sha256", secret).update(`${COOKIE_PAYLOAD}\n${passwordHash}\n${issued}`).digest("hex");
}

export function isValidMaintenanceCookie(
  value: string | undefined,
  secret: string,
  passwordHash: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!value || !passwordHash) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const issued = value.slice(0, dot);
  if (!/^\d{1,12}$/.test(issued)) return false;
  const ageS = Math.floor(nowMs / 1000) - Number(issued);
  if (ageS < 0 || ageS > MAINTENANCE_MAX_AGE_S) return false;
  const expected = signature(secret, passwordHash, issued);
  const given = value.slice(dot + 1);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
