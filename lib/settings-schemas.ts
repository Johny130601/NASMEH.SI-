import { z } from "zod";
import { EU_COUNTRIES, shippingMethodSchema } from "@/lib/orders/checkout-schema";
import { contactSettingsSchema } from "@/lib/support/settings-schema";

/**
 * Every Setting shape the storefront reads, as the zod schema the admin
 * forms validate (Phase 7 step 6, §14.12–§14.14). No server imports: the
 * admin editors run these in the browser too. `lib/settings.ts` reads with
 * these schemas and falls back to the defaults below when a row is missing
 * or malformed, so a bad row never breaks a storefront request.
 */

export { shippingMethodSchema, contactSettingsSchema };

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
/** Same-site paths or https links (no javascript:, no protocol-relative). */
export const sitePathSchema = z.string().trim().min(1).max(500).regex(/^\/(?!\/)[^\s]*$/);

// ---------- shipping (§14.12) ----------

export const COUNTRY_CODES = EU_COUNTRIES.map((country) => country.code) as [string, ...string[]];

/** Stricter than the storefront's parser (ids are slugs, copy is bounded), never looser. */
export const shippingMethodFormSchema = shippingMethodSchema.extend({
  id: z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  carrier: required(60),
  label: required(80),
  priceCents: z.number().int().min(0).max(100_000),
  estimate: text(80),
  countries: z.array(z.enum(COUNTRY_CODES)).min(1).max(COUNTRY_CODES.length),
});

export const shippingSettingsSchema = z.object({
  methods: z.array(shippingMethodFormSchema).min(1).max(20)
    .refine((methods) => new Set(methods.map((method) => method.id)).size === methods.length, { message: "duplicate id" }),
  freeThresholdCents: z.number().int().min(0).max(1_000_000),
  /** The cart's pre-checkout estimate before a method is chosen. */
  standardCostCents: z.number().int().min(0).max(100_000),
});
export type ShippingSettingsInput = z.input<typeof shippingSettingsSchema>;

export const TRACKING_CARRIER_KEYS = ["ps", "gls"] as const;
export type TrackingCarrierKey = (typeof TRACKING_CARRIER_KEYS)[number];

/** A carrier template must be https, carry no credentials and contain `{number}`. */
export function isValidTrackingTemplate(template: string): boolean {
  if (template.length > 2048 || !template.includes("{number}")) return false;
  try {
    const url = new URL(template.replaceAll("{number}", "123456789"));
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** The carrier link for a tracking number, or null when the template is unusable. */
export function buildTrackingUrl(template: string | undefined, trackingNumber: string): string | null {
  if (!template || !isValidTrackingTemplate(template)) return null;
  return new URL(template.replaceAll("{number}", encodeURIComponent(trackingNumber))).toString();
}

const trackingTemplateSchema = z.union([z.literal(""), z.string().trim().refine(isValidTrackingTemplate, { message: "template" })]);
export const trackingTemplatesSchema = z.object({ ps: trackingTemplateSchema, gls: trackingTemplateSchema });
export type TrackingTemplatesInput = z.input<typeof trackingTemplatesSchema>;

// ---------- tax, invoice, payments (§14.13) ----------

/** Whole percents only: lib/pricing.ts refuses fractional rates (RangeError), so the form must too. */
export const vatRateSchema = z.number().int().min(0).max(100);

export const companySchema = z.object({
  name: required(120),
  address: required(300),
  registrationNumber: required(40),
  vatId: z.string().trim().toUpperCase().regex(/^[A-Z]{2}[A-Z0-9]{2,12}$/),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});
export type CompanyInput = z.input<typeof companySchema>;

export const invoiceFooterSchema = text(600);

// ---------- marketing, SEO, consent, store (§14.14) ----------

const optionalId = (pattern: RegExp) => z.union([z.literal(""), z.string().trim().regex(pattern)]);

/** Only GTM fires at P1; the other ids are stored for Phase 8 and mapped to their consent category. */
export const analyticsSchema = z.object({
  gtmId: optionalId(/^GTM-[A-Z0-9]{4,10}$/),
  ga4Id: optionalId(/^G-[A-Z0-9]{4,12}$/),
  metaPixelId: optionalId(/^[0-9]{6,20}$/),
  tiktokPixelId: optionalId(/^[A-Z0-9]{10,30}$/i),
});
export type AnalyticsInput = z.input<typeof analyticsSchema>;

export const googleVerificationSchema = z.union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9_-]{8,200}$/)]);

export const seoDefaultsSchema = z.object({
  titleTemplate: required(120).refine((value) => value.includes("%s"), { message: "%s" }),
  description: text(320),
  /** Off for staging or a soft launch: robots.txt disallows everything and every page carries noindex. */
  indexable: z.boolean(),
});
export type SeoDefaultsInput = z.input<typeof seoDefaultsSchema>;

export const CONSENT_CATEGORIES = ["necessary", "analytics", "marketing"] as const;
export const cookieRowSchema = z.object({
  name: required(80),
  provider: required(80),
  purpose: required(300),
  duration: required(40),
  category: z.enum(CONSENT_CATEGORIES),
});
export const consentCookiesSchema = z.array(cookieRowSchema).max(50);
export const consentBannerSchema = z.object({ title: text(120), body: text(600) });
export const consentVersionSchema = z.number().int().min(1).max(1_000_000);
export type CookieRowInput = z.input<typeof cookieRowSchema>;
export type ConsentBannerInput = z.input<typeof consentBannerSchema>;

export const LEGAL_LINK_KEYS = ["terms", "privacy", "cookies", "withdrawal", "complaints"] as const;
export const legalLinksSchema = z.object({
  terms: sitePathSchema, privacy: sitePathSchema, cookies: sitePathSchema, withdrawal: sitePathSchema, complaints: sitePathSchema,
});
export type LegalLinksInput = z.input<typeof legalLinksSchema>;

export const maintenanceSchema = z.object({
  enabled: z.boolean(),
  password: z.union([z.literal(""), z.string().min(4).max(80)]),
  message: text(300),
}).refine((value) => !value.enabled || value.password.length > 0, { message: "password", path: ["password"] });
export type MaintenanceInput = z.input<typeof maintenanceSchema>;

// ---------- defaults the readers fall back to ----------

export const DEFAULT_VAT_RATE_PERCENT = 22;
export const DEFAULT_FREE_THRESHOLD_CENTS = 4500;
export const DEFAULT_STANDARD_COST_CENTS = 390;
export const DEFAULT_SEO_DEFAULTS: z.output<typeof seoDefaultsSchema> = { titleTemplate: "%s | Nasmeh.si", description: "", indexable: true };
export const DEFAULT_CONSENT_VERSION = 1;
export const DEFAULT_LEGAL_LINKS: z.output<typeof legalLinksSchema> = {
  terms: "/pogoji-poslovanja", privacy: "/politika-zasebnosti", cookies: "/politika-piskotkov", withdrawal: "/odstop-od-pogodbe", complaints: "/reklamacije",
};
export const DEFAULT_MAINTENANCE: z.output<typeof maintenanceSchema> = { enabled: false, password: "", message: "" };
