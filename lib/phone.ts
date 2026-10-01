/**
 * The one rule for a telephone number a customer types (checkout delivery
 * phone, address book): an optional leading "+", then digits with the usual
 * separators, 6–20 characters long and at least 6 digits. The checkout schema,
 * the wizard's client mirror and the address action all use it, so a number
 * the server refuses is marked in the form before it is sent (QA M11, T3-A1).
 */
export const PHONE_PATTERN = /^\+?[0-9 ()/-]{6,20}$/;
export const PHONE_MAX_LENGTH = 21;

export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  return PHONE_PATTERN.test(trimmed) && trimmed.replace(/\D/g, "").length >= 6;
}

/**
 * `tel:` link target for a telephone number as the operator typed it (company
 * Setting, invoice snapshot). The shown text stays as typed; only the link is
 * normalised. International numbers written with the trunk prefix in
 * parentheses ("+386 (0)1 234 56 78") drop the "(0)", because dialling the 0
 * after a country code reaches a wrong number; "00" becomes "+". Everything
 * other than a leading "+" and the digits is removed. Returns null when no
 * digit is left. No server imports: storefront chrome and mail templates share it.
 */
export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const international = /^(\+|00)/.test(trimmed);
  const withoutTrunk = international ? trimmed.replace(/\(\s*0\s*\)/g, "") : trimmed;
  let digits = withoutTrunk.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) digits = `+${digits}`;
  else if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  return digits === "+" ? null : `tel:${digits}`;
}
