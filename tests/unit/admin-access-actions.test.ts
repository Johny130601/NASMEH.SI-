import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Direct action-call permission tests (Phase 7 convention): every admin
 * Server Action re-checks the session; UI visibility is never the boundary.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), revalidate: vi.fn(), signOut: vi.fn(),
  resetTotp: vi.fn(), regenerate: vi.fn(), complete: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth, signOut: mocks.signOut }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany, create: mocks.create } } }));
vi.mock("@/lib/admin/mfa", () => ({ resetTotp: mocks.resetTotp, regenerateRecoveryCodes: mocks.regenerate, completeTotpEnrolment: mocks.complete }));

import { changeStaffRoleAction, createStaffMemberAction, resetStaffTotpAction, revokeStaffSessionsAction } from "@/app/admin/(shell)/ekipa/actions";
import { regenerateRecoveryCodesAction, signOutEverywhereAction } from "@/app/admin/(shell)/racun/actions";
import { completeEnrolmentAction } from "@/app/admin/2fa/actions";
import { requirePermission, requireStaff } from "@/lib/admin/access";

const owner = { user: { id: "cmf0owner00000000000000001", email: "owner@nasmeh.si", name: "Owner", role: "OWNER", mfaEnrolled: true } };
const session = (role: string, mfaEnrolled = true) => ({ user: { id: `cmf0${role.toLowerCase()}000000000000000001`, email: `${role.toLowerCase()}@nasmeh.si`, name: role, role, mfaEnrolled } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(owner);
  mocks.findUnique.mockResolvedValue({ id: "cmf0target0000000000000001" });
  mocks.update.mockResolvedValue({});
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.create.mockResolvedValue({});
  mocks.regenerate.mockResolvedValue({ ok: true, recoveryCodes: [] });
  mocks.complete.mockResolvedValue({ ok: true, recoveryCodes: [] });
});

describe("access gate", () => {
  it("refuses anonymous, customers and the retired ADMIN role", async () => {
    for (const value of [null, session("CUSTOMER"), session("ADMIN")]) {
      mocks.auth.mockResolvedValue(value);
      await expect(requireStaff()).rejects.toThrow("forbidden");
      await expect(requirePermission("dashboard:view")).rejects.toThrow("forbidden");
    }
  });

  it("refuses staff without completed 2FA unless the caller allows enrolment", async () => {
    mocks.auth.mockResolvedValue(session("OWNER", false));
    await expect(requirePermission("dashboard:view")).rejects.toThrow("mfa_required");
    await expect(requireStaff({ allowUnenrolled: true })).resolves.toMatchObject({ role: "OWNER", mfaEnrolled: false });
  });

  it("applies the matrix", async () => {
    mocks.auth.mockResolvedValue(session("SUPPORT"));
    await expect(requirePermission("orders:refund")).resolves.toMatchObject({ role: "SUPPORT" });
    await expect(requirePermission("settings:manage")).rejects.toThrow("forbidden");
  });
});

describe("team actions", () => {
  it.each(["MANAGER", "SUPPORT", "FULFILLMENT"])("%s cannot manage staff", async (role) => {
    mocks.auth.mockResolvedValue(session(role));
    await expect(createStaffMemberAction({ name: "X", email: "x@nasmeh.si", role: "SUPPORT" })).rejects.toThrow("forbidden");
    await expect(changeStaffRoleAction({ userId: "cmf0target0000000000000001", role: "OWNER" })).rejects.toThrow("forbidden");
    await expect(revokeStaffSessionsAction({ userId: "cmf0target0000000000000001" })).rejects.toThrow("forbidden");
    await expect(resetStaffTotpAction({ userId: "cmf0target0000000000000001" })).rejects.toThrow("forbidden");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a new member with a one-time password and promotes an existing account", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    const created = await createStaffMemberAction({ name: "Nova", email: "Nova@Nasmeh.si", role: "FULFILLMENT" });
    expect(created).toMatchObject({ ok: true, created: true, role: "FULFILLMENT" });
    expect(created.ok && created.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ email: "nova@nasmeh.si", role: "FULFILLMENT" });
    expect(mocks.create.mock.calls[0][0].data.passwordHash).not.toContain(created.ok ? created.temporaryPassword : "");

    mocks.findUnique.mockResolvedValueOnce({ id: "cmf0existing00000000000001" });
    expect(await createStaffMemberAction({ name: "Stara", email: "stara@nasmeh.si", role: "SUPPORT" })).toEqual({ ok: true, created: false, role: "SUPPORT" });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ role: "SUPPORT", totpEnabledAt: null, totpSecret: null });
  });

  it("validates input and protects the owner from locking themselves out", async () => {
    expect(await createStaffMemberAction({ name: "", email: "bad", role: "SUPPORT" })).toEqual({ ok: false, error: "invalid" });
    expect(await createStaffMemberAction({ name: "Me", email: "owner@nasmeh.si", role: "SUPPORT" })).toEqual({ ok: false, error: "self" });
    expect(await changeStaffRoleAction({ userId: owner.user.id, role: "CUSTOMER" })).toEqual({ ok: false, error: "self" });
    expect(await resetStaffTotpAction({ userId: owner.user.id })).toEqual({ ok: false, error: "self" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("demotion clears the second factor and revokes sessions; reset revokes too", async () => {
    expect(await changeStaffRoleAction({ userId: "cmf0target0000000000000001", role: "CUSTOMER" })).toEqual({ ok: true });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ role: "CUSTOMER", sessionVersion: { increment: 1 }, totpSecret: null, totpEnabledAt: null });
    expect(await resetStaffTotpAction({ userId: "cmf0target0000000000000001" })).toEqual({ ok: true });
    expect(mocks.resetTotp).toHaveBeenCalledWith("cmf0target0000000000000001");
    expect(mocks.update.mock.calls[1][0].data).toEqual({ sessionVersion: { increment: 1 } });
    expect(await revokeStaffSessionsAction({ userId: "cmf0target0000000000000001" })).toEqual({ ok: true });
  });
});

describe("own account and enrolment actions", () => {
  it("refuse unenrolled staff except the enrolment completion itself", async () => {
    mocks.auth.mockResolvedValue(session("SUPPORT", false));
    await expect(regenerateRecoveryCodesAction({ code: "123456" })).rejects.toThrow("mfa_required");
    await expect(signOutEverywhereAction()).rejects.toThrow("mfa_required");
    expect(await completeEnrolmentAction({ code: "123456" })).toEqual({ ok: true, recoveryCodes: [] });
    expect(mocks.complete).toHaveBeenCalledWith(session("SUPPORT").user.id, "123456");
  });

  it("refuse customers and anonymous callers entirely", async () => {
    for (const value of [null, session("CUSTOMER")]) {
      mocks.auth.mockResolvedValue(value);
      await expect(completeEnrolmentAction({ code: "123456" })).rejects.toThrow("forbidden");
      await expect(regenerateRecoveryCodesAction({ code: "123456" })).rejects.toThrow("forbidden");
    }
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("sign out everywhere bumps the version before ending the session", async () => {
    await signOutEverywhereAction();
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: owner.user.id }, data: { sessionVersion: { increment: 1 } } });
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/prijava" });
  });
});
