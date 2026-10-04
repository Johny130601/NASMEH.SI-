import { beforeEach, describe, expect, it, vi } from "vitest";
import { addressSchema, deleteAddressForUser, saveAddressForUser, setDefaultAddressForUser } from "@/lib/account/addresses";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction, updateMarketingPreferenceAction } from "@/app/(storefront)/actions/address";
import { marketingVersion } from "@/lib/consent-log";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), transaction: vi.fn(), lock: vi.fn(),
  address: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  user: { findUniqueOrThrow: vi.fn(), update: vi.fn() }, consentLog: { create: vi.fn() },
  subscriber: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
const input = { label: "Dom", fullName: "Živa Ščuk", line1: "Čopova ulica 12", line2: "", postalCode: "1000", city: "Ljubljana", country: "SI", phone: "" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner", role: "CUSTOMER" } });
  mocks.lock.mockResolvedValue([{ id: "owner" }]);
  mocks.transaction.mockImplementation(async operation => operation({ $queryRaw: mocks.lock, address: mocks.address, user: mocks.user, consentLog: mocks.consentLog, subscriber: mocks.subscriber }));
  mocks.address.findFirst.mockResolvedValue(null);
  mocks.user.findUniqueOrThrow.mockResolvedValue({ marketingOptIn: false, email: "owner@test.si" });
  mocks.subscriber.findUnique.mockResolvedValue(null);
  mocks.subscriber.updateMany.mockResolvedValue({ count: 1 });
});

describe("address book authorization and invariants", () => {
  it.each([["SI", "1000"], ["DE", "10115"], ["HR", "10000"], ["NL", "1012 AB"], ["PL", "00-001"]])("validates the %s address postcode", (country, postalCode) => {
    expect(addressSchema.safeParse({ ...input, country, postalCode }).success).toBe(true);
  });
  it.each([["SI", "10000"], ["DE", "1000"], ["NL", "1000"], ["US", "10001"]])("rejects unsupported address %s/%s", (country, postalCode) => {
    expect(addressSchema.safeParse({ ...input, country, postalCode }).success).toBe(false);
  });
  it("requires the house number the checkout needs, as the checkout reads a saved address (QA 2026-10-03 T3-03)", async () => {
    expect(addressSchema.safeParse({ ...input, line1: "Slovenska cesta" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...input, line1: "Grajska ulica b. š." }).success).toBe(true);
    // the supplement follows after a comma, as the checkout joins it
    expect(addressSchema.safeParse({ ...input, line1: "Dunajska cesta 20", line2: "2. nadstropje" }).success).toBe(true);
    expect(addressSchema.safeParse({ ...input, line1: "Dunajska cesta", line2: "2. nadstropje" }).success).toBe(false);
    expect(await saveAddressForUser("owner", { ...input, line1: "Slovenska cesta" })).toEqual({ ok: false, error: "invalid_line1" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects unvalidated IDs and malformed addresses before opening a transaction", async () => {
    expect(await deleteAddressForUser("owner", { id: {} })).toEqual({ ok: false, error: "invalid" });
    expect(await setDefaultAddressForUser("owner", { id: "" })).toEqual({ ok: false, error: "invalid" });
    expect(await saveAddressForUser("owner", { ...input, postalCode: "bad" })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("makes the first address default and ignores a supplied owner ID", async () => {
    expect(await saveAddressForUser("owner", { ...input, userId: "victim" })).toEqual({ ok: true });
    expect(mocks.address.create).toHaveBeenCalledWith({ data: { ...input, label: "Dom", phone: null, line2: null, isDefault: true, userId: "owner" } });
    const query = mocks.lock.mock.calls[0][0];
    expect(query.values).toEqual(["owner"]);
    expect(query.sql).toContain('FROM "User"');
    expect(query.sql).toContain("FOR UPDATE");
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.address.findFirst.mock.invocationCallOrder[0]);
  });
  it("keeps an existing default when adding an ordinary second address", async () => {
    mocks.address.findFirst.mockResolvedValue({ id: "default", isDefault: true });
    await saveAddressForUser("owner", input);
    expect(mocks.address.updateMany).not.toHaveBeenCalled();
    expect(mocks.address.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isDefault: false }) });
  });
  it.each(["save", "default", "delete"])("%s on a foreign or missing ID cannot clear the caller's default", async operation => {
    const result = operation === "save" ? await saveAddressForUser("owner", { ...input, id: "foreign", isDefault: true })
      : operation === "default" ? await setDefaultAddressForUser("owner", { id: "foreign" })
        : await deleteAddressForUser("owner", { id: "foreign" });
    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(mocks.address.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", userId: "owner" } });
    for (const operation of [mocks.address.updateMany, mocks.address.update, mocks.address.create, mocks.address.delete]) expect(operation).not.toHaveBeenCalled();
  });
  it("preserves the default when editing that address with an unchecked default field", async () => {
    mocks.address.findFirst.mockResolvedValue({ id: "mine", isDefault: true });
    await saveAddressForUser("owner", { ...input, id: "mine", isDefault: false });
    expect(mocks.address.update).toHaveBeenCalledWith({ where: { id: "mine" }, data: expect.objectContaining({ isDefault: true }) });
  });
  it("switches default only after ownership is established under the parent lock", async () => {
    mocks.address.findFirst.mockResolvedValue({ id: "mine", isDefault: false });
    await setDefaultAddressForUser("owner", { id: "mine" });
    expect(mocks.address.updateMany).toHaveBeenCalledWith({ where: { userId: "owner", isDefault: true }, data: { isDefault: false } });
    expect(mocks.address.update).toHaveBeenCalledWith({ where: { id: "mine" }, data: { isDefault: true } });
  });
  it("promotes the oldest remaining address when deleting the default", async () => {
    mocks.address.findFirst.mockResolvedValueOnce({ id: "old", isDefault: true }).mockResolvedValueOnce({ id: "next" });
    await deleteAddressForUser("owner", { id: "old" });
    expect(mocks.address.delete).toHaveBeenCalledWith({ where: { id: "old" } });
    expect(mocks.address.update).toHaveBeenCalledWith({ where: { id: "next" }, data: { isDefault: true } });
  });
  it("refuses writes for a deleted user before inspecting any addresses", async () => {
    mocks.lock.mockResolvedValue([]);
    expect(await saveAddressForUser("owner", input)).toEqual({ ok: false, error: "not_found" });
    expect(mocks.address.findFirst).not.toHaveBeenCalled();
  });
});

describe("account action boundaries and marketing history", () => {
  it("requires a session for every mutation", async () => {
    mocks.auth.mockResolvedValue(null);
    for (const operation of [saveAddressAction, deleteAddressAction, setDefaultAddressAction, updateMarketingPreferenceAction]) {
      expect(await operation({ ...input, id: "mine", marketingOptIn: true })).toEqual({ ok: false });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([undefined, null, {}, { marketingOptIn: "false" }, { marketingOptIn: 1 }])("requires an explicit boolean preference: %s", async invalid => {
    expect(await updateMarketingPreferenceAction(invalid)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("commits the opted-in preference and its prior state in one transaction", async () => {
    expect(await updateMarketingPreferenceAction({ marketingOptIn: true, userId: "victim" })).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.user.update).toHaveBeenCalledWith({ where: { id: "owner" }, data: { marketingOptIn: true } });
    expect(mocks.consentLog.create).toHaveBeenCalledWith({ data: {
      userId: "owner", kind: "marketing-preference", version: marketingVersion("marketing-preference"),
      choices: { marketing: true, previous: false, source: "account" }, visitorId: null,
    } });
    // Opting in never confirms or touches a newsletter subscription.
    expect(mocks.subscriber.findUnique).not.toHaveBeenCalled();
    expect(mocks.subscriber.updateMany).not.toHaveBeenCalled();
  });
  it("records withdrawal and does not duplicate history for unchanged preferences", async () => {
    mocks.user.findUniqueOrThrow.mockResolvedValueOnce({ marketingOptIn: true, email: "owner@test.si" }).mockResolvedValueOnce({ marketingOptIn: false, email: "owner@test.si" });
    await updateMarketingPreferenceAction({ marketingOptIn: false });
    expect(mocks.consentLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ choices: { marketing: false, previous: true, source: "account" } }) });
    await updateMarketingPreferenceAction({ marketingOptIn: false });
    expect(mocks.consentLog.create).toHaveBeenCalledTimes(1);
  });
  it("switching e-novice off also withdraws the address's newsletter subscription, logged once with its subject", async () => {
    mocks.user.findUniqueOrThrow.mockResolvedValue({ marketingOptIn: true, email: "Owner@Test.si" });
    mocks.subscriber.findUnique.mockResolvedValue({ id: "sub_1", status: "CONFIRMED", source: "footer" });
    expect(await updateMarketingPreferenceAction({ marketingOptIn: false })).toEqual({ ok: true });
    expect(mocks.subscriber.findUnique).toHaveBeenCalledWith({ where: { email: "owner@test.si" }, select: { id: true, status: true, source: true } });
    expect(mocks.subscriber.updateMany).toHaveBeenCalledWith({
      where: { id: "sub_1", status: { in: ["PENDING", "CONFIRMED"] } }, data: { status: "UNSUBSCRIBED" },
    });
    expect(mocks.consentLog.create).toHaveBeenCalledWith({ data: {
      userId: "owner", kind: "marketing-email", version: marketingVersion("marketing-email"), visitorId: null,
      choices: { marketing: false, withdrawn: true, previousStatus: "CONFIRMED", source: "account-preference", subscriberId: "sub_1" },
    } });
    expect(mocks.consentLog.create).toHaveBeenCalledTimes(2);
  });
  it("withdraws a footer subscription even when the account preference was already off, without a duplicate row", async () => {
    mocks.subscriber.findUnique.mockResolvedValue({ id: "sub_2", status: "CONFIRMED", source: "welcome-popup" });
    expect(await updateMarketingPreferenceAction({ marketingOptIn: false })).toEqual({ ok: true });
    expect(mocks.user.update).not.toHaveBeenCalled();
    expect(mocks.consentLog.create).toHaveBeenCalledTimes(1);
    expect(mocks.consentLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "marketing-email" }) });
    mocks.subscriber.updateMany.mockResolvedValue({ count: 0 });
    await updateMarketingPreferenceAction({ marketingOptIn: false });
    expect(mocks.consentLog.create).toHaveBeenCalledTimes(1);
  });
  it("reports a transaction failure instead of a false success", async () => {
    mocks.transaction.mockRejectedValue(new Error("DB unavailable"));
    expect(await updateMarketingPreferenceAction({ marketingOptIn: true })).toEqual({ ok: false, error: "failed" });
    expect(await saveAddressAction(input)).toEqual({ ok: false, error: "failed" });
  });
});
