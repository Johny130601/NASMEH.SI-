import { z } from "zod";
import { db } from "@/lib/db";
import { COOKIES } from "@/lib/copy/cmp";
import {
  companySchema, consentBannerSchema, consentCookiesSchema, consentVersionSchema, contactSettingsSchema, DEFAULT_CONSENT_VERSION, DEFAULT_FREE_THRESHOLD_CENTS,
  DEFAULT_LEGAL_LINKS, DEFAULT_LOW_STOCK_THRESHOLD, DEFAULT_SEO_DEFAULTS, DEFAULT_STANDARD_COST_CENTS, DEFAULT_VAT_RATE_PERCENT, legalLinksSchema, lowStockThresholdSchema,
  maintenanceStoredSchema, seoDefaultsSchema, shippingMethodSchema,
} from "@/lib/settings-schemas";
import { DEFAULT_CONTACT_SETTINGS } from "@/lib/support/settings-schema";

/** Config-driven merchandising: storefront config is Setting data, not code. */
export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return (row?.value as T | undefined) ?? null;
}

export const SETTING_KEYS = {
  freeShippingThresholdCents: "shipping.freeThresholdCents",
  vatRatePercent: "vat.ratePercent",
  marqueeText: "marquee.text",
  marqueeHref: "marquee.href",
  marqueeActive: "marquee.active",
  homeSections: "home.sections",
  homeBundleBanner: "home.bundleBanner",
  homeRoutineBanner: "home.routineBanner",
  company: "company",
  homeHero: "home.hero",
  gtmId: "analytics.gtmId",
  ga4Id: "analytics.ga4Id",
  metaPixelId: "analytics.metaPixelId",
  tiktokPixelId: "analytics.tiktokPixelId",
  googleVerification: "seo.googleVerification",
  seoDefaults: "seo.defaults",
  maintenance: "maintenance",
  shippingMethods: "shipping.methods",
  shippingStandardCostCents: "shipping.standardCostCents",
  trackingTemplates: "tracking.templates",
  supportContact: "support.contact",
  invoiceFooter: "invoice.footer",
  consentVersion: "consent.version",
  consentCookies: "consent.cookies",
  consentBanner: "consent.banner",
  legalLinks: "legal.links",
  lowStockThreshold: "inventory.lowStockThreshold",
} as const;

export interface CompanySetting {
  name: string;
  address: string;
  registrationNumber: string;
  vatId: string;
  email: string;
  /** Optional trader telephone; "" or absent = not set. */
  phone?: string;
}

/** Homepage hero content slot (§4.1, admin-swappable in Phase 7). */
export interface HeroSlotSetting {
  kicker?: string;
  title: string;
  subtitle: string;
  /** Plain-text qualifier for a claim in the subtitle, rendered as small live text (§12.6); absent = none. */
  footnote?: string;
  ctaLabel: string;
  ctaHref: string;
  videoDesktop?: string;
  videoMobile?: string;
  poster?: string;
  imageAlt?: string;
  promoOverlayText?: string;
  promoOverlayHref?: string;
}

/** Homepage composition (§14.10): order and visibility of the four P1 sections. */
export type HomeSectionId = "hero" | "rail" | "bundleBanner" | "routineBanner";
export interface HomeSectionSetting {
  id: HomeSectionId;
  visible: boolean;
}

export interface BundleBannerSetting {
  title: string;
  cta: string;
  href: string;
}

export interface RoutineBannerSetting {
  title: string;
  href: string;
  image: string;
  imageAlt: string;
  footnote: string;
}

export interface MaintenanceSetting {
  enabled: boolean;
  /** bcrypt hash; absent until an operator sets a password (Phase 9 step 1). */
  passwordHash?: string;
  message?: string;
}

export interface MenuItem {
  label: string;
  href: string;
  color?: string;
  children?: MenuItem[];
  /** product slugs for mega-menu featured media cards */
  featured?: string[];
}

export async function getMenu(handle: string): Promise<MenuItem[]> {
  const row = await db.menu.findUnique({ where: { handle } });
  return (row?.items as MenuItem[] | undefined) ?? [];
}

// ---------- validated readers (Phase 7 step 6) ----------
// The storefront never throws on a malformed row: the schema the admin form
// validates is applied on read and a missing or invalid value falls back.

export async function readSetting<S extends z.ZodTypeAny>(key: string, schema: S, fallback: z.output<S>): Promise<z.output<S>> {
  const value = await getSetting<unknown>(key);
  if (value === null) return fallback;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

const stringSetting = (key: string) => readSetting(key, z.string().trim(), "");

export async function getVatRatePercent(): Promise<number> {
  return readSetting(SETTING_KEYS.vatRatePercent, z.number().int().min(0).max(100), DEFAULT_VAT_RATE_PERCENT);
}

export async function getShippingSettings() {
  const [methods, freeThresholdCents, standardCostCents] = await Promise.all([
    readSetting(SETTING_KEYS.shippingMethods, z.array(shippingMethodSchema), []),
    readSetting(SETTING_KEYS.freeShippingThresholdCents, z.number().int().min(0), DEFAULT_FREE_THRESHOLD_CENTS),
    readSetting(SETTING_KEYS.shippingStandardCostCents, z.number().int().min(0), DEFAULT_STANDARD_COST_CENTS),
  ]);
  return { methods, freeThresholdCents, standardCostCents };
}

export async function getFreeThresholdCents(): Promise<number> {
  return readSetting(SETTING_KEYS.freeShippingThresholdCents, z.number().int().min(0), DEFAULT_FREE_THRESHOLD_CENTS);
}

/** Storefront low-stock line threshold (the admin's §14.2 setting, `lowStockThresholdSchema`). */
export async function getLowStockThreshold(): Promise<number> {
  return readSetting(SETTING_KEYS.lowStockThreshold, lowStockThresholdSchema, DEFAULT_LOW_STOCK_THRESHOLD);
}

export async function getTrackingTemplates(): Promise<Partial<Record<"ps" | "gls", string>>> {
  return readSetting(SETTING_KEYS.trackingTemplates, z.object({ ps: z.string().optional(), gls: z.string().optional() }), {});
}

export async function getCompany(): Promise<CompanySetting | null> {
  return readSetting(SETTING_KEYS.company, companySchema.nullable(), null);
}

export async function getInvoiceFooter(): Promise<string> {
  return readSetting(SETTING_KEYS.invoiceFooter, z.string().trim().max(600), "");
}

/** Ids are read as plain strings: only GTM fires at P1, the others are stored for Phase 8. */
export async function getAnalyticsIds() {
  const [gtmId, ga4Id, metaPixelId, tiktokPixelId] = await Promise.all([
    stringSetting(SETTING_KEYS.gtmId), stringSetting(SETTING_KEYS.ga4Id), stringSetting(SETTING_KEYS.metaPixelId), stringSetting(SETTING_KEYS.tiktokPixelId),
  ]);
  return { gtmId, ga4Id, metaPixelId, tiktokPixelId };
}

export async function getGoogleVerification(): Promise<string> {
  return stringSetting(SETTING_KEYS.googleVerification);
}

export async function getSeoDefaults() {
  return readSetting(SETTING_KEYS.seoDefaults, seoDefaultsSchema, DEFAULT_SEO_DEFAULTS);
}

export async function getConsentConfig() {
  const [version, cookies, banner] = await Promise.all([
    readSetting(SETTING_KEYS.consentVersion, consentVersionSchema, DEFAULT_CONSENT_VERSION),
    readSetting(SETTING_KEYS.consentCookies, consentCookiesSchema, COOKIES),
    readSetting(SETTING_KEYS.consentBanner, consentBannerSchema, { title: "", body: "" }),
  ]);
  return { version, cookies, banner };
}

export async function getLegalLinks() {
  return readSetting(SETTING_KEYS.legalLinks, legalLinksSchema, DEFAULT_LEGAL_LINKS);
}

export async function getMaintenance(): Promise<MaintenanceSetting> {
  return readSetting(SETTING_KEYS.maintenance, maintenanceStoredSchema, { enabled: false });
}

/** For the admin form: the ticket path keeps its strict parse, the screen shows defaults for a missing row. */
export async function getContactSettingsLenient() {
  return readSetting(SETTING_KEYS.supportContact, contactSettingsSchema, DEFAULT_CONTACT_SETTINGS);
}
