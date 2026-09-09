import { beforeEach, describe, expect, it, vi } from "vitest";
const find = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: find } } }));
import { validateSessionToken } from "@/lib/auth-session";
const current = { sessionVersion: 2, emailVerified: new Date(), role: "CUSTOMER", name: "Updated", email: "owner@test.si" };
beforeEach(() => { find.mockReset(); find.mockResolvedValue(current); });
describe("session revocation", () => {
  it("refreshes role and profile from current account state", async () => {
    expect(await validateSessionToken({ sub: "u", role: "ADMIN", sessionVersion: 2 })).toMatchObject({ role: "CUSTOMER", name: "Updated" });
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
