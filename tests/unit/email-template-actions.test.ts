import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 9 step 4 review (U8, X11): overrides are stored sanitized, and the test send shows the required block. */

const mocks = vi.hoisted(() => ({ auth: vi.fn(), revalidate: vi.fn(), sendMail: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/email/mailer", () => ({ sendMail: mocks.sendMail }));
vi.mock("@/lib/db", () => ({ db: { emailTemplate: { upsert: mocks.upsert, deleteMany: mocks.deleteMany, findUnique: mocks.findUnique } } }));

import { saveEmailTemplateAction, sendTestEmailAction } from "@/app/admin/(shell)/e-posta/actions";

const manager = { user: { id: "cmf0manager0000000000001", email: "manager@nasmeh.si", name: "Manager", role: "MANAGER", mfaEnrolled: true } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(manager);
  mocks.upsert.mockResolvedValue({});
  mocks.sendMail.mockResolvedValue({});
});

describe("saveEmailTemplateAction", () => {
  it("stores the sanitized body: no comment, style, title or hiding style survives, open tags are closed", async () => {
    const bodyHtml = `<style>[data-order-legal]{display:none}</style><h1 class="x">Hvala</h1>{{items}}<div style="display:none;color:red"><p>{{deliveryNote}}<!-- skrito`;
    expect(await saveEmailTemplateAction({ key: "orderConfirmation", subject: "Hvala {{orderNumber}}", bodyHtml })).toEqual({ ok: true });
    const stored = mocks.upsert.mock.calls[0][0].update.bodyHtml as string;
    expect(stored).toBe(`<h1>Hvala</h1>{{items}}<div style="color:red;"><p>{{deliveryNote}}</p></div>`);
    expect(mocks.upsert.mock.calls[0][0].create.bodyHtml).toBe(stored);
  });

  it("refuses a body with nothing left after sanitizing, and still checks placeholders", async () => {
    expect(await saveEmailTemplateAction({ key: "resetPassword", subject: "Geslo", bodyHtml: "<style>p{}</style><!-- {{resetUrl}} -->" })).toEqual({ ok: false, error: "invalid" });
    expect(await saveEmailTemplateAction({ key: "resetPassword", subject: "Geslo", bodyHtml: "<p>{{resetUrl}} {{kupec}}</p>" })).toEqual({ ok: false, error: "unknownPlaceholders", names: ["kupec"] });
    // A placeholder that exists only inside a removed comment is not flagged: it is not stored.
    expect(await saveEmailTemplateAction({ key: "resetPassword", subject: "Geslo", bodyHtml: "<p>{{resetUrl}}</p><!-- {{kupec}} -->" })).toEqual({ ok: true });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("refuses an override without the mail's action link (QA 2026-10-03 T6-02)", async () => {
    for (const [key, name] of [["verifySubscription", "confirmUrl"], ["verifyAccount", "confirmUrl"], ["backInStockConfirm", "confirmUrl"], ["resetPassword", "resetUrl"]] as const) {
      expect(await saveEmailTemplateAction({ key, subject: "Zadeva", bodyHtml: "<p>Brez povezave.</p>" }), key)
        .toEqual({ ok: false, error: "missingPlaceholders", names: [name] });
    }
    // a key without an action link of its own saves without one
    expect(await saveEmailTemplateAction({ key: "orderProcessing", subject: "V obdelavi {{orderNumber}}", bodyHtml: "<p>Pripravljamo.</p>" })).toEqual({ ok: true });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("test-sends the whole mail: sanitized body and the required legal block with sample data", async () => {
    expect(await sendTestEmailAction({ key: "orderConfirmation", subject: "Hvala", bodyHtml: "<h1>Hvala</h1><!--", to: "manager@nasmeh.si" })).toEqual({ ok: true });
    const { html } = mocks.sendMail.mock.calls[0][0] as { html: string };
    expect(html).toContain("<h1>Hvala</h1>");
    expect(html).not.toContain("<!--");
    expect(html).toContain("data-order-legal-");
    expect(html).toContain("Pravica do odstopa od pogodbe");
    expect(html).toContain("Predviden rok dostave: 2–3 delovni dnevi.");
  });
});
