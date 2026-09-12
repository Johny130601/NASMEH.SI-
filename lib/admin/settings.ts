import { getEnv } from "@/lib/env";
import { EU_COUNTRIES } from "@/lib/orders/checkout-schema";
import {
  getAnalyticsIds, getCompany, getConsentConfig, getContactSettingsLenient, getGoogleVerification, getInvoiceFooter, getLegalLinks,
  getMaintenance, getSeoDefaults, getShippingSettings, getTrackingTemplates, getVatRatePercent,
} from "@/lib/settings";
import { isTestMode } from "@/lib/turnstile";
import type { CompanyInput, MaintenanceInput } from "@/lib/settings-schemas";

/** Settings screen loaders (§14.12–§14.14): every value comes from the validated readers the storefront uses. */

export async function loadShippingScreen() {
  const [shipping, templates] = await Promise.all([getShippingSettings(), getTrackingTemplates()]);
  return {
    shipping: { methods: shipping.methods.map((method) => ({ ...method, countries: method.countries ?? ["SI"] })), freeThresholdCents: shipping.freeThresholdCents, standardCostCents: shipping.standardCostCents },
    templates: { ps: templates.ps ?? "", gls: templates.gls ?? "" },
    countries: EU_COUNTRIES,
  };
}

export interface ProviderStatus {
  id: "stripe" | "paypal" | "test";
  configured: boolean;
  /** Booleans only: the screen shows presence, never a value (AGENTS §6 — secrets stay in the host environment). */
  details: Array<{ key: string; present: boolean; note?: string }>;
}

/** Provider configuration as read from the environment: present/missing per variable, no values. */
export function providerStatus(env: ReturnType<typeof getEnv> = getEnv()): ProviderStatus[] {
  return [
    {
      id: "stripe",
      configured: !!env.STRIPE_SECRET_KEY && !!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      details: [
        { key: "STRIPE_SECRET_KEY", present: !!env.STRIPE_SECRET_KEY },
        { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", present: !!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY },
        { key: "STRIPE_WEBHOOK_SECRET", present: !!env.STRIPE_WEBHOOK_SECRET },
        { key: "STRIPE_KLARNA_ENABLED", present: env.STRIPE_KLARNA_ENABLED === "true", note: env.STRIPE_KLARNA_ENABLED },
      ],
    },
    {
      id: "paypal",
      configured: !!env.PAYPAL_CLIENT_ID && !!env.PAYPAL_CLIENT_SECRET,
      details: [
        { key: "PAYPAL_CLIENT_ID", present: !!env.PAYPAL_CLIENT_ID },
        { key: "PAYPAL_CLIENT_SECRET", present: !!env.PAYPAL_CLIENT_SECRET },
        { key: "PAYPAL_WEBHOOK_ID", present: !!env.PAYPAL_WEBHOOK_ID },
        { key: "PAYPAL_ENVIRONMENT", present: true, note: env.PAYPAL_ENVIRONMENT },
      ],
    },
    { id: "test", configured: isTestMode(), details: [{ key: "NODE_ENV=test / NASMEH_E2E", present: isTestMode() }] },
  ];
}

const EMPTY_COMPANY: CompanyInput = { name: "", address: "", registrationNumber: "", vatId: "", email: "" };

export async function loadTaxScreen() {
  const [vatRatePercent, company, invoiceFooter] = await Promise.all([getVatRatePercent(), getCompany(), getInvoiceFooter()]);
  return { vatRatePercent, company: company ?? EMPTY_COMPANY, invoiceFooter, providers: providerStatus() };
}

export async function loadMarketingScreen() {
  const [analytics, googleVerification, seo, consent, legalLinks, maintenance] = await Promise.all([
    getAnalyticsIds(), getGoogleVerification(), getSeoDefaults(), getConsentConfig(), getLegalLinks(), getMaintenance(),
  ]);
  const maintenanceForm: MaintenanceInput = { enabled: maintenance.enabled, password: "", message: maintenance.message ?? "" };
  return { analytics, googleVerification, seo, consent, legalLinks, maintenance: maintenanceForm, maintenanceHasPassword: !!maintenance.passwordHash };
}

export async function loadContactScreen() {
  return { contact: await getContactSettingsLenient() };
}
