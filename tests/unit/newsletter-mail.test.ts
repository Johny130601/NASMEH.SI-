import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 9 step 4 (GDPR Art. 7(3)): every newsletter verification mail carries the signed withdrawal link. */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { emailTemplate: { findUnique: mocks.findUnique } } }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mocks.sendMail }) } }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ EMAIL_FROM: "Nasmeh.si <no-reply@nasmeh.test>", SMTP_HOST: "localhost", SMTP_PORT: 1025, AUTH_SECRET: "unit-mail-secret" }) }));

import { sendSubscriptionVerification } from "@/lib/email/mailer";
import { newsletterUnsubscribePath } from "@/lib/newsletter/unsubscribe-token";

const SUBSCRIBER_ID = "cmf0newslettersubscriber1";
const TOKEN = "c".repeat(48);
const unsubscribeUrl = `https://nasmeh.example${newsletterUnsubscribePath(SUBSCRIBER_ID, "unit-mail-secret")}`;

function sentHtml(): string {
  return (mocks.sendMail.mock.calls[0][0] as { html: string }).html;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue(null);
});

describe("sendSubscriptionVerification", () => {
  it("renders the confirm link and the withdrawal link in the code template exactly once", async () => {
    await sendSubscriptionVerification("ana@test.si", TOKEN, SUBSCRIBER_ID);
    const html = sentHtml();
    expect(html).toContain(`https://nasmeh.example/potrdi/${TOKEN}`);
    expect(html.split(unsubscribeUrl)).toHaveLength(2);
    expect(html).toContain("Odjava od e-novic");
  });

  it("appends the withdrawal link to an operator override that does not contain it", async () => {
    mocks.findUnique.mockResolvedValue({ key: "verifySubscription", subject: "Potrdite — Nasmeh.si", bodyHtml: "<p>Kliknite {{confirmUrl}}</p>" });
    await sendSubscriptionVerification("ana@test.si", TOKEN, SUBSCRIBER_ID);
    const html = sentHtml();
    expect(html).toContain(`<p>Kliknite https://nasmeh.example/potrdi/${TOKEN}</p>`);
    expect(html).toContain(unsubscribeUrl);
    expect(html.indexOf(unsubscribeUrl)).toBeGreaterThan(html.indexOf("Kliknite"));
  });
});
