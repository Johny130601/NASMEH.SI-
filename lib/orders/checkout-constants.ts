/**
 * Checkout constants and pure helpers shared with client components. Kept free
 * of zod on purpose: importing `checkout-schema` from a client component pulls
 * the whole validator (20 kB gzipped) into the checkout and account bundles
 * (Phase 9 step 2). Server code keeps importing everything from
 * `checkout-schema`, which re-exports these.
 */

export function isValidPostalCode(country: string, postalCode: string): boolean {
  const rules: Record<string, RegExp> = {
    SI: /^\d{4}$/, AT: /^\d{4}$/, HU: /^\d{4}$/, BE: /^\d{4}$/,
    HR: /^\d{5}$/, IT: /^\d{5}$/, DE: /^\d{5}$/, FR: /^\d{5}$/,
    CZ: /^\d{3}\s?\d{2}$/, SK: /^\d{3}\s?\d{2}$/, PL: /^\d{2}-?\d{3}$/, NL: /^\d{4}\s?[A-Za-z]{2}$/,
  };
  return rules[country]?.test(postalCode.trim()) ?? false;
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
