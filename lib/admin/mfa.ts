import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { common } from "@/lib/copy";
import { decryptSecret, encryptSecret } from "./secrets";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp";
import { consumeRecoveryCode, generateRecoveryCodes, hashRecoveryCode } from "./recovery-codes";

const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

export interface EnrolmentStart {
  secret: string;
  otpauth: string;
  qrSvg: string;
}

/**
 * Starts (or resumes) enrolment: a pending secret is stored encrypted with
 * `totpEnabledAt` still null, so a reload shows the same code to scan.
 */
export async function beginTotpEnrolment(userId: string): Promise<EnrolmentStart | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, totpEnabledAt: true, totpSecret: true },
  });
  if (!user || user.totpEnabledAt) return null;
  const master = getEnv().AUTH_SECRET;
  let secret = user.totpSecret ? decryptSecret(user.totpSecret, master) : null;
  if (!secret) {
    secret = generateTotpSecret();
    await db.user.update({
      where: { id: userId },
      data: { totpSecret: encryptSecret(secret, master), totpLastStep: null, totpRecoveryCodes: Prisma.DbNull },
    });
  }
  const otpauth = otpauthUri({ secret, account: user.email, issuer: common.siteName });
  const qrSvg = await QRCode.toString(otpauth, { type: "svg", margin: 1, width: 192 });
  return { secret, otpauth, qrSvg };
}

export type EnrolmentCompletion =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; reason: "not_started" | "already_enabled" | "invalid_code" | "rate_limited" };

export async function completeTotpEnrolment(userId: string, code: unknown): Promise<EnrolmentCompletion> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true },
  });
  if (!user) return { ok: false, reason: "not_started" };
  if (user.totpEnabledAt) return { ok: false, reason: "already_enabled" };
  if (!user.totpSecret) return { ok: false, reason: "not_started" };
  if (!checkRateLimit(`mfa-enrol:${userId}`, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS).allowed) return { ok: false, reason: "rate_limited" };
  const secret = decryptSecret(user.totpSecret, getEnv().AUTH_SECRET);
  if (!secret) return { ok: false, reason: "not_started" };
  const verification = verifyTotp(secret, code, { lastStep: user.totpLastStep });
  if (!verification.ok) return { ok: false, reason: "invalid_code" };
  const recoveryCodes = generateRecoveryCodes();
  await db.user.update({
    where: { id: userId },
    data: {
      totpEnabledAt: new Date(),
      totpLastStep: verification.step,
      totpRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
    },
  });
  return { ok: true, recoveryCodes };
}

export type SecondFactorOutcome =
  | { ok: true; method: "totp" | "recovery" }
  | { ok: false; reason: "invalid" | "rate_limited" | "not_enrolled" };

/** Login step two: a six-digit TOTP (replay-guarded) or an unused recovery code. */
export async function verifySecondFactor(userId: string, input: unknown): Promise<SecondFactorOutcome> {
  if (!checkRateLimit(`mfa-login:${userId}`, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS).allowed) return { ok: false, reason: "rate_limited" };
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true, totpRecoveryCodes: true },
  });
  if (!user?.totpEnabledAt || !user.totpSecret) return { ok: false, reason: "not_enrolled" };
  const text = String(input ?? "").trim();
  if (/^\d{3}\s?\d{3}$/.test(text)) {
    const secret = decryptSecret(user.totpSecret, getEnv().AUTH_SECRET);
    if (!secret) return { ok: false, reason: "not_enrolled" };
    const verification = verifyTotp(secret, text, { lastStep: user.totpLastStep });
    if (!verification.ok) return { ok: false, reason: "invalid" };
    // The step advances atomically; a concurrent replay of the same code loses.
    const claimed = await db.user.updateMany({
      where: { id: userId, totpLastStep: user.totpLastStep },
      data: { totpLastStep: verification.step },
    });
    return claimed.count === 1 ? { ok: true, method: "totp" } : { ok: false, reason: "invalid" };
  }
  const consumed = consumeRecoveryCode(user.totpRecoveryCodes, text);
  if (!consumed.ok) return { ok: false, reason: "invalid" };
  const claimed = await db.user.updateMany({
    where: { id: userId, totpRecoveryCodes: { equals: user.totpRecoveryCodes ?? [] } },
    data: { totpRecoveryCodes: consumed.remaining },
  });
  return claimed.count === 1 ? { ok: true, method: "recovery" } : { ok: false, reason: "invalid" };
}

/** New codes replace the old set; a current TOTP code is required. */
export async function regenerateRecoveryCodes(userId: string, code: unknown): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const outcome = await verifySecondFactor(userId, /^\d{6}$/.test(String(code ?? "").trim()) ? code : "");
  if (!outcome.ok || outcome.method !== "totp") return { ok: false };
  const recoveryCodes = generateRecoveryCodes();
  await db.user.update({ where: { id: userId }, data: { totpRecoveryCodes: recoveryCodes.map(hashRecoveryCode) } });
  return { ok: true, recoveryCodes };
}

/** Clears enrolment so the next login forces a fresh setup. */
export async function resetTotp(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: Prisma.DbNull },
  });
}
