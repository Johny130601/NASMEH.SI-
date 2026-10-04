import { z } from "zod";
import { isValidPhone } from "@/lib/phone";
import { CHECKOUT_LIMITS, isValidPostalCode } from "./checkout-constants";

// Client components import these from checkout-constants (no zod in their bundle); server code from here.
export { EU_COUNTRIES, isValidPostalCode, type ShippingMethodSetting } from "./checkout-constants";

/** Checkout form contract (§8.1) — intent only; money is re-priced server-side. The client mirror lives in checkout-constants (QA M11). */
export const checkoutFormSchema = z.object({
  email: z.string().trim().max(CHECKOUT_LIMITS.email).pipe(z.email()),
  phone: z
    .string()
    .trim()
    .max(CHECKOUT_LIMITS.phone)
    .refine(value => value === "" || isValidPhone(value))
    .default(""),
  fullName: z.string().trim().min(2).max(CHECKOUT_LIMITS.fullName),
  street: z.string().trim().min(2).max(CHECKOUT_LIMITS.street),
  streetNumber: z.string().trim().min(1).max(CHECKOUT_LIMITS.streetNumber),
  /** "2. nadstropje" after the house number; printed after it (QA 2026-10-03 T2-04). */
  streetSupplement: z.string().trim().max(CHECKOUT_LIMITS.streetSupplement).default(""),
  city: z.string().trim().min(2).max(CHECKOUT_LIMITS.city),
  postalCode: z.string().trim().min(3).max(CHECKOUT_LIMITS.postalCode),
  country: z.enum(["SI", "AT", "HR", "IT", "HU", "DE", "CZ", "SK", "PL", "FR", "NL", "BE"]).default("SI"),
  shippingMethodId: z.string().trim().min(1).max(40),
  provider: z.enum(["stripe", "paypal", "test"]),
  marketingOptIn: z.boolean().default(false),
  turnstileToken: z.string().max(2048).default(""),
  checkoutKey: z.string().regex(/^[a-f0-9]{32}$/),
  quoteToken: z.string().regex(/^[a-f0-9]{64}$/),
}).refine(input => isValidPostalCode(input.country, input.postalCode), { path: ["postalCode"], message: "Invalid postal code" });


/** The top-level fields an `invalid_form` refusal names, so the wizard can mark them (QA M11). */
export function invalidFormFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.map(issue => String(issue.path[0] ?? "")).filter(Boolean))];
}

export const shippingMethodSchema = z.object({
  id: z.string().min(1), carrier: z.string(), label: z.string(),
  priceCents: z.number().int().nonnegative(), estimate: z.string(),
  countries: z.array(z.string().length(2)).min(1).default(["SI"]),
});

export type CheckoutFormInput = z.infer<typeof checkoutFormSchema>;
