import { z } from "zod";

/** Checkout form contract (§8.1) — intent only; money is re-priced server-side. */
export const checkoutFormSchema = z.object({
  email: z.email(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()/-]{6,20}$/)
    .optional()
    .or(z.literal("")),
  fullName: z.string().trim().min(2).max(120),
  street: z.string().trim().min(2).max(120),
  streetNumber: z.string().trim().min(1).max(12),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(10),
  country: z.enum(["SI", "AT", "HR", "IT", "HU", "DE", "CZ", "SK", "PL", "FR", "NL", "BE"]).default("SI"),
  shippingMethodId: z.string().trim().min(1).max(40),
  provider: z.enum(["stripe", "paypal", "test"]),
  marketingOptIn: z.boolean().default(false),
  turnstileToken: z.string().max(2048).default(""),
  checkoutKey: z.string().regex(/^[a-f0-9]{32}$/),
  quoteToken: z.string().regex(/^[a-f0-9]{64}$/),
}).refine(input => isValidPostalCode(input.country, input.postalCode), { path: ["postalCode"], message: "Invalid postal code" });

export function isValidPostalCode(country: string, postalCode: string): boolean {
  const rules: Record<string, RegExp> = {
    SI: /^\d{4}$/, AT: /^\d{4}$/, HU: /^\d{4}$/, BE: /^\d{4}$/,
    HR: /^\d{5}$/, IT: /^\d{5}$/, DE: /^\d{5}$/, FR: /^\d{5}$/,
    CZ: /^\d{3}\s?\d{2}$/, SK: /^\d{3}\s?\d{2}$/, PL: /^\d{2}-?\d{3}$/, NL: /^\d{4}\s?[A-Za-z]{2}$/,
  };
  return rules[country]?.test(postalCode.trim()) ?? false;
}

export const shippingMethodSchema = z.object({
  id: z.string().min(1), carrier: z.string(), label: z.string(),
  priceCents: z.number().int().nonnegative(), estimate: z.string(),
  countries: z.array(z.string().length(2)).min(1).default(["SI"]),
});

export type CheckoutFormInput = z.infer<typeof checkoutFormSchema>;

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
