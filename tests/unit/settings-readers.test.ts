import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 7 step 6: the storefront reads every Setting through its schema and never throws on a malformed row. */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { setting: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/seo", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/seo")>()), siteUrl: () => "https://nasmeh.example" }));

import {
  getAnalyticsIds, getCompany, getConsentConfig, getContactSettingsLenient, getFreeThresholdCents, getInvoiceFooter, getLegalLinks, getMaintenance,
  getSeoDefaults, getShippingSettings, getTrackingTemplates, getVatRatePercent, readSetting,
} from "@/lib/settings";
import { DEFAULT_LEGAL_LINKS, DEFAULT_SEO_DEFAULTS } from "@/lib/settings-schemas";
import { COOKIES } from "@/lib/copy/cmp";
import { rootMetadata } from "@/lib/seo";
import { carrierTemplateKey, trackingUrl } from "@/lib/tracking";
import { parseConsent, serializeConsent } from "@/lib/consent";
import { buildInvoiceData } from "@/lib/invoice/data";
import { z } from "zod";

const rows = new Map<string, unknown>();
beforeEach(() => {
  vi.resetAllMocks();
  rows.clear();
  mocks.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null));
});

describe("readSetting", () => {
  it("returns the parsed value, the fallback for a missing row and the fallback for a malformed row", async () => {
    expect(await readSetting("x", z.number(), 5)).toBe(5);
    rows.set("x", 7);
    expect(await readSetting("x", z.number(), 5)).toBe(7);
    rows.set("x", "seven");
    expect(await readSetting("x", z.number(), 5)).toBe(5);
  });
});

describe("typed readers", () => {
  it("shipping: methods, threshold and estimate with defaults; a malformed methods row yields no methods", async () => {
    expect(await getShippingSettings()).toEqual({ methods: [], freeThresholdCents: 4500, standardCostCents: 390 });
    rows.set("shipping.methods", [{ id: "gls", carrier: "GLS", label: "GLS", priceCents: 490, estimate: "2 dni" }]);
    rows.set("shipping.freeThresholdCents", 9900);
    rows.set("shipping.standardCostCents", 250);
    const shipping = await getShippingSettings();
    expect(shipping.methods[0]).toMatchObject({ id: "gls", countries: ["SI"] });
    expect(shipping).toMatchObject({ freeThresholdCents: 9900, standardCostCents: 250 });
    expect(await getFreeThresholdCents()).toBe(9900);
    rows.set("shipping.methods", [{ id: "", priceCents: "x" }]);
    expect((await getShippingSettings()).methods).toEqual([]);
    rows.set("shipping.freeThresholdCents", -5);
    expect(await getFreeThresholdCents()).toBe(4500);
  });

  it("VAT, company, invoice footer, analytics ids, SEO defaults, legal links, maintenance and contact fall back cleanly", async () => {
    expect(await getVatRatePercent()).toBe(22);
    rows.set("vat.ratePercent", 9);
    expect(await getVatRatePercent()).toBe(9);
    rows.set("vat.ratePercent", 9.5);
    expect(await getVatRatePercent()).toBe(22);
    rows.set("vat.ratePercent", "22");
    expect(await getVatRatePercent()).toBe(22);
    expect(await getCompany()).toBeNull();
    rows.set("company", { name: "Nasmeh d.o.o.", address: "Trg 1", registrationNumber: "123", vatId: "SI12345678", email: "info@nasmeh.si" });
    expect((await getCompany())?.name).toBe("Nasmeh d.o.o.");
    rows.set("company", { name: "Broken" });
    expect(await getCompany()).toBeNull();
    expect(await getInvoiceFooter()).toBe("");
    rows.set("invoice.footer", " Hvala ");
    expect(await getInvoiceFooter()).toBe("Hvala");
    rows.set("analytics.gtmId", " GTM-X1 ");
    expect(await getAnalyticsIds()).toEqual({ gtmId: "GTM-X1", ga4Id: "", metaPixelId: "", tiktokPixelId: "" });
    expect(await getSeoDefaults()).toEqual(DEFAULT_SEO_DEFAULTS);
    rows.set("seo.defaults", { titleTemplate: "%s · N", description: "Opis", indexable: false });
    expect(await getSeoDefaults()).toEqual({ titleTemplate: "%s · N", description: "Opis", indexable: false });
    rows.set("seo.defaults", { titleTemplate: "no placeholder", description: "", indexable: true });
    expect(await getSeoDefaults()).toEqual(DEFAULT_SEO_DEFAULTS);
    expect(await getLegalLinks()).toEqual(DEFAULT_LEGAL_LINKS);
    rows.set("legal.links", { ...DEFAULT_LEGAL_LINKS, terms: "/pogoji-2026" });
    expect((await getLegalLinks()).terms).toBe("/pogoji-2026");
    expect(await getMaintenance()).toEqual({ enabled: false });
    rows.set("maintenance", { enabled: true, password: "pw", message: "Kmalu" });
    expect(await getMaintenance()).toEqual({ enabled: true, password: "pw", message: "Kmalu" });
    expect((await getContactSettingsLenient()).supportEmail).toBe("podpora@nasmeh.test");
    rows.set("support.contact", { supportEmail: "a@b.si", complianceEmail: "c@b.si", hours: "h", responseTime: "r" });
    expect((await getContactSettingsLenient()).supportEmail).toBe("a@b.si");
  });

  it("consent config: version, cookie table and banner copy with the copy file as fallback", async () => {
    expect(await getConsentConfig()).toEqual({ version: 1, cookies: COOKIES, banner: { title: "", body: "" } });
    rows.set("consent.version", 3);
    rows.set("consent.cookies", [{ name: "_x", provider: "X", purpose: "P", duration: "1 dan", category: "marketing" }]);
    rows.set("consent.banner", { title: "Naslov", body: "" });
    expect(await getConsentConfig()).toEqual({ version: 3, cookies: [{ name: "_x", provider: "X", purpose: "P", duration: "1 dan", category: "marketing" }], banner: { title: "Naslov", body: "" } });
    rows.set("consent.cookies", [{ name: "_x" }]);
    expect((await getConsentConfig()).cookies).toEqual(COOKIES);
  });
});

describe("consumers", () => {
  it("tracking links come from the validated templates and the carrier key", async () => {
    expect(carrierTemplateKey("Pošta Slovenije")).toBe("ps");
    expect(carrierTemplateKey("posta")).toBe("ps");
    expect(carrierTemplateKey("GLS Slovenija")).toBe("gls");
    expect(carrierTemplateKey("DHL")).toBeNull();
    expect(await trackingUrl("GLS", "123")).toBeNull();
    rows.set("tracking.templates", { gls: "https://gls.example/t?n={number}", ps: "http://insecure.example/{number}" });
    expect(await getTrackingTemplates()).toEqual({ gls: "https://gls.example/t?n={number}", ps: "http://insecure.example/{number}" });
    expect(await trackingUrl("GLS", "AB 1")).toBe("https://gls.example/t?n=AB%201");
    expect(await trackingUrl("Pošta Slovenije", "1")).toBeNull();
    expect(await trackingUrl("DHL", "1")).toBeNull();
    expect(await trackingUrl(null, "1")).toBeNull();
    rows.set("tracking.templates", "broken");
    expect(await trackingUrl("GLS", "1")).toBeNull();
  });

  it("a stored consent is only valid for the current version", () => {
    const raw = serializeConsent({ v: 2, necessary: true, analytics: true, marketing: false }, 1_757_400_000_000);
    expect(parseConsent(raw, 2)).toMatchObject({ v: 2, analytics: true });
    expect(parseConsent(raw, 3)).toBeNull();
    expect(parseConsent(raw)).toBeNull();
    expect(parseConsent(serializeConsent({ v: 1, necessary: true, analytics: false, marketing: false }, 1))).toMatchObject({ v: 1 });
  });

  it("root metadata applies the title template, the description default and the noindex switch", () => {
    const indexed = rootMetadata({ titleTemplate: "%s · Nasmeh", description: "Opis", indexable: true }, "token");
    expect(indexed.title).toEqual({ default: "Nasmeh.si", template: "%s · Nasmeh" });
    expect(indexed.description).toBe("Opis");
    expect(indexed.robots).toBeUndefined();
    expect(indexed.verification).toEqual({ google: "token" });
    const hidden = rootMetadata({ titleTemplate: "%s", description: "", indexable: false }, null);
    expect(hidden.robots).toEqual({ index: false, follow: false });
    expect(typeof hidden.description).toBe("string");
    expect((hidden.description as string).length).toBeGreaterThan(0);
    expect(hidden.verification).toBeUndefined();
  });

  it("the invoice data carries the trimmed operator footer or null", () => {
    const order = {
      number: "NS-2026-00001", invoiceNumber: "NS-2026-00001", invoiceIssuedAt: new Date("2026-09-11"), paidAt: new Date(), createdAt: new Date(), email: "k@test.si",
      billingAddress: null, shippingAddress: { fullName: "K", line1: "L", postalCode: "1000", city: "Lj", country: "SI" },
      subtotalCents: 1000, discountCents: 0, shippingCents: 390, totalCents: 1390, vatRatePercent: 22, vatCents: 251, currency: "EUR",
      items: [{ title: "T", sku: "S", quantity: 1, unitPriceCents: 1000 }],
    } as unknown as Parameters<typeof buildInvoiceData>[0];
    expect(buildInvoiceData(order, null, "  Hvala za zaupanje.  ").footer).toBe("Hvala za zaupanje.");
    expect(buildInvoiceData(order, null, "   ").footer).toBeNull();
    expect(buildInvoiceData(order).footer).toBeNull();
  });
});
