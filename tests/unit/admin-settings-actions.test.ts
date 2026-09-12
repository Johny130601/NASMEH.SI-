import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 7 step 6: direct action calls for the settings screens — only OWNER holds settings:manage; every write is validated. */

const mocks = vi.hoisted(() => ({ auth: vi.fn(), revalidate: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => ({ db: { setting: { upsert: mocks.upsert, findUnique: mocks.findUnique } } }));

import {
  bumpConsentVersionAction, saveAnalyticsAction, saveCompanyAction, saveConsentConfigAction, saveContactSettingsAction, saveGoogleVerificationAction,
  saveInvoiceFooterAction, saveLegalLinksAction, saveMaintenanceAction, saveSeoDefaultsAction, saveShippingAction, saveTrackingTemplatesAction, saveVatRateAction,
} from "@/app/admin/(shell)/nastavitve/actions";
import { DEFAULT_LEGAL_LINKS } from "@/lib/settings-schemas";

const session = (role: string, mfaEnrolled = true) => ({ user: { id: `cmf0${role.toLowerCase()}00000000000000001`, email: `${role.toLowerCase()}@nasmeh.si`, name: role, role, mfaEnrolled } });
const method = { id: "GLS", carrier: "GLS", label: "GLS — paketna dostava", priceCents: 490, estimate: "2–3 dni", countries: ["SI", "HR"] };
const company = { name: "Nasmeh d.o.o.", address: "Trg 1, Ljubljana", registrationNumber: "123", vatId: "si12345678", email: "Info@Nasmeh.si" };
const contact = { supportEmail: "podpora@nasmeh.si", complianceEmail: "skladnost@nasmeh.si", hours: "Pon–pet", responseTime: "2 dni" };
const cookie = { name: "_ga", provider: "Google", purpose: "Statistika", duration: "2 leti", category: "analytics" as const };

const actions: Array<[string, () => Promise<unknown>]> = [
  ["saveShippingAction", () => saveShippingAction({ methods: [method], freeThresholdCents: 4500, standardCostCents: 390 })],
  ["saveTrackingTemplatesAction", () => saveTrackingTemplatesAction({ ps: "", gls: "https://gls.example/{number}" })],
  ["saveVatRateAction", () => saveVatRateAction({ ratePercent: 22 })],
  ["saveCompanyAction", () => saveCompanyAction(company)],
  ["saveInvoiceFooterAction", () => saveInvoiceFooterAction({ footer: "Hvala" })],
  ["saveAnalyticsAction", () => saveAnalyticsAction({ gtmId: "GTM-ABC123", ga4Id: "", metaPixelId: "", tiktokPixelId: "" })],
  ["saveGoogleVerificationAction", () => saveGoogleVerificationAction({ token: "abcdefgh123" })],
  ["saveSeoDefaultsAction", () => saveSeoDefaultsAction({ titleTemplate: "%s | N", description: "", indexable: true })],
  ["saveConsentConfigAction", () => saveConsentConfigAction({ cookies: [cookie], banner: { title: "", body: "" } })],
  ["bumpConsentVersionAction", () => bumpConsentVersionAction()],
  ["saveLegalLinksAction", () => saveLegalLinksAction(DEFAULT_LEGAL_LINKS)],
  ["saveMaintenanceAction", () => saveMaintenanceAction({ enabled: false, password: "", message: "" })],
  ["saveContactSettingsAction", () => saveContactSettingsAction(contact)],
];

const written = () => Object.fromEntries(mocks.upsert.mock.calls.map((call) => [call[0].where.key, call[0].update.value]));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(session("OWNER"));
  mocks.upsert.mockResolvedValue({});
  mocks.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (where.key === "consent.version" ? { key: where.key, value: 4 } : null));
});

describe("settings actions: permission boundary", () => {
  it("OWNER holds settings:manage; MANAGER, SUPPORT, FULFILLMENT, customers, anonymous and unenrolled callers are refused before any write", async () => {
    for (const [name, run] of actions) expect(await run(), `OWNER ${name}`).toEqual(expect.objectContaining({ ok: true }));
    const count = mocks.upsert.mock.calls.length;
    expect(count).toBeGreaterThanOrEqual(actions.length);
    for (const role of ["MANAGER", "SUPPORT", "FULFILLMENT", "CUSTOMER"]) {
      mocks.auth.mockResolvedValue(session(role));
      for (const [name, run] of actions) await expect(run(), `${role} ${name}`).rejects.toThrow("forbidden");
    }
    mocks.auth.mockResolvedValue(null);
    for (const [name, run] of actions) await expect(run(), `anonymous ${name}`).rejects.toThrow("forbidden");
    mocks.auth.mockResolvedValue(session("OWNER", false));
    for (const [name, run] of actions) await expect(run(), `unenrolled ${name}`).rejects.toThrow("mfa_required");
    expect(mocks.upsert.mock.calls.length).toBe(count);
  });
});

describe("settings actions: validation and stored shapes", () => {
  it("shipping writes the three keys with normalised methods; tracking drops empty templates", async () => {
    expect(await saveShippingAction({ methods: [method], freeThresholdCents: 9900, standardCostCents: 250 })).toEqual({ ok: true });
    expect(written()).toEqual({
      "shipping.methods": [{ id: "gls", carrier: "GLS", label: "GLS — paketna dostava", priceCents: 490, estimate: "2–3 dni", countries: ["SI", "HR"] }],
      "shipping.freeThresholdCents": 9900,
      "shipping.standardCostCents": 250,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    mocks.upsert.mockClear();
    expect(await saveShippingAction({ methods: [method, method], freeThresholdCents: 1, standardCostCents: 1 })).toEqual({ ok: false, error: "invalid" });
    expect(await saveShippingAction({ methods: [{ ...method, countries: ["XX"] }], freeThresholdCents: 1, standardCostCents: 1 })).toEqual({ ok: false, error: "invalid" });
    expect(await saveTrackingTemplatesAction({ ps: "", gls: "https://gls.example/{number}" })).toEqual({ ok: true });
    expect(written()).toEqual({ "tracking.templates": { gls: "https://gls.example/{number}" } });
    expect(await saveTrackingTemplatesAction({ ps: "http://x/{number}", gls: "" })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("VAT, company, footer, analytics, verification and SEO defaults validate before writing", async () => {
    expect(await saveVatRateAction({ ratePercent: 101 })).toEqual({ ok: false, error: "invalid" });
    expect(await saveVatRateAction({ ratePercent: 9.5 })).toEqual({ ok: false, error: "invalid" });
    expect(await saveVatRateAction({ ratePercent: 9 })).toEqual({ ok: true });
    expect(await saveCompanyAction({ ...company, vatId: "123" })).toEqual({ ok: false, error: "invalid" });
    expect(await saveCompanyAction(company)).toEqual({ ok: true });
    expect(await saveInvoiceFooterAction({ footer: "x".repeat(601) })).toEqual({ ok: false, error: "invalid" });
    expect(await saveInvoiceFooterAction({ footer: " Hvala " })).toEqual({ ok: true });
    expect(await saveAnalyticsAction({ gtmId: "UA-1", ga4Id: "", metaPixelId: "", tiktokPixelId: "" })).toEqual({ ok: false, error: "invalid" });
    expect(await saveAnalyticsAction({ gtmId: "GTM-ABC123", ga4Id: "G-ABCDEF", metaPixelId: "1234567", tiktokPixelId: "" })).toEqual({ ok: true });
    expect(await saveGoogleVerificationAction({ token: "<meta>" })).toEqual({ ok: false, error: "invalid" });
    expect(await saveSeoDefaultsAction({ titleTemplate: "Nasmeh", description: "", indexable: true })).toEqual({ ok: false, error: "invalid" });
    expect(await saveSeoDefaultsAction({ titleTemplate: "%s · N", description: "Opis", indexable: false })).toEqual({ ok: true });
    expect(written()).toMatchObject({
      "vat.ratePercent": 9, company: { name: "Nasmeh d.o.o.", vatId: "SI12345678", email: "info@nasmeh.si" }, "invoice.footer": "Hvala",
      "analytics.gtmId": "GTM-ABC123", "analytics.ga4Id": "G-ABCDEF", "analytics.metaPixelId": "1234567", "analytics.tiktokPixelId": "",
      "seo.defaults": { titleTemplate: "%s · N", description: "Opis", indexable: false },
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/robots.txt");
  });

  it("consent config, version bump, legal links, maintenance and contact settings", async () => {
    expect(await saveConsentConfigAction({ cookies: [{ ...cookie, category: "ads" as never }], banner: { title: "", body: "" } })).toEqual({ ok: false, error: "invalid" });
    expect(await saveConsentConfigAction({ cookies: [cookie], banner: { title: "Piškotki", body: "" } })).toEqual({ ok: true });
    expect(await bumpConsentVersionAction()).toEqual({ ok: true, version: 5 });
    expect(await saveLegalLinksAction({ ...DEFAULT_LEGAL_LINKS, terms: "https://x" })).toEqual({ ok: false, error: "invalid" });
    expect(await saveLegalLinksAction({ ...DEFAULT_LEGAL_LINKS, terms: "/pogoji-2026" })).toEqual({ ok: true });
    expect(await saveMaintenanceAction({ enabled: true, password: "", message: "" })).toEqual({ ok: false, error: "invalid" }); // no stored hash
    expect(await saveMaintenanceAction({ enabled: true, password: "geslo123", message: "Kmalu" })).toEqual({ ok: true });
    const stored = written().maintenance as { enabled: boolean; passwordHash?: string; message: string };
    expect(stored.enabled).toBe(true);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored).not.toHaveProperty("password");
    mocks.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (where.key === "maintenance" ? { key: where.key, value: { enabled: false, passwordHash: "$2a$10$existing" } } : null));
    expect(await saveMaintenanceAction({ enabled: true, password: "", message: "Ohrani" })).toEqual({ ok: true }); // blank keeps the stored hash
    expect(written().maintenance).toEqual({ enabled: true, passwordHash: "$2a$10$existing", message: "Ohrani" });
    expect(await saveContactSettingsAction({ ...contact, supportEmail: "nope" })).toEqual({ ok: false, error: "invalid" });
    expect(await saveContactSettingsAction(contact)).toEqual({ ok: true });
    expect(written()).toMatchObject({
      "consent.cookies": [cookie], "consent.banner": { title: "Piškotki", body: "" }, "consent.version": 5,
      "legal.links": { ...DEFAULT_LEGAL_LINKS, terms: "/pogoji-2026" }, "support.contact": contact,
    });
  });
});
