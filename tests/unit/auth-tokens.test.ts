import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), update: vi.fn(), create: vi.fn(), find: vi.fn(), valid: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction, authToken: { findFirst: mocks.valid } } }));
import {
  ACCOUNT_MAIL_LIMIT, ACTIVATION_ATTEMPT_LIMIT, allowAccountMail, allowActivationAttempt,
  issueAuthToken, applyAuthToken, isAuthTokenValid, readActivationLink,
} from "@/lib/auth-tokens";
import { __resetRateLimits } from "@/lib/rate-limit";
const raw = "a".repeat(64);
const activationData = { passwordHash: "$2b$10$" + "a".repeat(53), name: "Owner", marketingOptIn: false };
const issuedAt = new Date("2026-09-14T08:00:00Z");
const tx = { $queryRaw: mocks.lock, authToken: { updateMany: mocks.update, create: mocks.create, findUnique: mocks.find } };
const superseded = (kind: string) => ({ where: { userId: "u", kind, usedAt: null }, data: { usedAt: expect.any(Date), activationData: Prisma.DbNull } });
beforeEach(() => {
  vi.resetAllMocks(); mocks.transaction.mockImplementation(async fn => fn(tx));
  mocks.find.mockResolvedValue({ userId: "u", activationData, createdAt: issuedAt }); mocks.update.mockResolvedValue({ count: 1 });
});
describe("auth token transactions", () => {
  it.each([["VERIFY_EMAIL", 86_400_000], ["RESET_PASSWORD", 3_600_000]] as const)("issues only a hash and bounded expiry for %s", async (kind, ttl) => {
    const start = Date.now(); const token = await issueAuthToken("u", kind, activationData);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(data.tokenHash).not.toBe(token); expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(start + ttl);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ttl);
    expect(mocks.lock).toHaveBeenCalledOnce();
  });
  it("a new reset link leaves only itself usable", async () => {
    await issueAuthToken("u", "RESET_PASSWORD");
    expect(mocks.update).toHaveBeenCalledWith(superseded("RESET_PASSWORD"));
    expect(mocks.create.mock.calls[0][0].data.activationData).toBeUndefined();
  });
  it("a registration's activation link voids no other link: each activates only with its own password (QA 2026-10-03 T3-02)", async () => {
    await issueAuthToken("u", "VERIFY_EMAIL", activationData);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it("drops the activation snapshot of every token it marks used, after handing it to the change", async () => {
    const change = vi.fn(async () => undefined);
    expect(await applyAuthToken(raw, "VERIFY_EMAIL", change)).toBe(true);
    // the change also learns when the snapshot was taken (a later withdrawal wins at activation)
    expect(change).toHaveBeenCalledWith(tx, "u", activationData, issuedAt);
    for (const [call] of mocks.update.mock.calls) expect(call.data).toEqual({ usedAt: expect.any(Date), activationData: Prisma.DbNull });
    // using one activation link consumes every other link of the account
    expect(mocks.update.mock.calls[1][0].where).toEqual({ userId: "u", kind: "VERIFY_EMAIL", usedAt: null });
  });
  it("makes the protected mutation inside the same transaction after token claim", async () => {
    const change = vi.fn(async transaction => { expect(transaction).toBe(tx); expect(mocks.update).toHaveBeenCalledOnce(); });
    expect(await applyAuthToken(raw, "RESET_PASSWORD", change)).toBe(true);
    expect(change).toHaveBeenCalledWith(tx, "u", activationData, issuedAt); expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update.mock.calls[0][0].where).toMatchObject({ kind: "RESET_PASSWORD", usedAt: null, expiresAt: { gt: expect.any(Date) } });
    expect(mocks.update.mock.calls[1][0].where).toEqual({ userId: "u", kind: "RESET_PASSWORD", usedAt: null });
  });
  it("propagates mutation failure out of the transaction so the token claim rolls back", async () => {
    await expect(applyAuthToken(raw, "RESET_PASSWORD", async () => { throw new Error("db failure"); })).rejects.toThrow("db failure");
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it("never mutates the account when token claim loses to replay, expiry, or another kind", async () => {
    mocks.update.mockResolvedValue({ count: 0 }); const change = vi.fn();
    expect(await applyAuthToken(raw, "VERIFY_EMAIL", change)).toBe(false); expect(change).not.toHaveBeenCalled();
  });
  it("does not lock or mutate for an unknown token", async () => {
    mocks.find.mockResolvedValue(null);
    expect(await applyAuthToken(raw, "VERIFY_EMAIL", vi.fn())).toBe(false); expect(mocks.lock).not.toHaveBeenCalled();
  });
  it.each([null, {}, "a".repeat(63), "a".repeat(65), "Z".repeat(64), "💚".repeat(32)])("rejects malformed tokens before database access: %j", async rawToken => {
    expect(await applyAuthToken(rawToken, "VERIFY_EMAIL", vi.fn())).toBe(false);
    expect(await isAuthTokenValid(rawToken, "VERIFY_EMAIL")).toBe(false);
    expect(await readActivationLink(rawToken)).toBeNull();
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.valid).not.toHaveBeenCalled();
  });
  it("read-only validation cannot consume a link", async () => {
    mocks.valid.mockResolvedValue({ id: "token", activationData });
    expect(await isAuthTokenValid(raw, "VERIFY_EMAIL")).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("reads a usable activation link's snapshot without consuming it (QA 2026-10-03 T3-02)", async () => {
    mocks.valid.mockResolvedValue({ userId: "u", activationData, createdAt: issuedAt });
    expect(await readActivationLink(raw)).toEqual({ userId: "u", snapshot: activationData, issuedAt });
    expect(mocks.valid).toHaveBeenCalledWith({
      where: { tokenHash: createHash("sha256").update(raw).digest("hex"), kind: "VERIFY_EMAIL", usedAt: null, expiresAt: { gt: expect.any(Date) } },
      select: { userId: true, activationData: true, createdAt: true },
    });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([
    ["unknown, used or expired", null],
    ["legacy, without a snapshot", { userId: "u", activationData: null, createdAt: issuedAt }],
    ["with a malformed snapshot", { userId: "u", activationData: { ...activationData, passwordHash: "plain" }, createdAt: issuedAt }],
  ])("has no activation link for a token that is %s", async (_label, row) => {
    mocks.valid.mockResolvedValue(row);
    expect(await readActivationLink(raw)).toBeNull();
  });
  it("rejects legacy activation links without a verified-shopper snapshot", async () => {
    mocks.valid.mockResolvedValue({ id: "token", activationData: null });
    mocks.find.mockResolvedValue({ userId: "u", activationData: null });
    expect(await isAuthTokenValid(raw, "VERIFY_EMAIL")).toBe(false);
    expect(await applyAuthToken(raw, "VERIFY_EMAIL", vi.fn())).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("binds registration activation to submitted credentials and consent", async () => {
    await issueAuthToken("u", "VERIFY_EMAIL", activationData);
    expect(mocks.create.mock.calls[0][0].data.activationData).toEqual(activationData);
  });
  it("post-purchase links (no activation argument) snapshot the created row and that snapshot verifies", async () => {
    // createPurchaserAccount: bcrypt cost 10, name from the checkout full name (at most 120 characters).
    const row = { passwordHash: await bcrypt.hash("Password123!", 10), name: "Ž".repeat(120), marketingOptIn: false };
    const findUser = vi.fn().mockResolvedValue(row);
    mocks.transaction.mockImplementation(async fn => fn({ ...tx, user: { findUnique: findUser } }));
    await issueAuthToken("u", "VERIFY_EMAIL");
    expect(findUser).toHaveBeenCalledWith({ where: { id: "u" }, select: { passwordHash: true, name: true, marketingOptIn: true } });
    const stored = mocks.create.mock.calls[0][0].data.activationData;
    expect(stored).toEqual(row);
    // The row is the one snapshot, so a resend (the opt-in may have been lowered since) leaves only the newest link.
    expect(mocks.update).toHaveBeenCalledWith(superseded("VERIFY_EMAIL"));
    mocks.valid.mockResolvedValue({ id: "token", activationData: stored });
    expect(await isAuthTokenValid(raw, "VERIFY_EMAIL")).toBe(true);
    mocks.find.mockResolvedValue({ userId: "u", activationData: stored, createdAt: issuedAt });
    const change = vi.fn(async () => undefined);
    expect(await applyAuthToken(raw, "VERIFY_EMAIL", change)).toBe(true);
    expect(change).toHaveBeenCalledWith(expect.anything(), "u", row, issuedAt);
  });
});

describe("per-address and per-account bounds (QA 2026-10-03 t3 N2, T3-02)", () => {
  beforeEach(() => { __resetRateLimits(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-03T10:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); __resetRateLimits(); });

  it("allows three account mails of a kind per address an hour, whatever the address's case or spacing", () => {
    expect(ACCOUNT_MAIL_LIMIT).toEqual({ perAddress: 3, windowMs: 3_600_000 });
    expect([1, 2, 3].map(() => allowAccountMail("RESET_PASSWORD", "ana@test.si"))).toEqual([true, true, true]);
    expect(allowAccountMail("RESET_PASSWORD", " ANA@test.si ")).toBe(false);
    // Another kind and another address keep their own budget.
    expect(allowAccountMail("VERIFY_EMAIL", "ana@test.si")).toBe(true);
    expect(allowAccountMail("RESET_PASSWORD", "bor@test.si")).toBe(true);
    vi.setSystemTime(new Date("2026-10-03T10:59:59Z"));
    expect(allowAccountMail("RESET_PASSWORD", "ana@test.si")).toBe(false);
    vi.setSystemTime(new Date("2026-10-03T11:00:00Z"));
    expect(allowAccountMail("RESET_PASSWORD", "ana@test.si")).toBe(true);
  });

  it("allows five activation password attempts per account in 15 minutes", () => {
    expect(ACTIVATION_ATTEMPT_LIMIT).toEqual({ perAccount: 5, windowMs: 900_000 });
    expect([1, 2, 3, 4, 5].map(() => allowActivationAttempt("u"))).toEqual([true, true, true, true, true]);
    expect(allowActivationAttempt("u")).toBe(false);
    expect(allowActivationAttempt("other")).toBe(true);
    vi.setSystemTime(new Date("2026-10-03T10:15:00Z"));
    expect(allowActivationAttempt("u")).toBe(true);
  });
});
