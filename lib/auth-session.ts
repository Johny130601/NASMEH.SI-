import type { JWT } from "next-auth/jwt";
import type { User } from "next-auth";
import { db } from "@/lib/db";

/** Node auth checks revocation and role against the database on every access. */
export async function validateSessionToken(token: JWT, user?: User): Promise<JWT | null> {
  if (user) {
    token.sub = user.id;
    token.sessionVersion = user.sessionVersion;
  }
  if (!token.sub || !Number.isInteger(token.sessionVersion)) return null;
  const current = await db.user.findUnique({
    where: { id: token.sub },
    select: { sessionVersion: true, emailVerified: true, role: true, name: true, email: true },
  });
  if (!current?.emailVerified || current.sessionVersion !== token.sessionVersion) return null;
  return { ...token, role: current.role, name: current.name, email: current.email };
}
