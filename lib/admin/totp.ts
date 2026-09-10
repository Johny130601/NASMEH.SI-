import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP over HMAC-SHA1 (30 s step, six digits), the profile every
 * authenticator app implements. No external dependency; vectors in the unit
 * tests come from the RFC.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0x1fff;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error("invalid base32");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = ((value << 5) | ALPHABET.indexOf(char)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", Buffer.from(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totpStep(timeMs: number, stepSeconds = TOTP_STEP_SECONDS): number {
  return Math.floor(timeMs / 1000 / stepSeconds);
}

export function totpCode(secretBase32: string, timeMs: number, digits = TOTP_DIGITS): string {
  return hotp(base32Decode(secretBase32), totpStep(timeMs), digits);
}

export type TotpVerification =
  | { ok: true; step: number }
  | { ok: false; reason: "format" | "mismatch" | "replay" };

/**
 * Accepts the current step and one on each side (clock drift), and refuses a
 * step at or below `lastStep`, so a captured code cannot be replayed within
 * its window.
 */
export function verifyTotp(
  secretBase32: string,
  code: unknown,
  options: { now?: number; lastStep?: number | null; window?: number } = {},
): TotpVerification {
  const normalised = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalised)) return { ok: false, reason: "format" };
  const secret = base32Decode(secretBase32);
  const current = totpStep(options.now ?? Date.now());
  const window = options.window ?? 1;
  let matched: number | null = null;
  for (let delta = -window; delta <= window; delta += 1) {
    const step = current + delta;
    if (step < 0) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(normalised)) && matched === null) matched = step;
  }
  if (matched === null) return { ok: false, reason: "mismatch" };
  const lastStep = options.lastStep ?? null;
  if (lastStep !== null && matched <= lastStep) return { ok: false, reason: "replay" };
  return { ok: true, step: matched };
}

export function otpauthUri(input: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const issuer = encodeURIComponent(input.issuer);
  return `otpauth://totp/${label}?secret=${input.secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
