import { randomUUID } from "node:crypto";
import type { JWT } from "next-auth/jwt";
import type { User } from "next-auth";
import { db } from "@/lib/db";
import { isStaffRole } from "@/lib/admin/permissions";

/** Staff sessions expire 12 hours after sign-in; customers keep the default. */
export const STAFF_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Auth.js's default session lifetime, which customer sessions keep. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Node auth checks revocation, role and 2FA state against the database on every access.
 *
 * Every session carries a random id (`sid`) from its sign-in. Signing out records that
 * id until the token would have expired anyway, so a copy of the cookie stops working at
 * the sign-out — not 30 days (customers) or 12 hours (staff) later (QA 2026-10-03 T3-01).
 * A token without an id predates the change and is refused, like one without a version.
 */
export async function validateSessionToken(token: JWT, user?: User, now = Date.now()): Promise<JWT | null> {
  if (user) {
    token.sub = user.id;
    token.sessionVersion = user.sessionVersion;
    token.staffIssuedAt = now;
    token.sid = randomUUID();
  }
  if (!token.sub || !Number.isInteger(token.sessionVersion) || typeof token.sid !== "string") return null;
  const [current, revoked] = await Promise.all([
    db.user.findUnique({
      where: { id: token.sub },
      select: { sessionVersion: true, emailVerified: true, role: true, name: true, email: true, totpEnabledAt: true },
    }),
    db.revokedSession.findUnique({ where: { sid: token.sid }, select: { sid: true } }),
  ]);
  if (revoked) return null;
  if (!current?.emailVerified || current.sessionVersion !== token.sessionVersion) return null;
  if (isStaffRole(current.role)) {
    const issuedAt = token.staffIssuedAt;
    if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt) || now - issuedAt > STAFF_SESSION_MAX_AGE_MS) return null;
  }
  return {
    ...token,
    role: current.role,
    name: current.name,
    email: current.email,
    mfaEnrolled: !!current.totpEnabledAt,
  };
}

/**
 * Records a signed-out session so its token is refused from now on. Kept until the token's
 * own expiry (`exp`, seconds), after which the retention job deletes the row.
 */
export async function revokeSession(sid: unknown, exp: unknown, now = Date.now()): Promise<boolean> {
  if (typeof sid !== "string" || sid.length === 0 || sid.length > 64) return false;
  const expiresAt = typeof exp === "number" && Number.isFinite(exp) && exp * 1000 > now
    ? new Date(exp * 1000)
    : new Date(now + SESSION_MAX_AGE_MS);
  await db.revokedSession.upsert({ where: { sid }, create: { sid, expiresAt }, update: {} });
  return true;
}
