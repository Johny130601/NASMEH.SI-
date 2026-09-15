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
