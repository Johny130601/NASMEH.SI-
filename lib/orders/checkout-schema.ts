import { z } from "zod";
import { isValidPostalCode } from "./checkout-constants";

// Client components import these from checkout-constants (no zod in their bundle); server code from here.
export { EU_COUNTRIES, isValidPostalCode, type ShippingMethodSetting } from "./checkout-constants";

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


export const shippingMethodSchema = z.object({
  id: z.string().min(1), carrier: z.string(), label: z.string(),
  priceCents: z.number().int().nonnegative(), estimate: z.string(),
  countries: z.array(z.string().length(2)).min(1).default(["SI"]),
});

export type CheckoutFormInput = z.infer<typeof checkoutFormSchema>;
