import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  human: vi.fn(), hash: vi.fn(), find: vi.fn(), transaction: vi.fn(), create: vi.fn(), consent: vi.fn(),
  issue: vi.fn(), apply: vi.fn(), verifyMail: vi.fn(), resetMail: vi.fn(), update: vi.fn(),
  txUser: vi.fn(), subscriber: vi.fn(),
}));
// A re-issued activation records its own marketing-register row, so the client itself writes consent.
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.find }, $transaction: mocks.transaction, consentLog: { create: mocks.consent } } }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.human }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/auth-tokens", () => ({ issueAuthToken: mocks.issue, applyAuthToken: mocks.apply }));
vi.mock("@/lib/email/mailer", () => ({ sendVerifyAccountEmail: mocks.verifyMail, sendResetPasswordEmail: mocks.resetMail }));
import { registerAction, forgotPasswordAction, verifyEmailAction, resetPasswordAction } from "@/app/(storefront)/actions/auth";
import { auth as copy } from "@/lib/copy";
import { marketingVersion } from "@/lib/consent-log";
const passwordHash = "$2b$10$" + "a".repeat(53);
const activation = { passwordHash, name: "Own Name", marketingOptIn: false };
const input = { firstName: "Own", lastName: "Name", email: " Owner@TEST.SI ", password: "StrongPassword!", turnstileToken: "human" };
const raw = "a".repeat(64);
const tx = {
  user: { create: mocks.create, updateMany: mocks.update, findUnique: mocks.txUser },
  subscriber: { findUnique: mocks.subscriber }, consentLog: { create: mocks.consent },
};
const issuedAt = new Date("2026-09-14T08:00:00Z");
beforeEach(() => {
  vi.resetAllMocks(); mocks.human.mockResolvedValue(true); mocks.hash.mockResolvedValue(passwordHash);
  mocks.find.mockResolvedValue(null); mocks.create.mockResolvedValue({ id: "u", email: "owner@test.si", emailVerified: null });
  mocks.transaction.mockImplementation(async fn => fn(tx)); mocks.issue.mockResolvedValue(raw);
  mocks.update.mockResolvedValue({ count: 1 }); mocks.apply.mockImplementation(async (_raw, _kind, change) => { await change(tx, "u", activation, issuedAt); return true; });
  mocks.txUser.mockResolvedValue({ email: "owner@test.si" }); mocks.subscriber.mockResolvedValue(null);
});
describe("auth actions", () => {
  it("records pending registration consent with the new account in one transaction", async () => {
    expect(await registerAction(input)).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "owner@test.si", marketingOptIn: false }) });
    expect(mocks.consent).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "u", kind: "marketing-register", version: marketingVersion("marketing-register"),
      choices: { marketing: false, pendingVerification: true, source: "register" },
    }) });
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
    // The re-issue changes the opt-in activation will apply, so it leaves its own row:
    // without it the log could read register:false then activation:true with nothing between.
    expect(mocks.consent).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "u", kind: "marketing-register", version: marketingVersion("marketing-register"),
      choices: { marketing: false, pendingVerification: true, source: "register" },
    }) });
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
    expect(mocks.consent).toHaveBeenCalledWith({ data: {
      userId: "u", kind: "marketing-activation", version: marketingVersion("marketing-activation"),
      choices: { marketing: false, verified: true, source: "register" }, visitorId: null,
    } });
  });
  describe("a newsletter withdrawal after the link was issued wins over the snapshot's opt-in (S4)", () => {
    const optedIn = { ...activation, marketingOptIn: true };
    const activate = () => {
      mocks.apply.mockImplementation(async (_raw, _kind, change) => { await change(tx, "u", optedIn, issuedAt); return true; });
      return verifyEmailAction({ token: raw, turnstileToken: "human" });
    };
    it("unsubscribed after issue: activates with marketing off and logs why", async () => {
      mocks.subscriber.mockResolvedValue({ id: "sub-1", status: "UNSUBSCRIBED", updatedAt: new Date(issuedAt.getTime() + 60_000) });
      expect(await activate()).toEqual({ ok: true });
      expect(mocks.subscriber).toHaveBeenCalledWith({ where: { email: "owner@test.si" }, select: { id: true, status: true, updatedAt: true } });
      expect(mocks.update).toHaveBeenCalledWith({ where: { id: "u", emailVerified: null }, data: { ...optedIn, marketingOptIn: false, emailVerified: expect.any(Date), sessionVersion: { increment: 1 } } });
      expect(mocks.consent).toHaveBeenCalledWith({ data: expect.objectContaining({
        userId: "u", kind: "marketing-activation",
        choices: { marketing: false, verified: true, source: "register", requested: true, withdrawnAfterIssue: true, subscriberId: "sub-1" },
      }) });
    });
    it.each([
      ["no subscriber", null],
      ["unsubscribed before the link (a fresh registration consent)", { id: "sub-1", status: "UNSUBSCRIBED", updatedAt: new Date(issuedAt.getTime() - 60_000) }],
      ["still confirmed", { id: "sub-1", status: "CONFIRMED", updatedAt: new Date(issuedAt.getTime() + 60_000) }],
      ["pending", { id: "sub-1", status: "PENDING", updatedAt: new Date(issuedAt.getTime() + 60_000) }],
    ])("keeps the snapshot's opt-in: %s", async (_label, subscriber) => {
      mocks.subscriber.mockResolvedValue(subscriber);
      expect(await activate()).toEqual({ ok: true });
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ marketingOptIn: true }) }));
      expect(mocks.consent).toHaveBeenCalledWith({ data: expect.objectContaining({ choices: { marketing: true, verified: true, source: "register" } }) });
    });
    it("an opted-out snapshot needs no subscriber lookup", async () => {
      expect(await verifyEmailAction({ token: raw, turnstileToken: "human" })).toEqual({ ok: true });
      expect(mocks.subscriber).not.toHaveBeenCalled();
    });
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
  it("names every field the server refuses at registration (QA T3-F4)", async () => {
    const result = await registerAction({ ...input, firstName: "   ", lastName: "x".repeat(61), email: "qa@x", password: "kratko" });
    expect(result).toEqual({
      ok: false, error: copy.register.invalidInput,
      fields: {
        firstName: copy.register.fields.firstName, lastName: copy.register.fields.lastName,
        email: copy.register.fields.email, password: copy.register.fields.password,
      },
    });
    expect(await registerAction({ ...input, password: "x".repeat(73) })).toEqual({
      ok: false, error: copy.register.invalidInput, fields: { password: copy.register.fields.password },
    });
    expect(mocks.human).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled();
  });
  it("keeps a generic answer when no named field is at fault", async () => {
    expect(await registerAction({ ...input, marketingOptIn: "yes" })).toEqual({ ok: false, error: copy.register.genericError });
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
