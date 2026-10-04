import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA 2026-10-03 BIS-UNSUB (legal checklist MK-7): the back-in-stock
 * confirmation mail carries the signed one-click withdrawal link, so an alert
 * can be withdrawn before it fires — and an operator override cannot drop it.
 */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { emailTemplate: { findUnique: mocks.findUnique } } }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mocks.sendMail }) } }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ EMAIL_FROM: "Nasmeh.si <no-reply@nasmeh.test>", SMTP_HOST: "localhost", SMTP_PORT: 1025, AUTH_SECRET: "unit-mail-secret" }) }));

import { sendBackInStockVerification } from "@/lib/email/mailer";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";

const SUBSCRIPTION_ID = "cmf0backinstocksubscript1";
const TOKEN = "d".repeat(48);
const unsubscribeUrl = `https://nasmeh.example/odjava-zaloga/${signUnsubscribeToken(SUBSCRIPTION_ID, "unit-mail-secret")}`;

function sentHtml(): string {
  return (mocks.sendMail.mock.calls[0][0] as { html: string }).html;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue(null);
});

describe("sendBackInStockVerification", () => {
  it("renders the confirm link and a withdrawal link for this subscription exactly once", async () => {
    await sendBackInStockVerification("ana@test.si", TOKEN, "Belilni <trakci>", SUBSCRIPTION_ID);
    const html = sentHtml();
    expect(html).toContain(`https://nasmeh.example/potrdi-zalogo/${TOKEN}`);
    expect(html.split(unsubscribeUrl)).toHaveLength(2);
    expect(verifyUnsubscribeToken(unsubscribeUrl.split("/").pop()!, "unit-mail-secret")).toBe(SUBSCRIPTION_ID);
    // the product title is operator data: escaped, never markup
    expect(html).toContain("Belilni &lt;trakci&gt;");
  });

  it("appends the withdrawal link to an operator override that does not contain it", async () => {
    mocks.findUnique.mockResolvedValue({ key: "backInStockConfirm", subject: "Potrdite — Nasmeh.si", bodyHtml: "<p>Kliknite {{confirmUrl}}</p>" });
    await sendBackInStockVerification("ana@test.si", TOKEN, "Belilni trakci", SUBSCRIPTION_ID);
    const html = sentHtml();
    expect(html).toContain(`<p>Kliknite https://nasmeh.example/potrdi-zalogo/${TOKEN}</p>`);
    expect(html).toContain(unsubscribeUrl);
    expect(html.indexOf(unsubscribeUrl)).toBeGreaterThan(html.indexOf("Kliknite"));
  });
});
