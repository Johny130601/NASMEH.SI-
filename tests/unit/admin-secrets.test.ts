import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/admin/secrets";
import { PRE_AUTH_TTL_MS, signPreAuthToken, verifyPreAuthToken } from "@/lib/admin/pre-auth";
import { consumeRecoveryCode, generateRecoveryCodes, hashRecoveryCode, normaliseRecoveryCode, parseRecoveryHashes } from "@/lib/admin/recovery-codes";

const master = "unit-master-secret-0123456789abcdef0123456789abcdef";

describe("secret encryption", () => {
  it("round-trips and produces a fresh ciphertext per call", () => {
    const one = encryptSecret("GEZDGNBVGY3TQOJQ", master);
    const two = encryptSecret("GEZDGNBVGY3TQOJQ", master);
    expect(one).not.toBe(two);
    expect(decryptSecret(one, master)).toBe("GEZDGNBVGY3TQOJQ");
    expect(decryptSecret(two, master)).toBe("GEZDGNBVGY3TQOJQ");
  });

  it("returns null for tampering, a foreign key and malformed input", () => {
    const token = encryptSecret("SECRET", master);
    const [iv, ciphertext, tag] = token.split(".");
    expect(decryptSecret(token, "another-master-secret-0123456789abcdef0123456789")).toBeNull();
    expect(decryptSecret(`${iv}.${ciphertext}.${tag.slice(0, -2)}AA`, master)).toBeNull();
    expect(decryptSecret(`${iv}.${ciphertext.slice(1)}.${tag}`, master)).toBeNull();
    for (const bad of ["", "a.b", "a.b.c.d", null, 42, "x".repeat(2000)]) expect(decryptSecret(bad, master)).toBeNull();
  });
});

describe("pre-auth token", () => {
  const userId = "cmf0preauthuser0000000001";
  it("binds a user and expires after five minutes", () => {
    const now = 1_800_000_000_000;
    const token = signPreAuthToken(userId, master, now);
    expect(verifyPreAuthToken(token, master, now)).toEqual({ userId, expiresAt: now + PRE_AUTH_TTL_MS });
    expect(verifyPreAuthToken(token, master, now + PRE_AUTH_TTL_MS - 1)).not.toBeNull();
    expect(verifyPreAuthToken(token, master, now + PRE_AUTH_TTL_MS + 1)).toBeNull();
  });

  it("rejects tampering, foreign secrets, other users and malformed tokens", () => {
    const token = signPreAuthToken(userId, master);
    const parts = token.split(".");
    expect(verifyPreAuthToken(token, "other-secret-0123456789abcdef0123456789abcdef")).toBeNull();
    expect(verifyPreAuthToken(`cmf0preauthuser0000000002.${parts[1]}.${parts[2]}.${parts[3]}`, master)).toBeNull();
    expect(verifyPreAuthToken(`${parts[0]}.${Number(parts[1]) + 60_000}.${parts[2]}.${parts[3]}`, master)).toBeNull();
    for (const bad of ["", "a.b.c", token.slice(0, -1), null, undefined, `${token}x`]) expect(verifyPreAuthToken(bad, master)).toBeNull();
    expect(() => signPreAuthToken("../etc", master)).toThrow();
  });

  it("issues a different nonce every time", () => {
    expect(signPreAuthToken(userId, master)).not.toBe(signPreAuthToken(userId, master));
  });
});

describe("recovery codes", () => {
  it("generates eight distinct dashed codes that hash and normalise consistently", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
      expect(normaliseRecoveryCode(code.toUpperCase().replace("-", " "))).toBe(code.replace("-", ""));
      expect(hashRecoveryCode(code)).toBe(hashRecoveryCode(code.toUpperCase()));
    }
    expect(normaliseRecoveryCode("short")).toBeNull();
    expect(normaliseRecoveryCode(42)).toBeNull();
  });

  it("consumes a code exactly once and ignores unknown ones", () => {
    const codes = generateRecoveryCodes(3);
    const hashes = codes.map(hashRecoveryCode);
    const first = consumeRecoveryCode(hashes, codes[1]);
    expect(first).toEqual({ ok: true, remaining: [hashes[0], hashes[2]] });
    if (!first.ok) throw new Error("unreachable");
    expect(consumeRecoveryCode(first.remaining, codes[1])).toEqual({ ok: false });
    expect(consumeRecoveryCode(hashes, "zzzzz-zzzzz")).toEqual({ ok: false });
    expect(consumeRecoveryCode(null, codes[0])).toEqual({ ok: false });
    expect(parseRecoveryHashes(["bad", ...hashes, 5])).toEqual(hashes);
  });
});
