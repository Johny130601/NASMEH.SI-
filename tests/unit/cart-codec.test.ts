import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signGuestCart, verifyGuestCart } from "@/lib/cart/codec";

const SECRET = "codec-test-secret-at-least-32-chars!";

describe("guest cart cookie codec (HMAC-signed)", () => {
  it("sign → verify round-trip", () => {
    const lines = [
      { variantId: "v1", quantity: 2 },
      { variantId: "vB", quantity: 1 },
    ];
    const cookie = signGuestCart(lines, SECRET);
    expect(verifyGuestCart(cookie, SECRET)).toEqual(lines);
  });

  it("tampered payload → null (forge rejected)", () => {
    const cookie = signGuestCart([{ variantId: "v1", quantity: 1 }], SECRET);
    const [payload, signature] = cookie.split(".");
    // attacker rewrites quantity to 99 but keeps the original signature
    const forgedPayload = Buffer.from(
      JSON.stringify({ v: 1, lines: [{ variantId: "v1", quantity: 99 }] }),
    ).toString("base64url");
    expect(verifyGuestCart(`${forgedPayload}.${signature}`, SECRET)).toBeNull();
    expect(payload).not.toBe(forgedPayload);
  });

  it("wrong secret → null", () => {
    const cookie = signGuestCart([{ variantId: "v1", quantity: 1 }], SECRET);
    expect(verifyGuestCart(cookie, "another-secret-32-chars-xxxxxxxxx")).toBeNull();
  });

  it("a new cart revision changes its signed proof without changing lines", () => {
    const lines = [{ variantId: "v1", quantity: 1 }];
    const first = signGuestCart(lines, SECRET, "revision-1");
    const rebuilt = signGuestCart(lines, SECRET, "revision-2");
    expect(rebuilt).not.toBe(first);
    expect(verifyGuestCart(first, SECRET)).toEqual(lines);
    expect(verifyGuestCart(rebuilt, SECRET)).toEqual(lines);
    const [payload, signature] = first.split(".");
    const tampered = JSON.parse(Buffer.from(payload, "base64url").toString());
    tampered.revision = "revision-2";
    const forged = Buffer.from(JSON.stringify(tampered)).toString("base64url");
    expect(verifyGuestCart(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it("garbage/malformed → null", () => {
    expect(verifyGuestCart("not-a-cookie", SECRET)).toBeNull();
    expect(verifyGuestCart("", SECRET)).toBeNull();
    expect(verifyGuestCart(null, SECRET)).toBeNull();
    expect(verifyGuestCart(undefined, SECRET)).toBeNull();
    expect(verifyGuestCart("aGVsbG8.dG9wc2VjcmV0", SECRET)).toBeNull();
  });

  it("bad shape (valid HMAC, invalid payload) → null", () => {
    // properly signed but schema-invalid (qty 0)
    const payload = Buffer.from(
      JSON.stringify({ v: 1, lines: [{ variantId: "v1", quantity: 0 }] }),
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");
    expect(verifyGuestCart(`${payload}.${signature}`, SECRET)).toBeNull();
  });
});
