import { afterEach, describe, expect, it } from "vitest";
import { __resetRateLimits, checkRateLimit } from "@/lib/rate-limit";

afterEach(() => __resetRateLimits());

describe("checkRateLimit (fixed-window, in-memory)", () => {
  it("allows up to the limit within a window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("k", 10, 60_000, now + i).allowed).toBe(true);
    }
    const blocked = checkRateLimit("k", 10, 60_000, now + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window passes", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) checkRateLimit("k", 10, 1_000, now);
    expect(checkRateLimit("k", 10, 1_000, now + 999).allowed).toBe(false);
    expect(checkRateLimit("k", 10, 1_000, now + 1001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) checkRateLimit("a", 10, 60_000, now);
    expect(checkRateLimit("a", 10, 60_000, now).allowed).toBe(false);
    expect(checkRateLimit("b", 10, 60_000, now).allowed).toBe(true);
  });
});
