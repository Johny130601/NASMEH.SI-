import { beforeEach, describe, expect, it, vi } from "vitest";
const find = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: find } } }));
import { STAFF_SESSION_MAX_AGE_MS, validateSessionToken } from "@/lib/auth-session";
const current = { sessionVersion: 2, emailVerified: new Date(), role: "CUSTOMER", name: "Updated", email: "owner@test.si", totpEnabledAt: null };
beforeEach(() => { find.mockReset(); find.mockResolvedValue(current); });
describe("session revocation", () => {
  it("refreshes role and profile from current account state", async () => {
    expect(await validateSessionToken({ sub: "u", role: "OWNER", sessionVersion: 2 })).toMatchObject({ role: "CUSTOMER", name: "Updated", mfaEnrolled: false });
  });
  it("rejects JWTs issued before a password reset", async () => {
    expect(await validateSessionToken({ sub: "u", sessionVersion: 1 })).toBeNull();
  });
  it("rejects legacy tokens without a revocation version", async () => {
    expect(await validateSessionToken({ sub: "u" })).toBeNull(); expect(find).not.toHaveBeenCalled();
  });
  it("rejects deleted and unverified accounts", async () => {
    find.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...current, emailVerified: null });
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2 })).toBeNull();
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2 })).toBeNull();
  });
  it("binds a new sign-in to the version that authenticated the password", async () => {
    expect(await validateSessionToken({}, { id: "u", role: "CUSTOMER", sessionVersion: 2 })).toMatchObject({ sub: "u", sessionVersion: 2 });
  });
  it("rejects a sign-in racing a reset between authorize and JWT issuance", async () => {
    expect(await validateSessionToken({}, { id: "u", role: "CUSTOMER", sessionVersion: 1 })).toBeNull();
  });
});
describe("staff sessions", () => {
  const staff = { ...current, role: "OWNER", totpEnabledAt: new Date() };
  it("carry the 2FA state and expire 12 hours after sign-in", async () => {
    find.mockResolvedValue(staff);
    const signedIn = await validateSessionToken({}, { id: "u", role: "OWNER", sessionVersion: 2 }, 1_000_000);
    expect(signedIn).toMatchObject({ sub: "u", role: "OWNER", mfaEnrolled: true, staffIssuedAt: 1_000_000 });
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, staffIssuedAt: 1_000_000 }, undefined, 1_000_000 + STAFF_SESSION_MAX_AGE_MS)).toMatchObject({ role: "OWNER" });
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, staffIssuedAt: 1_000_000 }, undefined, 1_000_000 + STAFF_SESSION_MAX_AGE_MS + 1)).toBeNull();
  });
  it("reject staff tokens that carry no sign-in time, while customers keep the default lifetime", async () => {
    find.mockResolvedValue(staff);
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2 })).toBeNull();
    find.mockResolvedValue(current);
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2 }, undefined, Date.now() + 40 * STAFF_SESSION_MAX_AGE_MS)).toMatchObject({ role: "CUSTOMER" });
  });
  it("reports pending enrolment for staff without a confirmed authenticator", async () => {
    find.mockResolvedValue({ ...staff, totpEnabledAt: null });
    expect(await validateSessionToken({ sub: "u", sessionVersion: 2, staffIssuedAt: Date.now() })).toMatchObject({ role: "OWNER", mfaEnrolled: false });
  });
});
