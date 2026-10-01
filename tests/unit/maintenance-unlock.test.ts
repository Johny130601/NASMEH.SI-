import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 9 step 1 (backlog B15): the maintenance password is a bcrypt hash and guesses are bounded per client. */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), set: vi.fn(), headerGet: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { setting: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "test-secret-at-least-32-chars-long!!" }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set }),
  headers: async () => ({ get: mocks.headerGet }),
}));

import { unlockMaintenanceAction } from "@/app/(storefront)/actions/maintenance";
import { __resetRateLimits } from "@/lib/rate-limit";
import { isValidMaintenanceCookie } from "@/lib/maintenance";

const hash = bcrypt.hashSync("pravilno-geslo", 4);

beforeEach(() => {
  vi.resetAllMocks();
  __resetRateLimits();
  mocks.headerGet.mockReturnValue("203.0.113.7");
  mocks.findUnique.mockResolvedValue({ key: "maintenance", value: { enabled: true, passwordHash: hash, message: "Kmalu" } });
});

describe("unlockMaintenanceAction", () => {
  it("compares against the stored hash and sets the HMAC unlock cookie only on a match", async () => {
    expect(await unlockMaintenanceAction({ password: "napacno" })).toEqual({ ok: false, message: "Napačno geslo." });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(await unlockMaintenanceAction({ password: "pravilno-geslo" })).toEqual({ ok: true });
    expect(mocks.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = mocks.set.mock.calls[0];
    expect(name).toBe("nasmeh_maintenance");
    expect(isValidMaintenanceCookie(value, "test-secret-at-least-32-chars-long!!", hash)).toBe(true);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("never unlocks a row without a hash (legacy plain password) and passes through while the gate is off", async () => {
    mocks.findUnique.mockResolvedValue({ key: "maintenance", value: { enabled: true, password: "plain-legacy" } });
    expect(await unlockMaintenanceAction({ password: "plain-legacy" })).toEqual({ ok: false, message: "Napačno geslo." });
    mocks.findUnique.mockResolvedValue({ key: "maintenance", value: { enabled: false } });
    expect(await unlockMaintenanceAction({ password: "" })).toEqual({ ok: true });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("refuses over-long input and bounds guesses per client", async () => {
    expect(await unlockMaintenanceAction({ password: "x".repeat(81) })).toEqual({ ok: false, message: "Napačno geslo." });
    for (let index = 0; index < 10; index += 1) await unlockMaintenanceAction({ password: "napacno" });
    expect(await unlockMaintenanceAction({ password: "pravilno-geslo" })).toEqual({ ok: false, message: "Napačno geslo." }); // 11th attempt in the window
    mocks.headerGet.mockReturnValue("198.51.100.2");
    expect(await unlockMaintenanceAction({ password: "pravilno-geslo" })).toEqual({ ok: true });
  });
});
