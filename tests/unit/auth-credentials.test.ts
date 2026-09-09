import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), human: vi.fn(), compare: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.find } } }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.human }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
import { authorizeCredentials } from "@/lib/auth-credentials";

const input = { email: "  OWNER@Test.SI ", password: "StrongPassword!", turnstileToken: "human" };
const user = { id: "u", email: "owner@test.si", name: "Owner", passwordHash: "hash", role: "CUSTOMER", emailVerified: new Date(), sessionVersion: 2 };
beforeEach(() => { vi.resetAllMocks(); mocks.human.mockResolvedValue(true); mocks.compare.mockResolvedValue(true); mocks.find.mockResolvedValue(user); });
describe("credentials provider security boundary", () => {
  it("normalizes email and carries the authenticated session version", async () => {
    expect(await authorizeCredentials(input)).toEqual({ id: "u", email: user.email, name: "Owner", role: "CUSTOMER", sessionVersion: 2 });
    expect(mocks.find).toHaveBeenCalledWith({ where: { email: user.email } });
  });
  it("rejects failed challenges before any account lookup, including direct callbacks", async () => {
    mocks.human.mockResolvedValue(false);
    await expect(authorizeCredentials(input)).rejects.toMatchObject({ code: "bot_check" });
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("rejects missing challenges at the same boundary", async () => {
    mocks.human.mockResolvedValue(false);
    await expect(authorizeCredentials({ ...input, turnstileToken: undefined })).rejects.toMatchObject({ code: "bot_check" });
  });
  it("does not disclose an unverified account for a wrong password", async () => {
    mocks.find.mockResolvedValue({ ...user, emailVerified: null }); mocks.compare.mockResolvedValue(false);
    expect(await authorizeCredentials(input)).toBeNull();
  });
  it("shows verification guidance only after a correct password", async () => {
    mocks.find.mockResolvedValue({ ...user, emailVerified: null });
    await expect(authorizeCredentials(input)).rejects.toMatchObject({ code: "unverified" });
  });
  it.each(["x".repeat(73), "💚".repeat(19)])("rejects bcrypt-truncated passwords: %s", async password => {
    expect(await authorizeCredentials({ ...input, password })).toBeNull(); expect(mocks.human).not.toHaveBeenCalled();
  });
  it("rejects malformed input without throwing", async () => { expect(await authorizeCredentials(null)).toBeNull(); });
});
