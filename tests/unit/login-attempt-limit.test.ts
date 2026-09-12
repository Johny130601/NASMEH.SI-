import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 9 step 1: password attempts are bounded per address and per client before the challenge and the hash compare; /koda probing is bounded per client. */

const mocks = vi.hoisted(() => ({ find: vi.fn(), human: vi.fn(), compare: vi.fn(), apply: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.find } } }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.human }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/koda", () => ({ applyKodaCode: mocks.apply }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { authorizeCredentials, LOGIN_ATTEMPT_LIMIT } from "@/lib/auth-credentials";
import { GET as kodaRoute } from "@/app/(storefront)/koda/[code]/route";
import { __resetRateLimits } from "@/lib/rate-limit";

const attempt = (email: string) => authorizeCredentials({ email, password: "wrong-password", turnstileToken: "token" });

beforeEach(() => {
  vi.resetAllMocks();
  __resetRateLimits();
  mocks.human.mockResolvedValue(true);
  mocks.find.mockResolvedValue({ id: "u1", email: "kupec@test.si", passwordHash: "$2a$10$hash", emailVerified: new Date(), role: "CUSTOMER", totpEnabledAt: null, sessionVersion: 1 });
  mocks.compare.mockResolvedValue(false);
  mocks.apply.mockResolvedValue({ ok: true });
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT ${url}`); });
});

describe("login attempt limit", () => {
  it("refuses the address after the per-e-mail limit with the rate_limited code, before the challenge and the hash compare", async () => {
    for (let index = 0; index < LOGIN_ATTEMPT_LIMIT.perEmail; index += 1) expect(await attempt("kupec@test.si")).toBeNull();
    expect(mocks.compare).toHaveBeenCalledTimes(LOGIN_ATTEMPT_LIMIT.perEmail);
    await expect(attempt("kupec@test.si")).rejects.toMatchObject({ code: "rate_limited" });
    expect(mocks.human).toHaveBeenCalledTimes(LOGIN_ATTEMPT_LIMIT.perEmail);
    expect(mocks.compare).toHaveBeenCalledTimes(LOGIN_ATTEMPT_LIMIT.perEmail);
    expect(await attempt("drug@test.si")).toBeNull(); // another address on the same client is still served
  });

  it("refuses the client after the per-client limit across addresses", async () => {
    for (let index = 0; index < LOGIN_ATTEMPT_LIMIT.perClient; index += 1) expect(await attempt(`k${index}@test.si`)).toBeNull();
    await expect(attempt("nov@test.si")).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("/koda/[code] probing limit", () => {
  const get = (code: string, ip = "203.0.113.9") => kodaRoute(new Request(`https://nasmeh.example/koda/${code}`, { headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ code }) });

  it("redirects normally, then answers 429 with Retry-After once a client exceeds 30 lookups in ten minutes", async () => {
    for (let index = 0; index < 30; index += 1) await expect(get(`KODA${index}`)).rejects.toThrow("REDIRECT /cart");
    expect(mocks.apply).toHaveBeenCalledTimes(30);
    const blocked = await get("KODA31");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mocks.apply).toHaveBeenCalledTimes(30);
    await expect(get("KODA1", "198.51.100.4")).rejects.toThrow("REDIRECT /cart");
  });
});
