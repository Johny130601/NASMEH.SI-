import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";

const id = "cmf0restocksubscription01";
const secret = "unit-restock-secret";

/** A link mailed before the separator change: `<id>.<hmac>`. */
function legacyToken(subscriptionId: string) {
  return `${subscriptionId}.${createHmac("sha256", secret).update(`back-in-stock-unsubscribe:${subscriptionId}`).digest("base64url")}`;
}

/** The page matchers of middleware.ts, as Next.js applies them to a pathname. */
function middlewareMatches(pathname: string): boolean {
  const source = readFileSync(join(__dirname, "..", "..", "middleware.ts"), "utf8");
  const list = /matcher:\s*\[([^\]]+)\]/.exec(source)![1];
  const patterns = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1].replace(/\\\\/g, "\\"));
  return patterns.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

describe("restock unsubscribe tokens", () => {
  it("round-trips a subscription id under a hyphen-joined, dot-free token", () => {
    const token = signUnsubscribeToken(id, secret);
    expect(token.startsWith(`${id}-`)).toBe(true);
    expect(token).not.toContain(".");
    expect(verifyUnsubscribeToken(token, secret)).toBe(id);
  });

  it("keeps verifying dotted links mailed before the change", () => {
    const legacy = legacyToken(id);
    expect(verifyUnsubscribeToken(legacy, secret)).toBe(id);
    expect(verifyUnsubscribeToken(legacy.replace(".", "-"), secret)).toBe(id);
    expect(verifyUnsubscribeToken(legacy, "other-secret")).toBeNull();
  });

  it("puts new links on a path the middleware matcher covers (CSP nonce), unlike the old dotted form", () => {
    expect(middlewareMatches(`/odjava-zaloga/${signUnsubscribeToken(id, secret)}`)).toBe(true);
    expect(middlewareMatches(`/odjava-zaloga/${legacyToken(id)}`)).toBe(false);
    expect(middlewareMatches("/_next/static/chunk.js")).toBe(false);
    // the crawler files are the dotted exception: the maintenance gate answers them (QA 2026-10-03 T6-09)
    expect(middlewareMatches("/sitemap.xml")).toBe(true);
    expect(middlewareMatches("/robots.txt")).toBe(true);
    expect(middlewareMatches("/uploads/products/a/b.webp")).toBe(false);
  });

  it("rejects tampering, foreign secrets and malformed input", () => {
    const token = signUnsubscribeToken(id, secret);
    const signature = token.slice(id.length + 1);
    const flipped = signature.endsWith("A") ? `${signature.slice(0, -1)}B` : `${signature.slice(0, -1)}A`;
    expect(verifyUnsubscribeToken(`${id}-${flipped}`, secret)).toBeNull();
    expect(verifyUnsubscribeToken(token, "other-secret")).toBeNull();
    expect(verifyUnsubscribeToken(`${id}2-${signature}`, secret)).toBeNull();
    for (const bad of [
      "", "nodot", ".sig", "-sig", `${id}.`, `${id}-`, `${id}-short`, `${id}_${signature}`, `${id}.-${signature}`,
      `${"x".repeat(200)}-${signature}`, null, undefined,
    ]) {
      expect(verifyUnsubscribeToken(bad, secret)).toBeNull();
    }
  });

  it("refuses to sign anything that is not a subscription id", () => {
    expect(() => signUnsubscribeToken("../etc", secret)).toThrow();
    expect(() => signUnsubscribeToken("", secret)).toThrow();
  });
});
