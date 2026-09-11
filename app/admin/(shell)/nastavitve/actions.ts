"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/admin/access";
import { saveSettingValue } from "@/lib/admin/cms";
import { getConsentConfig, SETTING_KEYS } from "@/lib/settings";
import {
  analyticsSchema, companySchema, consentBannerSchema, consentCookiesSchema, contactSettingsSchema, googleVerificationSchema, invoiceFooterSchema,
  legalLinksSchema, maintenanceSchema, seoDefaultsSchema, shippingSettingsSchema, trackingTemplatesSchema, vatRateSchema,
  type AnalyticsInput, type CompanyInput, type ConsentBannerInput, type CookieRowInput, type LegalLinksInput, type MaintenanceInput,
  type SeoDefaultsInput, type ShippingSettingsInput, type TrackingTemplatesInput,
} from "@/lib/settings-schemas";
import type { ContactSettingsInput } from "@/lib/support/settings-schema";

/** Settings mutations (§14.12–§14.14): OWNER only; every value is validated by the schema the storefront reads. */

export type SettingsActionResult = { ok: true } | { ok: false; error: "invalid" };

function refreshStorefront(...paths: string[]) {
  revalidatePath("/", "layout");
  for (const path of paths) revalidatePath(path);
}

// ---------- shipping ----------

export async function saveShippingAction(input: ShippingSettingsInput): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = shippingSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const methods = parsed.data.methods.map(({ id, carrier, label, priceCents, estimate, countries }) => ({ id, carrier, label, priceCents, estimate, countries }));
  await Promise.all([
    saveSettingValue(SETTING_KEYS.shippingMethods, methods),
    saveSettingValue(SETTING_KEYS.freeShippingThresholdCents, parsed.data.freeThresholdCents),
    saveSettingValue(SETTING_KEYS.shippingStandardCostCents, parsed.data.standardCostCents),
  ]);
  refreshStorefront("/admin/nastavitve/dostava");
  return { ok: true };
}

/** Empty templates are dropped: a carrier without a template shows the number without a link. */
export async function saveTrackingTemplatesAction(input: TrackingTemplatesInput): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = trackingTemplatesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const templates = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== ""));
  await saveSettingValue(SETTING_KEYS.trackingTemplates, templates);
  refreshStorefront("/admin/nastavitve/dostava");
  return { ok: true };
}

// ---------- tax, invoice ----------

export async function saveVatRateAction(input: { ratePercent: number }): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = z.object({ ratePercent: vatRateSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.vatRatePercent, parsed.data.ratePercent);
  refreshStorefront("/admin/nastavitve/davki-racuni");
  return { ok: true };
}

export async function saveCompanyAction(input: CompanyInput): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.company, parsed.data);
  refreshStorefront("/admin/nastavitve/davki-racuni");
  return { ok: true };
}

export async function saveInvoiceFooterAction(input: { footer: string }): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = z.object({ footer: invoiceFooterSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.invoiceFooter, parsed.data.footer);
  revalidatePath("/admin/nastavitve/davki-racuni");
  return { ok: true };
}

// ---------- marketing, SEO, consent, store ----------

export async function saveAnalyticsAction(input: AnalyticsInput): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = analyticsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await Promise.all([
    saveSettingValue(SETTING_KEYS.gtmId, parsed.data.gtmId),
    saveSettingValue(SETTING_KEYS.ga4Id, parsed.data.ga4Id),
    saveSettingValue(SETTING_KEYS.metaPixelId, parsed.data.metaPixelId),
    saveSettingValue(SETTING_KEYS.tiktokPixelId, parsed.data.tiktokPixelId),
  ]);
  refreshStorefront("/admin/nastavitve/trzenje");
  return { ok: true };
}

export async function saveGoogleVerificationAction(input: { token: string }): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = z.object({ token: googleVerificationSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.googleVerification, parsed.data.token);
  refreshStorefront("/admin/nastavitve/trzenje");
  return { ok: true };
}

export async function saveSeoDefaultsAction(input: SeoDefaultsInput): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = seoDefaultsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.seoDefaults, parsed.data);
  refreshStorefront("/robots.txt", "/admin/nastavitve/trzenje");
  return { ok: true };
}

export async function saveConsentConfigAction(input: { cookies: CookieRowInput[]; banner: ConsentBannerInput }): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = z.object({ cookies: consentCookiesSchema, banner: consentBannerSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await Promise.all([
    saveSettingValue(SETTING_KEYS.consentCookies, parsed.data.cookies),
    saveSettingValue(SETTING_KEYS.consentBanner, parsed.data.banner),
  ]);
  refreshStorefront("/admin/nastavitve/trzenje");
  return { ok: true };
}

/** A new version invalidates every stored choice: visitors see the banner again on their next visit. */
export async function bumpConsentVersionAction(): Promise<SettingsActionResult & { version?: number }> {
  await requirePermission("settings:manage");
  const { version } = await getConsentConfig();
  const next = version + 1;
  await saveSettingValue(SETTING_KEYS.consentVersion, next);
  refreshStorefront("/admin/nastavitve/trzenje");
  return { ok: true, version: next };
}

export async function saveLegalLinksAction(input: LegalLinksInput): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = legalLinksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.legalLinks, parsed.data);
  refreshStorefront("/checkout", "/admin/nastavitve/trzenje");
  return { ok: true };
}

export async function saveMaintenanceAction(input: MaintenanceInput): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = maintenanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.maintenance, parsed.data);
  refreshStorefront("/vzdrzevanje", "/admin/nastavitve/trzenje");
  return { ok: true };
}

// ---------- support ----------

export async function saveContactSettingsAction(input: ContactSettingsInput): Promise<SettingsActionResult> {
  await requirePermission("settings:manage");
  const parsed = contactSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.supportContact, parsed.data);
  refreshStorefront("/kontakt", "/admin/nastavitve/podpora");
  return { ok: true };
}
