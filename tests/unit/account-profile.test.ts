import { beforeEach, describe, expect, it, vi } from "vitest";

/** QA T3-A1: /racun/podatki changes the name and the password; the address-book phone follows lib/phone.ts. */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), signOut: vi.fn(), update: vi.fn(), findUnique: vi.fn(), compare: vi.fn(), hash: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth, signOut: mocks.signOut }));
vi.mock("@/lib/db", () => ({ db: { user: { update: mocks.update, findUnique: mocks.findUnique }, $transaction: mocks.transaction } }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare, hash: mocks.hash } }));

import { changePasswordAction, updateNameAction } from "@/app/(storefront)/actions/profile";
import { saveAddressAction } from "@/app/(storefront)/actions/address";
import { __resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  vi.resetAllMocks();
  __resetRateLimits();
  mocks.auth.mockResolvedValue({ user: { id: "owner", role: "CUSTOMER" } });
  mocks.findUnique.mockResolvedValue({ passwordHash: "$2b$10$current" });
  mocks.compare.mockResolvedValue(true);
  mocks.hash.mockResolvedValue("$2b$10$new");
  mocks.update.mockResolvedValue({});
  mocks.signOut.mockResolvedValue(undefined);
});

describe("name", () => {
  it("stores the trimmed first and last name on the signed-in account only", async () => {
    expect(await updateNameAction({ firstName: " Živa ", lastName: " Ščuk ", userId: "victim" })).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "owner" }, data: { name: "Živa Ščuk" } });
  });

  it.each([{ firstName: "  ", lastName: "Ščuk" }, { firstName: "Živa", lastName: "x".repeat(61) }, {}])("refuses %j", async (input) => {
    expect(await updateNameAction(input)).toEqual({ ok: false, error: "invalid_name" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await updateNameAction({ firstName: "Živa", lastName: "Ščuk" })).toEqual({ ok: false });
    expect(await changePasswordAction({ currentPassword: "a", newPassword: "NovoGeslo123" })).toEqual({ ok: false });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("password", () => {
  it("needs the current password, then revokes every session like the reset flow", async () => {
    expect(await changePasswordAction({ currentPassword: "Staro123!", newPassword: "NovoGeslo123" })).toEqual({ ok: true });
    expect(mocks.compare).toHaveBeenCalledWith("Staro123!", "$2b$10$current");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "owner" }, data: { passwordHash: "$2b$10$new", sessionVersion: { increment: 1 } } });
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
  });

  it("refuses a wrong current password without writing", async () => {
    mocks.compare.mockResolvedValue(false);
    expect(await changePasswordAction({ currentPassword: "Napacno1!", newPassword: "NovoGeslo123" })).toEqual({ ok: false, error: "wrong_password" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("refuses a short, over-long or unchanged new password", async () => {
    expect(await changePasswordAction({ currentPassword: "Staro123!", newPassword: "kratko" })).toEqual({ ok: false, error: "weak_password" });
    expect(await changePasswordAction({ currentPassword: "Staro123!", newPassword: "💚".repeat(19) })).toEqual({ ok: false, error: "weak_password" });
    expect(await changePasswordAction({ currentPassword: "Staro123!", newPassword: "Staro123!" })).toEqual({ ok: false, error: "same_password" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("bounds current-password guesses per account", async () => {
    mocks.compare.mockResolvedValue(false);
    for (let index = 0; index < 10; index += 1) {
      expect((await changePasswordAction({ currentPassword: `x${index}`, newPassword: "NovoGeslo123" })).error).toBe("wrong_password");
    }
    expect(await changePasswordAction({ currentPassword: "Staro123!", newPassword: "NovoGeslo123" })).toEqual({ ok: false, error: "rate_limited" });
    expect(mocks.compare).toHaveBeenCalledTimes(10);
  });
});

describe("address-book phone", () => {
  const address = { label: "Dom", fullName: "Živa Ščuk", line1: "Čopova ulica 12", line2: "", postalCode: "1000", city: "Ljubljana", country: "SI" };

  it.each(["abc-not-a-phone", "12345", "------"])("refuses %j before any write", async (phone) => {
    expect(await saveAddressAction({ ...address, phone })).toEqual({ ok: false, error: "invalid_phone" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("lets a valid or empty phone through to the address book", async () => {
    mocks.transaction.mockResolvedValue({ ok: true });
    expect(await saveAddressAction({ ...address, phone: "+386 40 123 456" })).toEqual({ ok: true });
    expect(await saveAddressAction({ ...address, phone: "" })).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("refuses the Slovenian postal code 0999 (1000–9999 only)", async () => {
    expect(await saveAddressAction({ ...address, phone: "", postalCode: "0999" })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
