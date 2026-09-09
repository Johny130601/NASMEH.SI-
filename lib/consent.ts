import { z } from "zod";

/**
 * GDPR consent state (spec §3.4) — pure functions, unit-tested.
 * Persisted in the `nasmeh_consent` cookie AND server-side ConsentLog.
 */

export const CONSENT_VERSION = "1";
export const CONSENT_COOKIE = "nasmeh_consent";
export const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 365; // 12 months

export const consentSchema = z.object({
  v: z.literal(1),
  necessary: z.literal(true), // always on
  analytics: z.boolean(),
  marketing: z.boolean(),
  ts: z.number().int().positive(),
});

export type ConsentChoices = z.infer<typeof consentSchema>;

export const CONSENT_ALL_DENIED: Omit<ConsentChoices, "ts"> = {
  v: 1,
  necessary: true,
  analytics: false,
  marketing: false,
};

export const CONSENT_ALL_ACCEPTED: Omit<ConsentChoices, "ts"> = {
  v: 1,
  necessary: true,
  analytics: true,
  marketing: true,
};

/** now injected (testable, AGENTS §8.4-style purity). */
export function serializeConsent(
  choices: Omit<ConsentChoices, "ts">,
  now: number,
): string {
  const full: ConsentChoices = { ...choices, ts: now };
  return JSON.stringify(full);
}

/** Parse a raw cookie value; null when missing/invalid/stale version. */
export function parseConsent(raw: string | undefined | null): ConsentChoices | null {
  if (!raw) return null;
  try {
    const parsed = consentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Cookie wire codec: base64url of the JSON payload. Immune to the framework's
 * own percent-encoding of cookie values (raw JSON breaks on `,` `;` `"`).
 */
export function encodeConsentCookie(json: string): string {
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeConsentCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    return Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
