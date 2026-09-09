import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "@/lib/turnstile";

type EnvKey = "NODE_ENV" | "TURNSTILE_TEST_TOKEN" | "TURNSTILE_SECRET_KEY" | "NASMEH_E2E";

function setEnv(values: Partial<Record<EnvKey, string | undefined>>) {
  // The e2e harness flag also enables the bypass; never inherit it from the
  // shell running the unit suite.
  vi.stubEnv("NASMEH_E2E", undefined);
  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verifyTurnstile", () => {
  it("test bypass: NODE_ENV=test + matching TURNSTILE_TEST_TOKEN verifies", async () => {
    setEnv({ NODE_ENV: "test", TURNSTILE_TEST_TOKEN: "e2e-token", TURNSTILE_SECRET_KEY: undefined });
    await expect(verifyTurnstile("e2e-token")).resolves.toBe(true);
  });

  it("test bypass does NOT fire outside NODE_ENV=test", async () => {
    setEnv({ NODE_ENV: "production", TURNSTILE_TEST_TOKEN: "e2e-token", TURNSTILE_SECRET_KEY: undefined });
    await expect(verifyTurnstile("e2e-token")).resolves.toBe(false);
  });

  it("wrong token in test env falls through (and fails closed with no secret in prod)", async () => {
    setEnv({ NODE_ENV: "test", TURNSTILE_TEST_TOKEN: "e2e-token", TURNSTILE_SECRET_KEY: undefined });
    await expect(verifyTurnstile("wrong")).resolves.toBe(true); // test env is not production → dev-open
  });

  it("fails CLOSED in production when no secret key is configured", async () => {
    setEnv({ NODE_ENV: "production", TURNSTILE_TEST_TOKEN: undefined, TURNSTILE_SECRET_KEY: undefined });
    await expect(verifyTurnstile("anything")).resolves.toBe(false);
  });

  it("allows in development without keys (documented convenience)", async () => {
    setEnv({ NODE_ENV: "development", TURNSTILE_TEST_TOKEN: undefined, TURNSTILE_SECRET_KEY: undefined });
    await expect(verifyTurnstile("")).resolves.toBe(true);
  });

  it("rejects empty token when a secret is configured", async () => {
    setEnv({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" });
    await expect(verifyTurnstile(null)).resolves.toBe(false);
  });

  it("verifies against siteverify and maps success:true → true", async () => {
    setEnv({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstile("real-token", "1.2.3.4")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(url).toContain("siteverify");
    expect(init.body.get("secret")).toBe("secret");
    expect(init.body.get("response")).toBe("real-token");
    expect(init.body.get("remoteip")).toBe("1.2.3.4");
  });

  it("maps success:false → false and network errors → false", async () => {
    setEnv({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, "error-codes": ["invalid-input-response"] }),
    }));
    await expect(verifyTurnstile("bad")).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(verifyTurnstile("bad")).resolves.toBe(false);
  });

  it("rejects oversized tokens before contacting the provider", async () => {
    setEnv({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyTurnstile("x".repeat(2049))).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, { success: "true" }, {}])("rejects malformed verification responses: %j", async (response) => {
    setEnv({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
    await expect(verifyTurnstile("real-token")).resolves.toBe(false);
  });
});
