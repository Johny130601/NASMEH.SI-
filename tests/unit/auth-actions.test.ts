import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  human: vi.fn(), hash: vi.fn(), find: vi.fn(), transaction: vi.fn(), create: vi.fn(), consent: vi.fn(),
  issue: vi.fn(), apply: vi.fn(), verifyMail: vi.fn(), resetMail: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.find }, $transaction: mocks.transaction } }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.human }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/auth-tokens", () => ({ issueAuthToken: mocks.issue, applyAuthToken: mocks.apply }));
vi.mock("@/lib/email/mailer", () => ({ sendVerifyAccountEmail: mocks.verifyMail, sendResetPasswordEmail: mocks.resetMail }));
import { registerAction, forgotPasswordAction, verifyEmailAction, resetPasswordAction } from "@/app/(storefront)/actions/auth";
import { auth as copy } from "@/lib/copy";
const passwordHash = "$2b$10$" + "a".repeat(53);
const activation = { passwordHash, name: "Own Name", marketingOptIn: false };
const input = { firstName: "Own", lastName: "Name", email: " Owner@TEST.SI ", password: "StrongPassword!", turnstileToken: "human" };
const raw = "a".repeat(64);
const tx = { user: { create: mocks.create, updateMany: mocks.update }, consentLog: { create: mocks.consent } };
beforeEach(() => {
  vi.resetAllMocks(); mocks.human.mockResolvedValue(true); mocks.hash.mockResolvedValue(passwordHash);
  mocks.find.mockResolvedValue(null); mocks.create.mockResolvedValue({ id: "u", email: "owner@test.si", emailVerified: null });
  mocks.transaction.mockImplementation(async fn => fn(tx)); mocks.issue.mockResolvedValue(raw);
  mocks.update.mockResolvedValue({ count: 1 }); mocks.apply.mockImplementation(async (_raw, _kind, change) => { await change(tx, "u", activation); return true; });
});
describe("auth actions", () => {
  it("records pending registration consent with the new account in one transaction", async () => {
    expect(await registerAction(input)).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "owner@test.si", marketingOptIn: false }) });
    expect(mocks.consent).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "u", choices: { marketing: false, pendingVerification: true } }) });
    expect(mocks.issue).toHaveBeenCalledWith("u", "VERIFY_EMAIL", activation);
  });
  it("keeps opted-in marketing pending until email proof", async () => {
    expect(await registerAction({ ...input, marketingOptIn: true })).toEqual({ ok: true });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ marketingOptIn: false }) });
    expect(mocks.issue).toHaveBeenCalledWith("u", "VERIFY_EMAIL", { ...activation, marketingOptIn: true });
  });
  it("binds a repeated unverified registration to the shopper's current data, preventing pre-hijack", async () => {
    mocks.find.mockResolvedValue({ id: "u", emailVerified: null, name: "Attacker", marketingOptIn: true, passwordHash: "old" });
    expect(await registerAction(input)).toEqual({ ok: true });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.issue).toHaveBeenCalledWith("u", "VERIFY_EMAIL", activation);
  });
  it("does not alter or resend activation for an existing verified account", async () => {
    mocks.find.mockResolvedValue({ id: "u", emailVerified: new Date() });
    expect(await registerAction(input)).toEqual({ ok: true });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("applies the token's credentials, name and verified consent in the activation transaction", async () => {
    expect(await verifyEmailAction({ token: raw, turnstileToken: "human" })).toEqual({ ok: true });
    expect(mocks.apply).toHaveBeenCalledWith(raw, "VERIFY_EMAIL", expect.any(Function));
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "u", emailVerified: null }, data: { ...activation, emailVerified: expect.any(Date), sessionVersion: { increment: 1 } } });
    expect(mocks.consent).toHaveBeenCalledWith({ data: { userId: "u", kind: "marketing-activation", version: "1", choices: { marketing: false, verified: true } } });
  });
  it("cannot use activation to change an already verified account", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    expect(await verifyEmailAction({ token: raw, turnstileToken: "human" })).toEqual({ ok: false, error: copy.verify.genericError });
    expect(mocks.consent).not.toHaveBeenCalled();
  });
  it("atomically updates a reset password and revokes earlier sessions", async () => {
    expect(await resetPasswordAction({ token: raw, password: input.password, turnstileToken: "human" })).toEqual({ ok: true });
    expect(mocks.apply).toHaveBeenCalledWith(raw, "RESET_PASSWORD", expect.any(Function));
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "u", emailVerified: { not: null } }, data: { passwordHash, sessionVersion: { increment: 1 } } });
  });
  it("does not activate an unverified account through reset", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    expect(await resetPasswordAction({ token: raw, password: input.password, turnstileToken: "human" })).toEqual({ ok: false, error: copy.reset.genericError });
  });
  it("returns identical forgot-password results for absent, unverified and verified emails", async () => {
    const missing = await forgotPasswordAction(input);
    mocks.find.mockResolvedValueOnce({ id: "u", emailVerified: null });
    expect(await forgotPasswordAction(input)).toEqual(missing); expect(mocks.issue).not.toHaveBeenCalled();
    mocks.find.mockResolvedValueOnce({ id: "u", email: "owner@test.si", emailVerified: new Date() });
    expect(await forgotPasswordAction(input)).toEqual(missing); expect(mocks.resetMail).toHaveBeenCalledWith("owner@test.si", raw);
  });
  it("does not burn a valid token when a new password exceeds bcrypt's UTF-8 limit", async () => {
    expect((await resetPasswordAction({ token: raw, password: "💚".repeat(19), turnstileToken: "human" })).ok).toBe(false);
    expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled();
  });
  it.each([
    [registerAction, input], [forgotPasswordAction, input],
    [verifyEmailAction, { token: raw, turnstileToken: "human" }],
    [resetPasswordAction, { token: raw, password: input.password, turnstileToken: "human" }],
  ])("enforces a challenge before side effects for %s", async (action, payload) => {
    mocks.human.mockResolvedValue(false);
    expect(await action(payload)).toEqual({ ok: false, error: copy.botCheck });
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled();
  });
});
