import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { authActivationSchema, authTokenSchema } from "@/lib/auth-validation";

const TTL = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
} as const;
export type AuthTokenKind = keyof typeof TTL;
export type AuthActivation = z.infer<typeof authActivationSchema>;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
/**
 * Marking a token used also drops its activation snapshot (password hash, name,
 * consent): a used or superseded link can never apply it again (Art. 5(1)(c)).
 */
const consumed = (now: Date) => ({ usedAt: now, activationData: Prisma.DbNull });

/**
 * At most three account mails of one kind per address an hour (QA 2026-10-03
 * t3 N2). The challenge stops scripts, not someone who solves it again and
 * again, so without a bound one inbox could be flooded with activation or reset
 * links. The caller answers a throttled request exactly like a sent one, so
 * neither the bound nor the account's existence shows. In memory, like every
 * lib/rate-limit.ts bucket (one container).
 */
export const ACCOUNT_MAIL_LIMIT = { perAddress: 3, windowMs: 60 * 60_000 } as const;

/** Spends one of the address's mails of this kind; false once the hour's budget is used. */
export function allowAccountMail(kind: AuthTokenKind, email: string): boolean {
  const address = email.trim().toLowerCase();
  return checkRateLimit(`account-mail:${kind}:${address}`, ACCOUNT_MAIL_LIMIT.perAddress, ACCOUNT_MAIL_LIMIT.windowMs).allowed;
}

/**
 * Password attempts on an account's activation links (QA 2026-10-03 T3-02).
 * The link already proves the inbox; this bounds guessing at the password a
 * registrant chose. A right password consumes the link, so in effect the bound
 * counts wrong ones.
 */
export const ACTIVATION_ATTEMPT_LIMIT = { perAccount: 5, windowMs: 15 * 60_000 } as const;

export function allowActivationAttempt(userId: string): boolean {
  return checkRateLimit(`activation-attempt:${userId}`, ACTIVATION_ATTEMPT_LIMIT.perAccount, ACTIVATION_ATTEMPT_LIMIT.windowMs).allowed;
}

/** All token issuance/consumption for an account takes the same row lock. */
async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

/**
 * Raw tokens are emailed only. A reset link, and an activation link taken from
 * the account row (post-purchase), leave only the newest of their kind usable.
 * A registration's activation link (an explicit snapshot) voids none: it
 * activates only with the password chosen in that registration, so each
 * registrant's link stays theirs, and a second, unauthenticated registration of
 * the address can neither take over nor cancel the inbox owner's (QA 2026-10-03
 * T3-02). Using any activation link consumes all of them (applyAuthToken).
 */
export async function issueAuthToken(
  userId: string,
  kind: AuthTokenKind,
  activation?: AuthActivation,
): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const supersedes = kind !== "VERIFY_EMAIL" || activation === undefined;
  await db.$transaction(async tx => {
    await lockUser(tx, userId);
    // Post-purchase account creation already proves purchaser ownership. Capture
    // its credentials too; registration supplies the submitted account snapshot.
    const activationData = kind === "VERIFY_EMAIL" ? authActivationSchema.parse(activation ?? await tx.user.findUnique({
      where: { id: userId }, select: { passwordHash: true, name: true, marketingOptIn: true },
    })) : undefined;
    const now = new Date();
    if (supersedes) {
      await tx.authToken.updateMany({
        where: { userId, kind, usedAt: null }, data: consumed(now),
      });
    }
    await tx.authToken.create({ data: {
      tokenHash: hash(raw), userId, kind, activationData, expiresAt: new Date(now.getTime() + TTL[kind]),
    } });
  });
  return raw;
}

/** Read-only page validation; visiting or prefetching an email link never consumes it. */
export async function isAuthTokenValid(raw: unknown, kind: AuthTokenKind): Promise<boolean> {
  const parsed = authTokenSchema.safeParse(raw);
  if (!parsed.success) return false;
  const row = await db.authToken.findFirst({
    where: { tokenHash: hash(parsed.data), kind, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, activationData: true },
  });
  return !!row && (kind !== "VERIFY_EMAIL" || authActivationSchema.safeParse(row.activationData).success);
}

export interface ActivationLink {
  userId: string;
  snapshot: AuthActivation;
  /** When the snapshot was taken (a newsletter withdrawal after it wins at activation). */
  issuedAt: Date;
}

/**
 * A usable activation link — unused, unexpired, with a valid snapshot — read
 * without consuming it: the page shows what confirming it does, and activation
 * checks the typed password against its snapshot first (QA 2026-10-03 T3-02).
 */
export async function readActivationLink(raw: unknown): Promise<ActivationLink | null> {
  const parsed = authTokenSchema.safeParse(raw);
  if (!parsed.success) return null;
  const row = await db.authToken.findFirst({
    where: { tokenHash: hash(parsed.data), kind: "VERIFY_EMAIL", usedAt: null, expiresAt: { gt: new Date() } },
    select: { userId: true, activationData: true, createdAt: true },
  });
  if (!row) return null;
  const snapshot = authActivationSchema.safeParse(row.activationData);
  return snapshot.success ? { userId: row.userId, snapshot: snapshot.data, issuedAt: row.createdAt } : null;
}

/**
 * An activation link that no longer works because its account is already
 * active — used, or superseded by a newer link that was used (QA T3-F5). The
 * page then leads to sign-in instead of to a re-registration that sends
 * nothing. Only the holder of the 256-bit link learns this, and only for the
 * account the link was sent to.
 */
export async function isVerifiedAccountToken(raw: unknown): Promise<boolean> {
  const parsed = authTokenSchema.safeParse(raw);
  if (!parsed.success) return false;
  const row = await db.authToken.findFirst({
    where: { tokenHash: hash(parsed.data), kind: "VERIFY_EMAIL" },
    select: { user: { select: { emailVerified: true } } },
  });
  return !!row?.user.emailVerified;
}

/**
 * The protected mutation and token consumption commit or roll back together.
 * `issuedAt` is when the activation snapshot was taken, so the change can
 * honour a withdrawal made after the link was sent.
 */
export async function applyAuthToken(
  raw: unknown,
  kind: AuthTokenKind,
  change: (tx: Prisma.TransactionClient, userId: string, activationData: Prisma.JsonValue | null, issuedAt: Date) => Promise<void>,
): Promise<boolean> {
  const parsed = authTokenSchema.safeParse(raw);
  if (!parsed.success) return false;
  return db.$transaction(async tx => {
    const tokenHash = hash(parsed.data);
    const row = await tx.authToken.findUnique({ where: { tokenHash }, select: { userId: true, activationData: true, createdAt: true } });
    if (!row) return false;
    if (kind === "VERIFY_EMAIL" && !authActivationSchema.safeParse(row.activationData).success) return false;
    await lockUser(tx, row.userId);
    const now = new Date();
    const claimed = await tx.authToken.updateMany({
      where: { tokenHash, kind, usedAt: null, expiresAt: { gt: now } },
      data: consumed(now),
    });
    if (claimed.count !== 1) return false;
    // The snapshot read above stays valid for this transaction's change.
    await change(tx, row.userId, row.activationData, row.createdAt);
    await tx.authToken.updateMany({
      where: { userId: row.userId, kind, usedAt: null }, data: consumed(now),
    });
    return true;
  });
}
