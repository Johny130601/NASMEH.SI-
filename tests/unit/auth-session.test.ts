import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), revokedFind: vi.fn(), revokedUpsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  user: { findUnique: mocks.find },
  revokedSession: { findUnique: mocks.revokedFind, upsert: mocks.revokedUpsert },
} }));
import { SESSION_MAX_AGE_MS, STAFF_SESSION_MAX_AGE_MS, revokeSession, validateSessionToken } from "@/lib/auth-session";
const find = mocks.find;
const current = { sessionVersion: 2, emailVerified: new Date(), role: "CUSTOMER", name: "Updated", email: "owner@test.si", totpEnabledAt: null };
beforeEach(() => {
  vi.resetAllMocks();
  find.mockResolvedValue(current);
  mocks.revokedFind.mockResolvedValue(null);
  mocks.revokedUpsert.mockResolvedValue({});
});
describe("session revocation", () => {
  it("refreshes role and profile from current account state", async () => {
    expect(await validateSessionToken({ sub: "u", role: "OWNER", sessionVersion: 2, sid: "s1" })).toMatchObject({ role: "CUSTOMER", name: "Updated", mfaEnrolled: false });
  });
  it("rejects JWTs issued before a password reset", async () => {
    expect(await validateSessionToken({ sub: "u", sessionVersion: 1, sid: "s1" })).toBeNull();
  });
  it("rejects legacy tokens without a revocation version", async () => {
    expect(await validateSessionToken({ sub: "u", sid: "s1" })).toBeNull(); expect(find).not.toHaveBeenCalled();
  });
  it("rejects tokens without a session id, which a sign-out could not recall (QA 2026-10-03 T3-01)", async () => {
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2 })).toBeNull(); expect(find).not.toHaveBeenCalled();
  });
  it("rejects a session that was signed out, even with a valid version (QA 2026-10-03 T3-01)", async () => {
    mocks.revokedFind.mockResolvedValue({ sid: "s1" });
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, sid: "s1" })).toBeNull();
    expect(mocks.revokedFind).toHaveBeenCalledWith({ where: { sid: "s1" }, select: { sid: true } });
  });
  it("rejects deleted and unverified accounts", async () => {
    find.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...current, emailVerified: null });
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, sid: "s1" })).toBeNull();
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, sid: "s1" })).toBeNull();
  });
  it("binds a new sign-in to the version that authenticated the password, with a fresh session id", async () => {
    const first = await validateSessionToken({}, { id: "u", role: "CUSTOMER", sessionVersion: 2 });
    const second = await validateSessionToken({}, { id: "u", role: "CUSTOMER", sessionVersion: 2 });
    expect(first).toMatchObject({ sub: "u", sessionVersion: 2, sid: expect.any(String) });
    expect(first!.sid).not.toBe(second!.sid);
  });
  it("rejects a sign-in racing a reset between authorize and JWT issuance", async () => {
    expect(await validateSessionToken({}, { id: "u", role: "CUSTOMER", sessionVersion: 1 })).toBeNull();
  });
});
describe("sign-out records the session until its token expires", () => {
  const now = Date.UTC(2026, 9, 3, 12);
  it("keeps the record until the token's own exp", async () => {
    const exp = now / 1000 + 3600;
    expect(await revokeSession("s1", exp, now)).toBe(true);
    expect(mocks.revokedUpsert).toHaveBeenCalledWith({ where: { sid: "s1" }, create: { sid: "s1", expiresAt: new Date(exp * 1000) }, update: {} });
  });
  it("falls back to the default session lifetime without a usable exp", async () => {
    await revokeSession("s1", undefined, now);
    expect(mocks.revokedUpsert.mock.calls[0][0].create.expiresAt).toEqual(new Date(now + SESSION_MAX_AGE_MS));
  });
  it("ignores a token that carries no session id", async () => {
    expect(await revokeSession(undefined, 123, now)).toBe(false);
    expect(await revokeSession("x".repeat(65), 123, now)).toBe(false);
    expect(mocks.revokedUpsert).not.toHaveBeenCalled();
  });
});
describe("staff sessions", () => {
  const staff = { ...current, role: "OWNER", totpEnabledAt: new Date() };
  it("carry the 2FA state and expire 12 hours after sign-in", async () => {
    find.mockResolvedValue(staff);
    const signedIn = await validateSessionToken({}, { id: "u", role: "OWNER", sessionVersion: 2 }, 1_000_000);
    expect(signedIn).toMatchObject({ sub: "u", role: "OWNER", mfaEnrolled: true, staffIssuedAt: 1_000_000 });
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, sid: "s1", staffIssuedAt: 1_000_000 }, undefined, 1_000_000 + STAFF_SESSION_MAX_AGE_MS)).toMatchObject({ role: "OWNER" });
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, sid: "s1", staffIssuedAt: 1_000_000 }, undefined, 1_000_000 + STAFF_SESSION_MAX_AGE_MS + 1)).toBeNull();
  });
  it("reject staff tokens that carry no sign-in time, while customers keep the default lifetime", async () => {
    find.mockResolvedValue(staff);
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, sid: "s1" })).toBeNull();
    find.mockResolvedValue(current);
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, sid: "s1" }, undefined, Date.now() + 40 * STAFF_SESSION_MAX_AGE_MS)).toMatchObject({ role: "CUSTOMER" });
  });
  it("reports pending enrolment for staff without a confirmed authenticator", async () => {
    find.mockResolvedValue({ ...staff, totpEnabledAt: null });
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, sid: "s1", staffIssuedAt: Date.now() })).toMatchObject({ role: "OWNER", mfaEnrolled: false });
  });
});
