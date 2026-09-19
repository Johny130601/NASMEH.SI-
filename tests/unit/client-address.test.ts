import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 finding A3: the per-client rate-limit key must not be client-chosen.
 * The proxy appends to `x-forwarded-for` and overwrites `x-real-ip`, so the
 * trusted value is `x-real-ip`, and the last forwarded element after it.
 */

const mocks = vi.hoisted(() => ({ requestHeaders: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.requestHeaders }));

import { clientAddress, requestClientAddress } from "@/lib/client-address";

const headers = (values: Record<string, string>) => new Headers(values);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("clientAddress", () => {
  it("prefers x-real-ip, which the proxy overwrites with the real remote address", () => {
    expect(clientAddress(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "9.9.9.9" }))).toBe("203.0.113.7");
    expect(clientAddress(headers({ "x-real-ip": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  it("takes the LAST forwarded element, so a spoofed chain cannot buy a fresh bucket", () => {
    const spoofed = "1.2.3.4, 5.6.7.8, 198.51.100.4";
    expect(clientAddress(headers({ "x-forwarded-for": spoofed }))).toBe("198.51.100.4");
    // Every request carrying a different forged prefix still lands in one bucket.
    expect(clientAddress(headers({ "x-forwarded-for": "9.9.9.9,198.51.100.4" })))
      .toBe(clientAddress(headers({ "x-forwarded-for": spoofed })));
  });

  it("uses a single forwarded element as it stands", () => {
    expect(clientAddress(headers({ "x-forwarded-for": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientAddress(headers({ "x-forwarded-for": " 198.51.100.4 " }))).toBe("198.51.100.4");
  });

  it("falls back to one fixed key when neither header is present or usable", () => {
    expect(clientAddress(headers({}))).toBe("unknown");
    expect(clientAddress(headers({ "x-forwarded-for": "   " }))).toBe("unknown");
    expect(clientAddress(headers({ "x-real-ip": "  ", "x-forwarded-for": "198.51.100.4" }))).toBe("198.51.100.4");
  });
});

describe("requestClientAddress", () => {
  it("reads the request's own headers", async () => {
    mocks.requestHeaders.mockResolvedValue(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "9.9.9.9" }));
    expect(await requestClientAddress()).toBe("203.0.113.7");
  });

  it("answers the fixed key outside a request scope, so a direct call is only limited harder", async () => {
    mocks.requestHeaders.mockRejectedValue(new Error("`headers` was called outside a request scope."));
    expect(await requestClientAddress()).toBe("unknown");
    mocks.requestHeaders.mockImplementation(() => { throw new Error("outside a request scope"); });
    expect(await requestClientAddress()).toBe("unknown");
  });
});
