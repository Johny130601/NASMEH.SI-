import type { JWT } from "next-auth/jwt";
import type { User } from "next-auth";
import { db } from "@/lib/db";
import { isStaffRole } from "@/lib/admin/permissions";

/** Staff sessions expire 12 hours after sign-in; customers keep the default. */
export const STAFF_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Node auth checks revocation, role and 2FA state against the database on every access. */
export async function validateSessionToken(token: JWT, user?: User, now = Date.now()): Promise<JWT | null> {
  if (user) {
    token.sub = user.id;
    token.sessionVersion = user.sessionVersion;
    token.staffIssuedAt = now;
  }
  if (!token.sub || !Number.isInteger(token.sessionVersion)) return null;
  const current = await db.user.findUnique({
    where: { id: token.sub },
    select: { sessionVersion: true, emailVerified: true, role: true, name: true, email: true, totpEnabledAt: true },
  });
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
