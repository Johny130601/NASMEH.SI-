import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 9 step 5: the OWNER account of a fresh database comes from the host's .env, once. */

const mocks = vi.hoisted(() => ({ count: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { count: mocks.count, create: mocks.create } } }));

import { __resetEnvForTests } from "@/lib/env";
import { EXAMPLE_ADMIN_PASSWORD, ensureOwnerAccount } from "@/lib/bootstrap/owner";

const KEYS = ["DATABASE_URL", "AUTH_SECRET", "SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD", "NODE_ENV"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};
// NODE_ENV is typed read-only; the test switches it through a mutable view.
const env = process.env as unknown as Record<string, string | undefined>;

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const [key, value] of Object.entries(values)) env[key] = value;
  __resetEnvForTests();
}

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  setEnv({ DATABASE_URL: "postgresql://postgres:postgres@localhost:5543/test", AUTH_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef", NODE_ENV: "test" });
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
  __resetEnvForTests();
  vi.restoreAllMocks();
});

describe("ensureOwnerAccount", () => {
  it("leaves an existing OWNER alone", async () => {
    mocks.count.mockResolvedValue(1);
    expect(await ensureOwnerAccount()).toEqual({ created: false, reason: "exists" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates the OWNER from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD with a bcrypt hash and a verified address", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({});
    setEnv({ SEED_ADMIN_EMAIL: "Lastnik@Nasmeh.si", SEED_ADMIN_PASSWORD: "correct horse battery staple" });
    const now = new Date("2026-09-15T10:00:00.000Z");
    expect(await ensureOwnerAccount(now)).toEqual({ created: true });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: "lastnik@nasmeh.si", role: "OWNER", emailVerified: now });
    expect(data.passwordHash).not.toContain("correct horse");
    expect(await bcrypt.compare("correct horse battery staple", data.passwordHash)).toBe(true);
    expect(data.totpEnabledAt).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("[bootstrap] OWNER account created"));
    expect(String(vi.mocked(console.log).mock.calls[0][0])).not.toContain("@");
  });

  it("refuses the .env.example password in production and creates nothing", async () => {
    mocks.count.mockResolvedValue(0);
    setEnv({ NODE_ENV: "production", SEED_ADMIN_PASSWORD: EXAMPLE_ADMIN_PASSWORD });
    expect(await ensureOwnerAccount()).toEqual({ created: false, reason: "example-password" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("SEED_ADMIN_PASSWORD"));
  });

  it("accepts the example password outside production (dev and e2e databases are seeded with it)", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({});
    setEnv({ NODE_ENV: "test", SEED_ADMIN_PASSWORD: EXAMPLE_ADMIN_PASSWORD });
    expect(await ensureOwnerAccount()).toEqual({ created: true });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("never promotes another account that owns the address", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }));
    setEnv({ SEED_ADMIN_PASSWORD: "another strong password" });
    expect(await ensureOwnerAccount()).toEqual({ created: false, reason: "email-taken" });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("another account"));
  });

  it("reports a lost start race as an existing owner, not as a taken address", async () => {
    mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1); // the winner's row landed between the count and the create
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }));
    setEnv({ SEED_ADMIN_PASSWORD: "another strong password" });
    expect(await ensureOwnerAccount()).toEqual({ created: false, reason: "exists" });
    expect(console.error).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("concurrent start"));
  });

  it("treats a blanked SEED_ADMIN_PASSWORD as absent — the runbook's 'remove the password' step must not fail the env parse", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({});
    setEnv({ SEED_ADMIN_PASSWORD: "" });
    await expect(ensureOwnerAccount()).resolves.toEqual({ created: true });
  });

  it("propagates other database errors to the caller", async () => {
    mocks.count.mockRejectedValue(new Error("connection refused"));
    await expect(ensureOwnerAccount()).rejects.toThrow("connection refused");
  });
});
