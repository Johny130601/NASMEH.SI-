import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.queryRaw } }));

import { GET } from "@/app/api/health/route";

// Phase 9 step 3: the health endpoint the Docker HEALTHCHECK, the uptime checker and the runbook rely on.
describe("GET /api/health", () => {
  // Braces matter: a value returned from beforeEach is treated as a teardown callback, and
  // mockReset() returns the mock itself — Vitest would then CALL the mock after each test and
  // the rejecting implementation would throw outside the route's try/catch.
  beforeEach(() => { mocks.queryRaw.mockReset(); });

  it("answers 200 with db up and process metrics when Postgres round-trips", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", db: "up", node: process.version });
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.memory.rssMb).toBeGreaterThan(0);
    expect(body.memory.heapUsedMb).toBeGreaterThan(0);
  });

  it("answers 503 with db down when the round trip fails, keeping the metrics", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("connection refused"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ status: "error", db: "down" });
    expect(body.memory.rssMb).toBeGreaterThan(0);
  });
});
