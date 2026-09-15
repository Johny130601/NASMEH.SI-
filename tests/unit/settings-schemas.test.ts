import { describe, expect, it } from "vitest";

/** Phase 7 step 6 (§14.12–§14.14): every Setting schema the admin validates and the storefront reads — valid, invalid, boundary. */

import {
  analyticsSchema, buildTrackingUrl, companySchema, consentBannerSchema, consentCookiesSchema, consentVersionSchema, contactSettingsSchema,
  DEFAULT_LEGAL_LINKS, googleVerificationSchema, invoiceFooterSchema, isValidTrackingTemplate, legalLinksSchema, maintenanceSchema, maintenanceStoredSchema, seoDefaultsSchema,
  shippingSettingsSchema, sitePathSchema, trackingTemplatesSchema, vatRateSchema,
} from "@/lib/settings-schemas";

const method = { id: "gls", carrier: "GLS", label: "GLS — paketna dostava", priceCents: 490, estimate: "2–3 delovni dnevi", countries: ["SI", "AT"] };

describe("shipping settings", () => {
  it("accepts methods with countries and thresholds; refuses duplicates, bad ids, unknown countries and empty lists", () => {
    const valid = { methods: [method, { ...method, id: "PS-Standard", carrier: "Pošta Slovenije", countries: ["SI"] }], freeThresholdCents: 4500, standardCostCents: 390 };
    const parsed = shippingSettingsSchema.parse(valid);
    expect(parsed.methods[1].id).toBe("ps-standard");
    expect(shippingSettingsSchema.safeParse({ ...valid, methods: [method, method] }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, methods: [] }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, methods: [{ ...method, id: "g" }] }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, methods: [{ ...method, countries: ["US"] }] }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, methods: [{ ...method, countries: [] }] }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, methods: [{ ...method, priceCents: 4.9 }] }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, methods: [{ ...method, priceCents: -1 }] }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, methods: [{ ...method, label: "" }] }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, freeThresholdCents: Number.NaN }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, standardCostCents: 100_001 }).success).toBe(false);
    expect(shippingSettingsSchema.safeParse({ ...valid, freeThresholdCents: 0, standardCostCents: 0 }).success).toBe(true);
  });

  it("tracking templates must be https without credentials and carry {number}; empty means no link", () => {
    expect(isValidTrackingTemplate("https://gls-group.eu/SI/sl/sledenje?match={number}")).toBe(true);
    expect(isValidTrackingTemplate("http://gls-group.eu/?match={number}")).toBe(false);
    expect(isValidTrackingTemplate("https://user:pw@gls-group.eu/?match={number}")).toBe(false);
    expect(isValidTrackingTemplate("https://gls-group.eu/track")).toBe(false);
    expect(isValidTrackingTemplate("javascript:alert({number})")).toBe(false);
    expect(buildTrackingUrl("https://x.si/t?n={number}&x={number}", "AB 12/3")).toBe("https://x.si/t?n=AB%2012%2F3&x=AB%2012%2F3");
    expect(buildTrackingUrl(undefined, "123")).toBeNull();
    expect(buildTrackingUrl("http://x.si/{number}", "123")).toBeNull();
    expect(trackingTemplatesSchema.parse({ ps: "", gls: " https://x.si/{number} " })).toEqual({ ps: "", gls: "https://x.si/{number}" });
    expect(trackingTemplatesSchema.safeParse({ ps: "https://x.si/", gls: "" }).success).toBe(false);
    expect(trackingTemplatesSchema.safeParse({ ps: "" }).success).toBe(false);
  });
});

describe("tax, company, invoice", () => {
  it("bounds the VAT rate to whole percents within 0–100 (the pricing helper refuses fractions)", () => {
    for (const rate of [0, 9, 22, 100]) expect(vatRateSchema.safeParse(rate).success, String(rate)).toBe(true);
    for (const rate of [-1, 101, 9.5, 22.25, Number.NaN, "22"]) expect(vatRateSchema.safeParse(rate).success, String(rate)).toBe(false);
  });

  it("company needs every field, an EU VAT id and an e-mail; the invoice footer is optional text", () => {
    const company = { name: " Nasmeh.si, d.o.o. ", address: "Trg 1, 1000 Ljubljana", registrationNumber: "1234567000", vatId: "si12345678", email: "Info@Nasmeh.si" };
    expect(companySchema.parse(company)).toEqual({ ...company, name: "Nasmeh.si, d.o.o.", vatId: "SI12345678", email: "info@nasmeh.si" });
    expect(companySchema.safeParse({ ...company, vatId: "12345678" }).success).toBe(false);
    expect(companySchema.safeParse({ ...company, email: "info" }).success).toBe(false);
    expect(companySchema.safeParse({ ...company, address: "" }).success).toBe(false);
    expect(invoiceFooterSchema.parse("  ")).toBe("");
    expect(invoiceFooterSchema.safeParse("x".repeat(601)).success).toBe(false);
  });
});

describe("marketing, SEO, consent, legal, maintenance, support", () => {
  it("analytics ids follow their provider formats or stay empty", () => {
    expect(analyticsSchema.parse({ gtmId: "GTM-ABC123", ga4Id: "", metaPixelId: "123456789012345", tiktokPixelId: "C1234567890ABCDEF" })).toMatchObject({ gtmId: "GTM-ABC123", ga4Id: "" });
    expect(analyticsSchema.safeParse({ gtmId: "UA-1", ga4Id: "", metaPixelId: "", tiktokPixelId: "" }).success).toBe(false);
    expect(analyticsSchema.safeParse({ gtmId: "", ga4Id: "GTM-X", metaPixelId: "", tiktokPixelId: "" }).success).toBe(false);
    expect(analyticsSchema.safeParse({ gtmId: "", ga4Id: "", metaPixelId: "abc", tiktokPixelId: "" }).success).toBe(false);
    expect(googleVerificationSchema.safeParse("abcDEF123-_x").success).toBe(true);
    expect(googleVerificationSchema.safeParse("<meta>").success).toBe(false);
    expect(googleVerificationSchema.safeParse("").success).toBe(true);
  });

  it("SEO defaults need %s in the title template and an explicit index switch", () => {
    expect(seoDefaultsSchema.parse({ titleTemplate: " %s | Nasmeh ", description: "", indexable: false })).toEqual({ titleTemplate: "%s | Nasmeh", description: "", indexable: false });
    expect(seoDefaultsSchema.safeParse({ titleTemplate: "Nasmeh", description: "", indexable: true }).success).toBe(false);
    expect(seoDefaultsSchema.safeParse({ titleTemplate: "%s", description: "x".repeat(321), indexable: true }).success).toBe(false);
  });

  it("consent: version is a positive integer, rows need every field and a known category, banner copy may be empty", () => {
    expect(consentVersionSchema.safeParse(1).success).toBe(true);
    expect(consentVersionSchema.safeParse(0).success).toBe(false);
    expect(consentVersionSchema.safeParse(1.5).success).toBe(false);
    const row = { name: "_ga", provider: "Google", purpose: "Statistika", duration: "2 leti", category: "analytics" };
    expect(consentCookiesSchema.safeParse([row]).success).toBe(true);
    expect(consentCookiesSchema.safeParse([{ ...row, category: "ads" }]).success).toBe(false);
    expect(consentCookiesSchema.safeParse([{ ...row, name: "" }]).success).toBe(false);
    expect(consentCookiesSchema.safeParse(Array.from({ length: 51 }, () => row)).success).toBe(false);
    expect(consentBannerSchema.parse({ title: "", body: " " })).toEqual({ title: "", body: "" });
  });

  it("legal links are same-site paths for all four keys; a stored row with the retired complaints key still parses", () => {
    expect(legalLinksSchema.parse(DEFAULT_LEGAL_LINKS)).toEqual(DEFAULT_LEGAL_LINKS);
    expect(Object.keys(DEFAULT_LEGAL_LINKS)).toEqual(["terms", "privacy", "cookies", "withdrawal"]);
    expect(legalLinksSchema.parse({ ...DEFAULT_LEGAL_LINKS, complaints: "/reklamacije" })).toEqual(DEFAULT_LEGAL_LINKS);
    expect(legalLinksSchema.safeParse({ ...DEFAULT_LEGAL_LINKS, terms: "https://x.si/pogoji" }).success).toBe(false);
    expect(legalLinksSchema.safeParse({ ...DEFAULT_LEGAL_LINKS, terms: "//x" }).success).toBe(false);
    expect(legalLinksSchema.safeParse({ terms: "/a", privacy: "/b" }).success).toBe(false);
    expect(sitePathSchema.safeParse("/pogoji?x=1#top").success).toBe(true);
  });

  it("maintenance: a new password is optional but at least 4 characters; the stored shape carries only a hash", () => {
    expect(maintenanceSchema.safeParse({ enabled: false, password: "", message: "" }).success).toBe(true);
    expect(maintenanceSchema.safeParse({ enabled: true, password: "", message: "" }).success).toBe(true); // the action checks for a stored hash
    expect(maintenanceSchema.safeParse({ enabled: true, password: "abc", message: "" }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ enabled: true, password: "abcd", message: "Kmalu nazaj" }).success).toBe(true);
    expect(maintenanceStoredSchema.parse({ enabled: true, passwordHash: "$2a$10$hash", message: "x", password: "plain" })).toEqual({ enabled: true, passwordHash: "$2a$10$hash", message: "x" });
    expect(maintenanceStoredSchema.safeParse({ enabled: "yes" }).success).toBe(false);
  });

  it("contact settings keep the Phase 6 strict shape", () => {
    const contact = { supportEmail: "Podpora@Nasmeh.si", complianceEmail: "skladnost@nasmeh.si", hours: "Pon–pet 9–16", responseTime: "V 2 delovnih dneh" };
    expect(contactSettingsSchema.parse(contact).supportEmail).toBe("podpora@nasmeh.si");
    expect(contactSettingsSchema.safeParse({ ...contact, extra: 1 }).success).toBe(false);
    expect(contactSettingsSchema.safeParse({ ...contact, hours: "" }).success).toBe(false);
  });
});
