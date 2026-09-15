import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authActivationSchema, authTokenSchema } from "@/lib/auth-validation";

const TTL = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
} as const;
export type AuthTokenKind = keyof typeof TTL;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
/**
 * Marking a token used also drops its activation snapshot (password hash, name,
 * consent): a used or superseded link can never apply it again (Art. 5(1)(c)).
 */
const consumed = (now: Date) => ({ usedAt: now, activationData: Prisma.DbNull });

/** All token issuance/consumption for an account takes the same row lock. */
async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

/** Only the newest token of a given kind remains usable. Raw tokens are emailed only. */
export async function issueAuthToken(
  userId: string,
  kind: AuthTokenKind,
  activation?: { passwordHash: string; name: string | null; marketingOptIn: boolean },
): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await db.$transaction(async tx => {
    await lockUser(tx, userId);
    // Post-purchase account creation already proves purchaser ownership. Capture
    // its credentials too; registration supplies the submitted account snapshot.
    const activationData = kind === "VERIFY_EMAIL" ? authActivationSchema.parse(activation ?? await tx.user.findUnique({
      where: { id: userId }, select: { passwordHash: true, name: true, marketingOptIn: true },
    })) : undefined;
    const now = new Date();
    await tx.authToken.updateMany({
      where: { userId, kind, usedAt: null }, data: consumed(now),
    });
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
