import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kontakt's "imate račun? prijavite se" hint (§8.1) is an existence oracle by
 * nature; it is rate limited, and since QA 2026-10-03 (T2-10) it confirms a
 * shopper's account only — a staff address never reads as an account to the
 * public checkout.
 */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "10.20.30.40" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-test-secret-0123456789abcdef0123456789" }) }));

import { checkEmailExistsAction } from "@/app/(storefront)/actions/checkout";
import { __resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  __resetRateLimits();
  mocks.findUnique.mockReset();
});

describe("checkout account hint", () => {
  it("names a shopper's account", async () => {
    mocks.findUnique.mockResolvedValue({ role: "CUSTOMER" });
    expect(await checkEmailExistsAction({ email: " Kupec@Primer.si " })).toEqual({ exists: true });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { email: "kupec@primer.si" }, select: { role: true } });
  });

  it.each(["OWNER", "MANAGER", "SUPPORT", "FULFILLMENT"])("never confirms a %s address", async (role) => {
    mocks.findUnique.mockResolvedValue({ role });
    expect(await checkEmailExistsAction({ email: "admin@nasmeh.si" })).toEqual({ exists: false });
  });

  it("answers the same for an unknown address and past the rate limit", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await checkEmailExistsAction({ email: "nobody@primer.si" })).toEqual({ exists: false });
    mocks.findUnique.mockResolvedValue({ role: "CUSTOMER" });
    for (let call = 0; call < 9; call += 1) await checkEmailExistsAction({ email: "kupec@primer.si" });
    expect(await checkEmailExistsAction({ email: "kupec@primer.si" })).toEqual({ exists: false });
  });
});
