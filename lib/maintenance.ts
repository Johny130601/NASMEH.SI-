import { createHmac, timingSafeEqual } from "node:crypto";

/** Maintenance/password-mode cookie (spec §3.6). */
export const MAINTENANCE_COOKIE = "nasmeh_maintenance";
export const MAINTENANCE_MAX_AGE_S = 60 * 60 * 24; // 24h

// Fixed payload — the token proves "gate was unlocked", independent of the
// current password, keyed by AUTH_SECRET.
const COOKIE_PAYLOAD = "nasmeh:maintenance-unlock:v1";

export function maintenanceCookieValue(secret: string): string {
  return createHmac("sha256", secret).update(COOKIE_PAYLOAD).digest("hex");
}

export function isValidMaintenanceCookie(
  value: string | undefined,
  secret: string,
): boolean {
  if (!value) return false;
  const expected = maintenanceCookieValue(secret);
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
