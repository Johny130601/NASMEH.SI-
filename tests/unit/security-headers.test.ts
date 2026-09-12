import { beforeEach, describe, expect, it, vi } from "vitest";
import { applySecurityHeaders, buildCsp, cspHeaderName, generateNonce, STATIC_SECURITY_HEADERS } from "@/lib/security/headers";
import { __resetRateLimits } from "@/lib/rate-limit";
import { POST as cspReport } from "@/app/api/csp-report/route";

/** Phase 9 step 1: security headers, the nonce-based CSP and its report sink. */

beforeEach(() => { __resetRateLimits(); vi.restoreAllMocks(); });

describe("security headers", () => {
  it("mints a fresh base64 nonce per call", () => {
    const first = generateNonce();
    expect(first).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(first).not.toBe(generateNonce());
  });

  it("builds a nonce-based strict-dynamic policy with the payment, consent and challenge hosts and a report sink", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("report-uri /api/csp-report");
    for (const host of ["https://js.stripe.com", "https://www.paypal.com", "https://www.googletagmanager.com", "https://challenges.cloudflare.com"]) expect(csp).toContain(host);
    const dev = buildCsp("abc123", true);
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
  });

  it("names the header by mode and applies every static header", () => {
    expect(cspHeaderName(false)).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(true)).toBe("Content-Security-Policy");
    const headers = new Headers();
    applySecurityHeaders(headers, "default-src 'self'", true);
    expect(headers.get("Content-Security-Policy")).toBe("default-src 'self'");
    expect(headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    for (const { key, value } of STATIC_SECURITY_HEADERS) expect(headers.get(key)).toBe(value);
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("CSP report sink", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    cspReport(new Request("https://nasmeh.example/api/csp-report", { method: "POST", body, headers: { "content-type": "application/csp-report", "x-forwarded-for": "203.0.113.5", ...headers } }));

  it("logs one compact line per report for both wire formats and never echoes the body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const legacy = await post(JSON.stringify({ "csp-report": { "document-uri": "https://nasmeh.si/", "effective-directive": "script-src", "blocked-uri": "https://evil.example/x.js", "source-file": "https://nasmeh.si/", "line-number": 7, disposition: "report" } }));
    expect(legacy.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe("[csp] report script-src blocked=https://evil.example/x.js page=https://nasmeh.si/ source=https://nasmeh.si/:7");
    const modern = await post(JSON.stringify([{ type: "csp-violation", body: { "effective-directive": "img-src", "blocked-uri": "data" } }, { body: {} }]));
    expect(modern.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(await legacy.text()).toBe("");
  });

  it("rejects malformed, oversized and flooding reports", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify({ unexpected: true }))).status).toBe(400);
    expect((await post("{}", { "content-length": String(20 * 1024) })).status).toBe(413);
    expect((await post(JSON.stringify({ "csp-report": { "blocked-uri": "x".repeat(17 * 1024) } }))).status).toBe(413);
    let last = 204;
    for (let index = 0; index < 61; index += 1) last = (await post(JSON.stringify({ "csp-report": {} }))).status;
    expect(last).toBe(429);
    expect((await post(JSON.stringify({ "csp-report": {} }), { "x-forwarded-for": "198.51.100.9" })).status).toBe(204);
  });
});
