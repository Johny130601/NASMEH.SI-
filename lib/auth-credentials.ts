import { CredentialsSignin } from "@auth/core/errors";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { requestClientAddress } from "@/lib/client-address";
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
/** Too many password attempts for the address or from the client (Phase 9 step 1). */
class RateLimitedError extends CredentialsSignin { code = "rate_limited"; }

/**
 * FAILED password attempts within a window (QA T3-F3); a successful sign-in is
 * never counted. Three bounds, all checked before the challenge and the hash:
 * - `perAddressFromClient`: one address guessed from one client. Reaching it
 *   locks that client out of that address only, so someone typing wrong
 *   passwords for a customer's address cannot lock the customer out.
 * - `perAddress`: one address guessed from any number of clients, the bound on
 *   a distributed guess. Only it can lock the owner out, and reaching it takes
 *   at least `perAddress / perAddressFromClient` clients.
 * - `perClient`: one client across addresses (credential stuffing); generous,
 *   so a shared NAT or the e2e suite never trips it.
 * The TOTP step has its own limit in lib/admin/mfa.ts.
 */
export const LOGIN_ATTEMPT_LIMIT = { perAddressFromClient: 10, perAddress: 50, perClient: 200, windowMs: 15 * 60_000 } as const;

/**
 * Failure counters, in memory like lib/rate-limit.ts (one container). The
 * shared limiter counts every call, which is exactly what must not happen to a
 * correct password, hence a counter of its own.
 *
 * Every attempt RESERVES a failure in the same synchronous step as the limit
 * check, before the first await (challenge, lookup, hash): attempts fired in
 * parallel would otherwise all pass the check before any of them recorded, and
 * the bounds would only limit sequential guessing. The outcome then settles the
 * reservation — a correct password gives it back, a failed challenge keeps it
 * for the client only, and a wrong password or unknown address keeps it.
 */
interface FailureBucket { count: number; resetAt: number }
const failures = new Map<string, FailureBucket>();
const MAX_FAILURE_BUCKETS = 10_000;

function failureCount(key: string, now: number): number {
  const bucket = failures.get(key);
  return bucket && bucket.resetAt > now ? bucket.count : 0;
}

function recordFailure(keys: string[], now: number): void {
  if (failures.size > MAX_FAILURE_BUCKETS) {
    for (const [key, bucket] of failures) if (bucket.resetAt <= now) failures.delete(key);
  }
  for (const key of keys) {
    const bucket = failures.get(key);
    if (!bucket || bucket.resetAt <= now) failures.set(key, { count: 1, resetAt: now + LOGIN_ATTEMPT_LIMIT.windowMs });
    else bucket.count += 1;
  }
}

/** Gives back a reservation that turned out not to be a failed password. */
function releaseFailure(keys: string[]): void {
  for (const key of keys) {
    const bucket = failures.get(key);
    if (!bucket) continue;
    if (bucket.count <= 1) failures.delete(key);
    else bucket.count -= 1;
  }
}

/** Test-only: forget every failed attempt. */
export function __resetLoginFailures(): void {
  failures.clear();
}

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
  const client = await requestClientAddress();
  const now = Date.now();
  const keys = {
    pair: `login-fail:${parsed.data.email}|${client}`,
    address: `login-fail:${parsed.data.email}`,
    client: `login-fail-ip:${client}`,
  };
  if (
    failureCount(keys.pair, now) >= LOGIN_ATTEMPT_LIMIT.perAddressFromClient ||
    failureCount(keys.address, now) >= LOGIN_ATTEMPT_LIMIT.perAddress ||
    failureCount(keys.client, now) >= LOGIN_ATTEMPT_LIMIT.perClient
  ) throw new RateLimitedError();
  // Reserved in the same synchronous step as the check above (see the counters' note).
  recordFailure([keys.pair, keys.address, keys.client], now);
  if (!await verifyTurnstile(parsed.data.turnstileToken)) {
    // A failed challenge counts against the client only: it never locks the address.
    releaseFailure([keys.pair, keys.address]);
    throw new BotCheckError();
  }
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // An unknown address and a wrong password count alike (the reservation stands), so the counters disclose nothing.
  if (!user?.passwordHash) return null;
  if (!await bcrypt.compare(parsed.data.password, user.passwordHash)) return null;
  // The right password is never a failure; from this client, its own guesses at the address are forgotten.
  releaseFailure([keys.address, keys.client]);
  failures.delete(keys.pair);
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
