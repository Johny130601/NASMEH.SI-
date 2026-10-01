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
export type CheckoutAddressField = "phone" | "fullName" | "street" | "streetNumber" | "city" | "postalCode";
export type CheckoutField = CheckoutContactField | CheckoutAddressField;
export type CheckoutFieldErrors = Partial<Record<CheckoutField, "required" | "invalid" | "tooLong">>;

/** The Kontakt step: the same rule the quote and the order apply to the e-mail. */
export function validateCheckoutContact(form: { email: string }): CheckoutFieldErrors {
  const email = form.email.trim();
  if (!email) return { email: "required" };
  if (email.length > CHECKOUT_LIMITS.email) return { email: "tooLong" };
  return isPlausibleEmail(email) ? {} : { email: "invalid" };
}

/** The Dostava step, mirroring `checkoutFormSchema` field by field (trimmed, min/max, phone, postal code). */
export function validateCheckoutAddress(form: {
  phone: string; fullName: string; street: string; streetNumber: string; city: string; postalCode: string; country: string;
}): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};
  const text = (field: Exclude<CheckoutAddressField, "phone" | "postalCode">, min: number) => {
    const value = form[field].trim();
    if (value.length < min) errors[field] = value ? "invalid" : "required";
    else if (value.length > CHECKOUT_LIMITS[field]) errors[field] = "tooLong";
  };
  text("fullName", 2);
  text("street", 2);
  text("streetNumber", 1);
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
  const known: CheckoutField[] = ["email", "phone", "fullName", "street", "streetNumber", "city", "postalCode"];
  const errors: CheckoutFieldErrors = {};
  for (const path of paths) if ((known as string[]).includes(path)) errors[path as CheckoutField] = "invalid";
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
 * A saved address keeps "Ulica 12" in one line; the checkout stores street and
 * number apart (the invoice and the carrier label read them separately). The
 * trailing house-number token is split off when there is one; otherwise the
 * whole line is the street and the shopper adds the number.
 */
export function splitStreetLine(line1: string): { street: string; streetNumber: string } {
  const match = line1.trim().match(/^(.*\S)\s+(\d+[A-Za-z]?(?:[/-]\d+[A-Za-z]?)?)$/);
  if (!match) return { street: line1.trim(), streetNumber: "" };
  return { street: match[1], streetNumber: match[2] };
}
