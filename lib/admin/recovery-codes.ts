import { createHash, randomInt } from "node:crypto";

/**
 * One-time recovery codes for staff who lose their authenticator: eight codes
 * shown once at enrolment, stored only as SHA-256 hashes, each usable once.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const RECOVERY_CODE_COUNT = 8;
const CODE_LENGTH = 10;

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let raw = "";
    for (let index = 0; index < CODE_LENGTH; index += 1) raw += ALPHABET[randomInt(ALPHABET.length)];
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function normaliseRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  return raw.length === CODE_LENGTH ? raw : null;
}

export function hashRecoveryCode(code: string): string {
  const normalised = normaliseRecoveryCode(code);
  if (!normalised) throw new Error("invalid recovery code");
  return createHash("sha256").update(`recovery:${normalised}`).digest("hex");
}

export function parseRecoveryHashes(json: unknown): string[] {
  return Array.isArray(json) ? json.filter((entry): entry is string => typeof entry === "string" && /^[a-f0-9]{64}$/.test(entry)) : [];
}

/** Returns the remaining hashes without the consumed one, or a refusal. */
export function consumeRecoveryCode(json: unknown, input: unknown): { ok: true; remaining: string[] } | { ok: false } {
  const normalised = normaliseRecoveryCode(input);
  if (!normalised) return { ok: false };
  const hashes = parseRecoveryHashes(json);
  const hash = hashRecoveryCode(normalised);
  const index = hashes.indexOf(hash);
  if (index === -1) return { ok: false };
  return { ok: true, remaining: hashes.filter((_, position) => position !== index) };
}
