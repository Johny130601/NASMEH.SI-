import { z } from "zod";
import {
  CONSENT_WINDOW_KEY,
  consentDataLayerEvent,
  consentModeSignals,
  type ConsentCategories,
} from "@/lib/analytics";
import { CONSENT_CLEAR_COOKIES, COOKIES, type CookieRow } from "@/lib/copy/cmp";

/**
 * GDPR consent state (spec §3.4) — pure functions, unit-tested.
 * Persisted in the `nasmeh_consent` cookie AND server-side ConsentLog.
 */

export const CONSENT_VERSION = "1";
export const CONSENT_COOKIE = "nasmeh_consent";
export const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 365; // 12 months

/** Random consent id: the cookie's link to its ConsentLog rows (`visitorId`). */
export const consentIdSchema = z.uuid();

export const consentSchema = z.object({
  v: z.number().int().positive(),
  necessary: z.literal(true), // always on
  analytics: z.boolean(),
  marketing: z.boolean(),
  ts: z.number().int().positive(),
  /** Phase 9 step 4; optional so cookies written before it still parse. */
  id: consentIdSchema.optional(),
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

/**
 * Parse a raw cookie value; null when missing, invalid or from another
 * consent version (`consent.version` Setting — bumping it re-asks everyone).
 */
export function parseConsent(raw: string | undefined | null, version = 1): ConsentChoices | null {
  if (!raw) return null;
  try {
    const parsed = consentSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.v === version ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The consent id of a stored cookie (wire value), whatever its version, so a
 * later change or withdrawal from the same browser chains to the first choice.
 */
export function consentIdFromCookie(wire: string | undefined | null): string | null {
  const json = decodeConsentCookie(wire);
  if (!json) return null;
  try {
    const parsed = z.object({ id: consentIdSchema }).safeParse(JSON.parse(json));
    return parsed.success ? parsed.data.id : null;
  } catch {
    return null;
  }
}

const storedCategoriesSchema = z.object({ analytics: z.boolean(), marketing: z.boolean() });

/**
 * The optional categories a stored cookie (wire value) grants, whatever its
 * version: a new save is judged against the last choice this browser holds.
 */
export function storedCategoriesFromCookie(wire: string | undefined | null): ConsentCategories | null {
  const json = decodeConsentCookie(wire);
  if (!json) return null;
  try {
    const parsed = storedCategoriesSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** True when the new choice denies a category the previous one granted (GDPR Art. 7(3) withdrawal). */
export function withdrawsConsent(previous: ConsentCategories | null | undefined, next: ConsentCategories): boolean {
  return (previous?.analytics === true && !next.analytics) || (previous?.marketing === true && !next.marketing);
}

/** A cookie name or a prefix pattern (trailing `*`) the browser can expire; never a bare wildcard. */
const COOKIE_PATTERN = /^[A-Za-z0-9_.-]{2,80}\*?$/;

function patternsOverlap(a: string, b: string): boolean {
  const prefixA = a.endsWith("*") ? a.slice(0, -1) : null;
  const prefixB = b.endsWith("*") ? b.slice(0, -1) : null;
  if (prefixA !== null && prefixB !== null) return prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA);
  if (prefixA !== null) return b.startsWith(prefixA);
  if (prefixB !== null) return a.startsWith(prefixB);
  return a === b;
}

function rowNames(row: Pick<CookieRow, "name">): string[] {
  return row.name.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Cookie names and prefix patterns the browser expires after a save: the fixed
 * list for every denied category (CONSENT_CLEAR_COOKIES) plus the names of the
 * live `consent.cookies` rows the operator filed under a denied category
 * (free text such as "_ga, _ga_*"). Anything that is not a plain name or prefix
 * pattern, starts with "__" (Auth.js, __Host-/__Secure- cookies), or could match
 * a necessary cookie of either table is left out, so a mis-filed row never
 * signs anyone out or empties a cart.
 */
export function withdrawalCookiePatterns(
  choices: ConsentCategories,
  liveRows: readonly Pick<CookieRow, "name" | "category">[],
): string[] {
  const denied = (["analytics", "marketing"] as const).filter((category) => !choices[category]);
  if (denied.length === 0) return [];
  const necessary = [...COOKIES, ...liveRows].filter((row) => row.category === "necessary").flatMap(rowNames);
  const candidates = [
    ...denied.flatMap((category) => CONSENT_CLEAR_COOKIES[category]),
    ...liveRows.filter((row) => (denied as readonly string[]).includes(row.category)).flatMap(rowNames),
  ];
  const safe = candidates.filter((pattern) =>
    COOKIE_PATTERN.test(pattern)
    && !pattern.startsWith("__")
    && !necessary.some((name) => patternsOverlap(pattern, name)));
  return [...new Set(safe)];
}

/**
 * The choice as handed to client components: the consent id stays in the
 * httpOnly cookie and the log, never in the page where tags could read it.
 */
export function clientConsent(consent: ConsentChoices | null): ConsentChoices | null {
  if (!consent) return null;
  return { v: consent.v, necessary: consent.necessary, analytics: consent.analytics, marketing: consent.marketing, ts: consent.ts };
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

/**
 * The nonce'd inline Consent Mode snippet the storefront layout renders before
 * any other script: the all-denied default always, then — for a stored choice
 * of the current version — the matching update, the browser mirror read by
 * `pushEvent` and the `nasmeh_consent` dataLayer event, so a returning visitor's
 * choice is in the dataLayer before GTM loads. Built from booleans only; every
 * other character is fixed, so nothing request-controlled reaches the script.
 */
export function consentModeSnippet(stored: ConsentCategories | null): string {
  const lines = [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    `gtag('consent', 'default', ${JSON.stringify({
      ...consentModeSignals({ analytics: false, marketing: false }),
      wait_for_update: 500,
    })});`,
  ];
  if (stored) {
    const choice = { analytics: stored.analytics === true, marketing: stored.marketing === true };
    lines.push(
      `window.${CONSENT_WINDOW_KEY} = ${JSON.stringify(choice)};`,
      `gtag('consent', 'update', ${JSON.stringify(consentModeSignals(choice))});`,
      `dataLayer.push(${JSON.stringify(consentDataLayerEvent(choice))});`,
    );
  }
  return lines.join("\n");
}
