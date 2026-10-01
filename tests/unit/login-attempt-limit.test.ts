import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 step 1 / QA T3-F3: FAILED password attempts are bounded per address
 * from one client, per address overall and per client, before the challenge
 * and the hash compare; a correct password is never counted. /koda probing is
 * bounded per client.
 */

const mocks = vi.hoisted(() => ({ find: vi.fn(), human: vi.fn(), compare: vi.fn(), apply: vi.fn(), redirect: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.find } } }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.human }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/koda", () => ({ applyKodaCode: mocks.apply }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/client-address", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-address")>()),
  requestClientAddress: mocks.client,
}));

import { __resetLoginFailures, authorizeCredentials, LOGIN_ATTEMPT_LIMIT } from "@/lib/auth-credentials";
import { GET as kodaRoute } from "@/app/(storefront)/koda/[code]/route";
import { __resetRateLimits } from "@/lib/rate-limit";

const attempt = (email: string, password = "wrong-password") => authorizeCredentials({ email, password, turnstileToken: "token" });
const from = (client: string) => mocks.client.mockResolvedValue(client);

beforeEach(() => {
  vi.resetAllMocks();
  __resetRateLimits();
  __resetLoginFailures();
  from("198.51.100.1");
  mocks.human.mockResolvedValue(true);
  mocks.find.mockResolvedValue({ id: "u1", email: "kupec@test.si", passwordHash: "$2a$10$hash", emailVerified: new Date(), role: "CUSTOMER", totpEnabledAt: null, sessionVersion: 1 });
  mocks.compare.mockResolvedValue(false);
  mocks.apply.mockResolvedValue({ ok: true });
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT ${url}`); });
});

describe("login attempt limit", () => {
  it("refuses the address from that client after its failure limit with the rate_limited code, before the challenge and the hash compare", async () => {
    const limit = LOGIN_ATTEMPT_LIMIT.perAddressFromClient;
    for (let index = 0; index < limit; index += 1) expect(await attempt("kupec@test.si")).toBeNull();
    expect(mocks.compare).toHaveBeenCalledTimes(limit);
    await expect(attempt("kupec@test.si")).rejects.toMatchObject({ code: "rate_limited" });
    expect(mocks.human).toHaveBeenCalledTimes(limit);
    expect(mocks.compare).toHaveBeenCalledTimes(limit);
    expect(await attempt("drug@test.si")).toBeNull(); // another address on the same client is still served
  });

  it("never counts a correct password: eleven sign-ins in a row all succeed", async () => {
    mocks.compare.mockResolvedValue(true);
    for (let index = 0; index <= LOGIN_ATTEMPT_LIMIT.perAddressFromClient; index += 1) {
      expect(await attempt("kupec@test.si", "right-password")).toMatchObject({ id: "u1" });
    }
  });

  it("one client's wrong guesses do not lock the owner out on their own client", async () => {
    from("203.0.113.66");
    for (let index = 0; index < LOGIN_ATTEMPT_LIMIT.perAddressFromClient; index += 1) expect(await attempt("kupec@test.si")).toBeNull();
    await expect(attempt("kupec@test.si")).rejects.toMatchObject({ code: "rate_limited" });
    from("198.51.100.7");
    mocks.compare.mockResolvedValue(true);
    expect(await attempt("kupec@test.si", "right-password")).toMatchObject({ id: "u1" });
  });

  it("a correct password clears that client's own failures for the address", async () => {
    for (let index = 0; index < LOGIN_ATTEMPT_LIMIT.perAddressFromClient - 1; index += 1) expect(await attempt("kupec@test.si")).toBeNull();
    mocks.compare.mockResolvedValueOnce(true);
    expect(await attempt("kupec@test.si", "right-password")).toMatchObject({ id: "u1" });
    for (let index = 0; index < LOGIN_ATTEMPT_LIMIT.perAddressFromClient; index += 1) expect(await attempt("kupec@test.si")).toBeNull();
    await expect(attempt("kupec@test.si")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("bounds a distributed guess at one address across clients", async () => {
    const clients = Math.ceil(LOGIN_ATTEMPT_LIMIT.perAddress / LOGIN_ATTEMPT_LIMIT.perAddressFromClient);
    let failures = 0;
    for (let client = 0; client < clients && failures < LOGIN_ATTEMPT_LIMIT.perAddress; client += 1) {
      from(`192.0.2.${client + 1}`);
      for (let index = 0; index < LOGIN_ATTEMPT_LIMIT.perAddressFromClient && failures < LOGIN_ATTEMPT_LIMIT.perAddress; index += 1) {
        expect(await attempt("kupec@test.si")).toBeNull();
        failures += 1;
      }
    }
    from("192.0.2.250");
    await expect(attempt("kupec@test.si")).rejects.toMatchObject({ code: "rate_limited" });
    expect(await attempt("drug@test.si")).toBeNull();
  });

  it("bounds guesses fired in parallel: each reserves its failure before the challenge answers", async () => {
    const limit = LOGIN_ATTEMPT_LIMIT.perAddressFromClient;
    mocks.human.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 20)));
    const outcomes = await Promise.allSettled(Array.from({ length: limit + 5 }, () => attempt("kupec@test.si")));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(limit);
    expect(outcomes.filter((outcome) => outcome.status === "rejected" && (outcome.reason as { code?: string }).code === "rate_limited")).toHaveLength(5);
    expect(mocks.find).toHaveBeenCalledTimes(limit);
    expect(mocks.compare).toHaveBeenCalledTimes(limit);
  });

  it("gives the reservation back for parallel correct sign-ins, so they never lock anyone out", async () => {
    mocks.compare.mockResolvedValue(true);
    mocks.human.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 5)));
    const limit = LOGIN_ATTEMPT_LIMIT.perAddressFromClient;
    // More rounds than the per-address bound holds, so a reservation that is never given back would lock the address.
    const rounds = Math.ceil(LOGIN_ATTEMPT_LIMIT.perAddress / limit) + 1;
    for (let round = 0; round < rounds; round += 1) {
      const outcomes = await Promise.all(Array.from({ length: limit }, () => attempt("kupec@test.si", "right-password")));
      expect(outcomes.every((user) => user?.id === "u1")).toBe(true);
    }
  });

  it("a failed challenge counts against the client only, never the address", async () => {
    mocks.human.mockResolvedValue(false);
    for (let index = 0; index <= LOGIN_ATTEMPT_LIMIT.perAddressFromClient; index += 1) {
      await expect(attempt("kupec@test.si")).rejects.toMatchObject({ code: "bot_check" });
    }
    expect(mocks.find).not.toHaveBeenCalled();
    mocks.human.mockResolvedValue(true);
    mocks.compare.mockResolvedValue(true);
    expect(await attempt("kupec@test.si", "right-password")).toMatchObject({ id: "u1" });
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
