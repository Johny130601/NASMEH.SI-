import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA 2026-10-03 T4-01: the second-factor limit (5 per 5 minutes per member) is
 * meant for wrong guesses. It used to count every attempt, so a member who
 * signed in five times in five minutes had a valid sixth code refused as
 * "invalid", and regenerating recovery codes shared that budget.
 */

const state = vi.hoisted(() => ({
  master: "unit-test-master-secret-0123456789abcdef",
  user: null as null | {
    totpSecret: string; totpEnabledAt: Date; totpLastStep: number | null; totpRecoveryCodes: string[];
  },
}));
const MASTER = state.master;

vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: state.master }) }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(async () => state.user && { ...state.user }),
      updateMany: vi.fn(async ({ where, data }: { where: { totpLastStep?: number | null }; data: { totpLastStep?: number } }) => {
        if (!state.user) return { count: 0 };
        if ("totpLastStep" in where && where.totpLastStep !== state.user.totpLastStep) return { count: 0 };
        if (data.totpLastStep !== undefined) state.user.totpLastStep = data.totpLastStep;
        return { count: 1 };
      }),
      update: vi.fn(async () => ({})),
    },
  },
}));

import { regenerateRecoveryCodes, verifySecondFactor } from "@/lib/admin/mfa";
import { encryptSecret } from "@/lib/admin/secrets";
import { generateTotpSecret, totpCode } from "@/lib/admin/totp";
import { __resetRateLimits } from "@/lib/rate-limit";

const secret = generateTotpSecret();
const START = Date.UTC(2026, 9, 3, 12, 0, 0);
let now = START;

/** Moves the clock one TOTP step on and returns that step's code. */
function nextCode(): string {
  now += 30_000;
  vi.setSystemTime(now);
  return totpCode(secret, now);
}

beforeEach(() => {
  __resetRateLimits();
  vi.useFakeTimers();
  now = START;
  vi.setSystemTime(now);
  state.user = { totpSecret: encryptSecret(secret, MASTER), totpEnabledAt: new Date(START), totpLastStep: null, totpRecoveryCodes: [] };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the second-factor limit counts wrong codes only", () => {
  it("lets a member sign in more than five times in five minutes", async () => {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      expect(await verifySecondFactor("staff", nextCode()), `sign-in ${attempt}`).toEqual({ ok: true, method: "totp" });
    }
  });

  it("still stops guessing after five wrong codes, and says so", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(await verifySecondFactor("staff", "000000")).toEqual({ ok: false, reason: "invalid" });
    }
    // a valid code inside the same window is refused as rate-limited, not as one more wrong code
    expect(await verifySecondFactor("staff", nextCode())).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("a success forgives the wrong codes before it", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) await verifySecondFactor("staff", "000000");
    expect(await verifySecondFactor("staff", nextCode())).toEqual({ ok: true, method: "totp" });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await verifySecondFactor("staff", "000000")).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await verifySecondFactor("staff", nextCode())).toEqual({ ok: true, method: "totp" });
  });
});

describe("recovery-code regeneration shares the rule and names the reason", () => {
  it("works after several sign-ins", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) await verifySecondFactor("staff", nextCode());
    const result = await regenerateRecoveryCodes("staff", nextCode());
    expect(result.ok).toBe(true);
  });

  it("answers rate_limited once the wrong codes ran out, invalid before", async () => {
    expect(await regenerateRecoveryCodes("staff", "000000")).toEqual({ ok: false, reason: "invalid" });
    for (let attempt = 1; attempt <= 4; attempt += 1) await verifySecondFactor("staff", "000000");
    expect(await regenerateRecoveryCodes("staff", nextCode())).toEqual({ ok: false, reason: "rate_limited" });
  });
});
