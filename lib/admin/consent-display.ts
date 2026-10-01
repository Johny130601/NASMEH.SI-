import { admin as copy } from "@/lib/copy/admin";

/**
 * The consent history on the customer screen in words (QA cosmetics): the
 * kind by name, the stored choices as "label: value" pairs. Internal record
 * ids and the client timestamp are left out; the wording fingerprint
 * ("t-…") stays available as the row's title for an audit. Pure.
 */

const d = copy.customers.detail;
const HIDDEN_KEYS: ReadonlySet<string> = new Set(["subscriberId", "subscriptionId", "ts"]);
/** Identifiers are shown as stored, never looked up as codes (a slug may equal a code). */
const IDENTIFIER_KEYS: ReadonlySet<string> = new Set(["orderNumber", "productSlug"]);

/** Own entries only: a stored "constructor" must never resolve to a prototype member. */
function lookup(map: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export function consentKindLabel(kind: string): string {
  return lookup(d.consentKinds, kind) ?? kind;
}

/** Cookie rows carry the admin's numeric consent version; marketing rows a wording fingerprint, shown only on hover. */
export function consentVersionLabel(version: string): string | null {
  return /^\d+$/.test(version) ? d.consentVersion.replace("{version}", version) : null;
}

/**
 * A stored value in words. Codes (`action`, `source`, `reason`, statuses) are
 * looked up in the value vocabulary, never in the key labels; an unknown code
 * is shown as stored, because the stored code is the audit record.
 */
function valueText(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? copy.common.yes : copy.common.no;
  if (value === null || value === undefined) return copy.common.none;
  if (typeof value === "string") {
    if (IDENTIFIER_KEYS.has(key)) return value;
    return lookup(d.consentValues, value) ?? lookup(d.subscriberStatuses, value) ?? value;
  }
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

export type ConsentChoicePart = { key: string; label: string; value: string };

/**
 * The choices of one row as label/value pairs, in stored order. A cookie row's
 * keys are the CMP categories, so its `marketing` is the marketing-cookie
 * category ("trženjski"); on every other kind `marketing` is the newsletter
 * opt-in ("e-novice").
 */
export function consentChoiceParts(choices: unknown, kind?: string): ConsentChoicePart[] {
  if (!choices || typeof choices !== "object" || Array.isArray(choices)) return [];
  const labels: Record<string, string> = kind === "cookie"
    ? { ...d.consentChoices, ...d.consentCookieCategories }
    : d.consentChoices;
  return Object.entries(choices as Record<string, unknown>)
    .filter(([key]) => !HIDDEN_KEYS.has(key))
    .map(([key, value]) => ({ key, label: lookup(labels, key) ?? key, value: valueText(key, value) }));
}

/** The same pairs as one line ("e-novice: Da · vir: noga strani"). */
export function consentChoicesText(choices: unknown, kind?: string): string {
  return consentChoiceParts(choices, kind).map((part) => `${part.label}: ${part.value}`).join(" · ");
}
