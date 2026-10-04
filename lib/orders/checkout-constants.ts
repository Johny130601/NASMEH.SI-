/**
 * Checkout constants and pure helpers shared with client components. Kept free
 * of zod on purpose: importing `checkout-schema` from a client component pulls
 * the whole validator (20 kB gzipped) into the checkout and account bundles
 * (Phase 9 step 2). Server code keeps importing everything from
 * `checkout-schema`, which re-exports these.
 */

import { isValidPhone, PHONE_MAX_LENGTH } from "@/lib/phone";

export function isValidPostalCode(country: string, postalCode: string): boolean {
  const rules: Record<string, RegExp> = {
    // Slovenian codes run 1000–9999 (QA T3-A1: "0999" is not a post office).
    SI: /^[1-9]\d{3}$/, AT: /^\d{4}$/, HU: /^\d{4}$/, BE: /^\d{4}$/,
    HR: /^\d{5}$/, IT: /^\d{5}$/, DE: /^\d{5}$/, FR: /^\d{5}$/,
    CZ: /^\d{3}\s?\d{2}$/, SK: /^\d{3}\s?\d{2}$/, PL: /^\d{2}-?\d{3}$/, NL: /^\d{4}\s?[A-Za-z]{2}$/,
  };
  return rules[country]?.test(postalCode.trim()) ?? false;
}

/**
 * Field lengths of `checkoutFormSchema`, mirrored on the inputs as `maxLength`
 * and by the client validation below, so the wizard refuses what the server
 * refuses before the request is sent (QA M11).
 */
export const CHECKOUT_LIMITS = {
  email: 254,
  phone: PHONE_MAX_LENGTH,
  fullName: 120,
  street: 120,
  streetNumber: 12,
  /** A supplement after the house number ("2. nadstropje"), kept apart so it prints after the number. */
  streetSupplement: 80,
  /** The one "Ulica in hišna številka" input: street, house number and a supplement at their limits. */
  streetLine: 215,
  city: 80,
  postalCode: 10,
} as const;

/**
 * Client mirror of the server e-mail rule. Deliberately no stricter than
 * `z.email()`: a shopper the client lets through and the server refuses gets
 * the field marked from the server's `invalid_form` answer, while a client rule
 * stricter than the server would refuse a valid address with no way forward.
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= CHECKOUT_LIMITS.email && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(trimmed);
}

export type CheckoutContactField = "email";
/** `streetLine` is the wizard's one input for street and house number; the order keeps them apart. */
export type CheckoutAddressField = "phone" | "fullName" | "streetLine" | "city" | "postalCode";
export type CheckoutField = CheckoutContactField | CheckoutAddressField;
export type CheckoutFieldErrors = Partial<Record<CheckoutField, "required" | "invalid" | "tooLong">>;

/** The Kontakt step: the same rule the quote and the order apply to the e-mail. */
export function validateCheckoutContact(form: { email: string }): CheckoutFieldErrors {
  const email = form.email.trim();
  if (!email) return { email: "required" };
  if (email.length > CHECKOUT_LIMITS.email) return { email: "tooLong" };
  return isPlausibleEmail(email) ? {} : { email: "invalid" };
}

/**
 * The Dostava step, mirroring `checkoutFormSchema` field by field (trimmed, min/max, phone, postal code).
 * The street line is checked as the two parts the order receives (`parseStreetLine`): a line
 * without a house number is "invalid", so the field asks for it before the server would.
 */
export function validateCheckoutAddress(form: {
  phone: string; fullName: string; streetLine: string; city: string; postalCode: string; country: string;
}): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};
  const text = (field: "fullName" | "city", min: number) => {
    const value = form[field].trim();
    if (value.length < min) errors[field] = value ? "invalid" : "required";
    else if (value.length > CHECKOUT_LIMITS[field]) errors[field] = "tooLong";
  };
  text("fullName", 2);
  const line = form.streetLine.trim();
  const parts = parseStreetLine(line);
  if (!line) errors.streetLine = "required";
  else if (!parts || parts.street.length < 2) errors.streetLine = "invalid";
  else if (
    parts.street.length > CHECKOUT_LIMITS.street || parts.streetNumber.length > CHECKOUT_LIMITS.streetNumber ||
    (parts.supplement?.length ?? 0) > CHECKOUT_LIMITS.streetSupplement
  ) {
    errors.streetLine = "tooLong";
  }
  text("city", 2);
  const phone = form.phone.trim();
  if (phone && !isValidPhone(phone)) errors.phone = phone.length > CHECKOUT_LIMITS.phone ? "tooLong" : "invalid";
  const postal = form.postalCode.trim();
  if (!postal) errors.postalCode = "required";
  else if (!isValidPostalCode(form.country, postal)) errors.postalCode = "invalid";
  return errors;
}

/** Maps the server's `invalid_form` field paths back onto the wizard's fields. */
export function fieldErrorsFromPaths(paths: string[]): CheckoutFieldErrors {
  const known: CheckoutField[] = ["email", "phone", "fullName", "streetLine", "city", "postalCode"];
  const errors: CheckoutFieldErrors = {};
  for (const path of paths) {
    // the server checks street, house number and supplement apart; the wizard asks for them in one field
    const field = path === "street" || path === "streetNumber" || path === "streetSupplement" ? "streetLine" : path;
    if ((known as string[]).includes(field)) errors[field as CheckoutField] = "invalid";
  }
  return errors;
}

export interface ShippingMethodSetting {
  id: string;
  carrier: string;
  label: string;
  priceCents: number;
  estimate: string;
  countries?: string[];
}

export const EU_COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "SI", label: "Slovenija" },
  { code: "AT", label: "Avstrija" },
  { code: "HR", label: "Hrvaška" },
  { code: "IT", label: "Italija" },
  { code: "HU", label: "Madžarska" },
  { code: "DE", label: "Nemčija" },
  { code: "CZ", label: "Češka" },
  { code: "SK", label: "Slovaška" },
  { code: "PL", label: "Poljska" },
  { code: "FR", label: "Francija" },
  { code: "NL", label: "Nizozemska" },
  { code: "BE", label: "Belgija" },
];

/**
 * A saved address as the one checkout line: "Ulica in hišna številka" with the
 * book's "Dopolnilo" after a comma, where `parseStreetLine` keeps it with the
 * street. The address book validates with this very line (QA 2026-10-03 T3-03).
 */
export function savedStreetLine(line1: string, line2?: string | null): string {
  const supplement = line2?.trim();
  return supplement ? `${line1.trim()}, ${supplement}` : line1.trim();
}

/** "12", "12a", "12 a", "5/3", "12-14" — or "b. š." (brez številke) for a building without one. */
const HOUSE_NUMBER = String.raw`(?:\d+(?: ?[a-z])?(?:[/-]\d+(?: ?[a-z])?)?|b\. ?š\.?|bš)`;
// the street may not end in the separator: "Via Roma, 10" is "Via Roma" + "10", not "Via Roma," + "10"
const TRAILING_NUMBER = new RegExp(String.raw`^(.*[^\s,])[\s,]+(${HOUSE_NUMBER})$`, "iu");
const LEADING_NUMBER = new RegExp(String.raw`^(${HOUSE_NUMBER})[\s,]+(.*\S)$`, "iu");

/**
 * Street and house number from the one "Ulica in hišna številka" line — the
 * way browser autofill, wallets and the address book hold an address
 * ("Slovenska cesta 12"). The order keeps the two apart (`checkoutFormSchema`),
 * so the line is split here; null means no house number could be found and
 * the field asks for one.
 *
 * - the number closes the line: "Čopova ulica 12", "Ulica 12 a", "Via Roma, 10";
 * - a supplement after a comma is kept apart, as the address book's "Dopolnilo"
 *   is: "Ulica 12, 2. nadstropje" → "Ulica" + "12" + "2. nadstropje", printed back
 *   in that order (`snapshotAddressLines`; QA 2026-10-03 T2-04 — joined to the
 *   street it printed as "Ulica, 2. nadstropje 12");
 * - the number opens the line where that is the custom: "12 rue de la Paix".
 *
 * `${street} ${streetNumber}` (+ `, ${supplement}`) reads back as the shopper
 * typed it (a comma before the number is dropped).
 */
export function parseStreetLine(line: string): { street: string; streetNumber: string; supplement?: string } | null {
  const text = line.replace(/\s+/g, " ").trim();
  const trailing = TRAILING_NUMBER.exec(text);
  if (trailing) return { street: trailing[1], streetNumber: trailing[2] };
  const comma = text.indexOf(",");
  if (comma > 0) {
    const head = TRAILING_NUMBER.exec(text.slice(0, comma).trim());
    const supplement = text.slice(comma + 1).trim();
    if (head && supplement) return { street: head[1], streetNumber: head[2], supplement };
  }
  const leading = LEADING_NUMBER.exec(text);
  if (leading) return { street: leading[2], streetNumber: leading[1] };
  return null;
}
