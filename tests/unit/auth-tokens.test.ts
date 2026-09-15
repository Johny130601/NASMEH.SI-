import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), update: vi.fn(), create: vi.fn(), find: vi.fn(), valid: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction, authToken: { findFirst: mocks.valid } } }));
import { issueAuthToken, applyAuthToken, isAuthTokenValid } from "@/lib/auth-tokens";
const raw = "a".repeat(64);
const activationData = { passwordHash: "$2b$10$" + "a".repeat(53), name: "Owner", marketingOptIn: false };
const issuedAt = new Date("2026-09-14T08:00:00Z");
const tx = { $queryRaw: mocks.lock, authToken: { updateMany: mocks.update, create: mocks.create, findUnique: mocks.find } };
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
    expect(mocks.update).toHaveBeenCalledWith({ where: { userId: "u", kind, usedAt: null }, data: { usedAt: expect.any(Date), activationData: Prisma.DbNull } });
  });
  it("drops the activation snapshot of every token it marks used, after handing it to the change", async () => {
    const change = vi.fn(async () => undefined);
    expect(await applyAuthToken(raw, "VERIFY_EMAIL", change)).toBe(true);
    // the change also learns when the snapshot was taken (a later withdrawal wins at activation)
    expect(change).toHaveBeenCalledWith(tx, "u", activationData, issuedAt);
    for (const [call] of mocks.update.mock.calls) expect(call.data).toEqual({ usedAt: expect.any(Date), activationData: Prisma.DbNull });
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
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.valid).not.toHaveBeenCalled();
  });
  it("read-only validation cannot consume a link", async () => {
    mocks.valid.mockResolvedValue({ id: "token", activationData });
    expect(await isAuthTokenValid(raw, "VERIFY_EMAIL")).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
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
    mocks.valid.mockResolvedValue({ id: "token", activationData: stored });
    expect(await isAuthTokenValid(raw, "VERIFY_EMAIL")).toBe(true);
    mocks.find.mockResolvedValue({ userId: "u", activationData: stored, createdAt: issuedAt });
    const change = vi.fn(async () => undefined);
    expect(await applyAuthToken(raw, "VERIFY_EMAIL", change)).toBe(true);
    expect(change).toHaveBeenCalledWith(expect.anything(), "u", row, issuedAt);
  });
});
