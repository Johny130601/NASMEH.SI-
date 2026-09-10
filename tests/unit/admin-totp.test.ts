import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUri, totpCode, totpStep, verifyTotp } from "@/lib/admin/totp";

// RFC 6238 appendix B, SHA-1 test secret "12345678901234567890" (six-digit tail of the eight-digit vectors).
const RFC_SECRET_BYTES = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const VECTORS: Array<[number, string]> = [
  [59, "287082"], [1111111109, "081804"], [1111111111, "050471"],
  [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"],
];

describe("TOTP (RFC 6238)", () => {
  it("round-trips base32 and matches the RFC secret encoding", () => {
    expect(base32Encode(RFC_SECRET_BYTES)).toBe(RFC_SECRET_BASE32);
    expect(Buffer.from(base32Decode(RFC_SECRET_BASE32))).toEqual(RFC_SECRET_BYTES);
    expect(Buffer.from(base32Decode("gezd gnbv-gy3t"))).toEqual(RFC_SECRET_BYTES.subarray(0, 7));
    expect(() => base32Decode("not!base32")).toThrow();
  });

  it.each(VECTORS)("time %i → %s", (seconds, code) => {
    expect(totpCode(RFC_SECRET_BASE32, seconds * 1000)).toBe(code);
    expect(hotp(RFC_SECRET_BYTES, totpStep(seconds * 1000))).toBe(code);
  });

  it("accepts the current step and one on each side, refuses further drift and malformed input", () => {
    const now = 1111111111 * 1000;
    expect(verifyTotp(RFC_SECRET_BASE32, "050471", { now })).toEqual({ ok: true, step: totpStep(now) });
    expect(verifyTotp(RFC_SECRET_BASE32, totpCode(RFC_SECRET_BASE32, now - 30_000), { now })).toMatchObject({ ok: true });
    expect(verifyTotp(RFC_SECRET_BASE32, totpCode(RFC_SECRET_BASE32, now + 30_000), { now })).toMatchObject({ ok: true });
    expect(verifyTotp(RFC_SECRET_BASE32, totpCode(RFC_SECRET_BASE32, now - 90_000), { now })).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyTotp(RFC_SECRET_BASE32, "050 471", { now })).toMatchObject({ ok: true });
    for (const bad of ["", "05047", "0504711", "abcdef", null, undefined]) {
      expect(verifyTotp(RFC_SECRET_BASE32, bad, { now })).toEqual({ ok: false, reason: "format" });
    }
  });

  it("refuses to replay a step that was already accepted", () => {
    const now = 1111111111 * 1000;
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET_BASE32, "050471", { now, lastStep: step })).toEqual({ ok: false, reason: "replay" });
    expect(verifyTotp(RFC_SECRET_BASE32, "050471", { now, lastStep: step - 1 })).toEqual({ ok: true, step });
  });

  it("generates 160-bit secrets and a standard otpauth URI", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(otpauthUri({ secret, account: "owner@nasmeh.si", issuer: "Nasmeh.si" }))
      .toBe(`otpauth://totp/Nasmeh.si%3Aowner%40nasmeh.si?secret=${secret}&issuer=Nasmeh.si&algorithm=SHA1&digits=6&period=30`);
  });
});
