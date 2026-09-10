import { CredentialsSignin } from "@auth/core/errors";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { verifyTurnstile } from "@/lib/turnstile";
import { authEmailSchema, humanTokenSchema } from "@/lib/auth-validation";
import { isStaffRole } from "@/lib/admin/permissions";
import { PRE_AUTH_COOKIE, PRE_AUTH_TTL_MS, signPreAuthToken, verifyPreAuthToken } from "@/lib/admin/pre-auth";
import { verifySecondFactor } from "@/lib/admin/mfa";

class UnverifiedEmailError extends CredentialsSignin { code = "unverified"; }
class BotCheckError extends CredentialsSignin { code = "bot_check"; }
/** Password and challenge passed; a staff account still owes its second factor. */
class MfaRequiredError extends CredentialsSignin { code = "mfa_required"; }
class MfaInvalidError extends CredentialsSignin { code = "mfa_invalid"; }
class MfaExpiredError extends CredentialsSignin { code = "mfa_expired"; }

const passwordSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72),
  turnstileToken: humanTokenSchema,
});
const secondFactorSchema = z.object({
  preAuthToken: z.string().min(40).max(300),
  totpCode: z.string().trim().min(6).max(32),
});

interface AccountRow { id: string; email: string; name: string | null; role: Role; sessionVersion: number }

function toAuthUser(user: AccountRow) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, sessionVersion: user.sessionVersion };
}

/** Step two for staff: the pre-auth token plus a TOTP or recovery code. */
async function authorizeSecondFactor(input: z.infer<typeof secondFactorSchema>) {
  const preAuth = verifyPreAuthToken(input.preAuthToken, getEnv().AUTH_SECRET);
  if (!preAuth) throw new MfaExpiredError();
  const user = await db.user.findUnique({ where: { id: preAuth.userId } });
  if (!user?.emailVerified || !isStaffRole(user.role) || !user.totpEnabledAt) throw new MfaExpiredError();
  const outcome = await verifySecondFactor(user.id, input.totpCode);
  if (!outcome.ok) throw new MfaInvalidError();
  try {
    (await cookies()).delete(PRE_AUTH_COOKIE);
  } catch {
    // Outside a request scope the cookie simply expires.
  }
  return toAuthUser(user);
}

/** This provider boundary also protects direct Auth.js callback requests. */
export async function authorizeCredentials(raw: unknown) {
  const second = secondFactorSchema.safeParse(raw);
  if (second.success) return authorizeSecondFactor(second.data);

  const parsed = passwordSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (!await verifyTurnstile(parsed.data.turnstileToken)) throw new BotCheckError();
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user?.passwordHash) return null;
  if (!await bcrypt.compare(parsed.data.password, user.passwordHash)) return null;
  // Show activation guidance only after the correct password and challenge.
  if (!user.emailVerified) throw new UnverifiedEmailError();
  if (isStaffRole(user.role) && user.totpEnabledAt) {
    // No session yet: hand the proof of password to the second step only.
    const token = signPreAuthToken(user.id, getEnv().AUTH_SECRET);
    (await cookies()).set(PRE_AUTH_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: Math.floor(PRE_AUTH_TTL_MS / 1000),
    });
    throw new MfaRequiredError();
  }
  return toAuthUser(user);
}
