import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, OrderItem } from "@prisma/client";

/** Phase 9 step 4 (CRD Art. 8(7)): the legal block and the three PDFs survive an operator override. */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { emailTemplate: { findUnique: mocks.findUnique } } }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mocks.sendMail }) } }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ EMAIL_FROM: "Nasmeh.si <no-reply@nasmeh.test>", SMTP_HOST: "localhost", SMTP_PORT: 1025, AUTH_SECRET: "x".repeat(32) }) }));

import { sendOrderConfirmationEmail, type OrderConfirmationContent } from "@/lib/email/mailer";
import { EMAIL_TEMPLATE_DEFS, unknownPlaceholders } from "@/lib/email/template-defs";
import { renderSample } from "@/lib/email/templates/render";
import { returns } from "@/lib/copy/returns";

const order = {
  id: "order-1", number: "NS-2026-00042", email: "kupec@test.si", totalCents: 3989, shippingCents: 490, shippingMethod: "GLS — paketna dostava",
  items: [{ id: "i1", title: "Belilni trakci <b>", quantity: 1, unitPriceCents: 3499 }],
} as unknown as Order & { items: OrderItem[] };

const content = (overrides: Partial<OrderConfirmationContent> = {}): OrderConfirmationContent => ({
  invoicePdf: Buffer.from("invoice"),
  withdrawalFormPdf: Buffer.from("withdrawal"),
  legalTextsPdf: Buffer.from("legal"),
  estimate: "2–3 delovni dnevi",
  legal: {
    seller: { name: "Nasmeh & Co, d.o.o.", address: "Čopova 1, 1000 Ljubljana", registrationNumber: "1234567000", vatId: "SI12345678", email: "info@nasmeh.si", phone: "+386 (1) 234-56-78" },
    links: { terms: "https://nasmeh.test/pogoji-poslovanja", withdrawal: "https://nasmeh.test/odstop-od-pogodbe", complaints: "https://nasmeh.test/reklamacije", guarantee: "https://nasmeh.test/garancija-vracila-denarja" },
    accepted: { terms: "b".repeat(64), withdrawal: null },
  },
  ...overrides,
});

function sent() {
  return mocks.sendMail.mock.calls[0][0] as { html: string; subject: string; attachments: Array<{ filename: string; content: Buffer }> };
}

function expectLegalBlock(html: string) {
  expect(html).toContain("data-order-legal");
  expect(html).toContain("Nasmeh &amp; Co, d.o.o.");
  expect(html).toContain("Čopova 1, 1000 Ljubljana");
  expect(html).toContain("Matična številka: 1234567000 · ID za DDV: SI12345678");
  expect(html).toContain(`href="mailto:info@nasmeh.si"`);
  expect(html).toContain(`href="tel:+38612345678"`);
  expect(html).toContain("v 14 dneh od prevzema blaga");
  expect(html).toContain(returns.withdrawal.success.statutory);
  expect(html).toContain(`href="https://nasmeh.test/pogoji-poslovanja"`);
  expect(html).toContain(`href="https://nasmeh.test/odstop-od-pogodbe"`);
  expect(html).toContain(`href="https://nasmeh.test/reklamacije"`);
  expect(html).toContain(`href="https://nasmeh.test/garancija-vracila-denarja"`);
  expect(html).toContain(`(SHA-256) ${"b".repeat(64)}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue(null);
  mocks.sendMail.mockResolvedValue({});
});

describe("sendOrderConfirmationEmail", () => {
  it("renders the code template with the method's estimate, the legal block and three PDF attachments", async () => {
    await sendOrderConfirmationEmail(order, content());
    const mail = sent();
    expect(mail.subject).toBe("Potrditev naročila NS-2026-00042 — Nasmeh.si");
    expect(mail.html).toContain("Predviden rok dostave: 2–3 delovni dnevi.");
    expect(mail.html).not.toContain("2–4");
    expect(mail.html).toContain("Belilni trakci &lt;b&gt;");
    expectLegalBlock(mail.html);
    expect(mail.attachments.map((attachment) => attachment.filename)).toEqual([
      "racun-NS-2026-00042.pdf", returns.withdrawalPdf.filename, "pogoji-in-odstop-NS-2026-00042.pdf",
    ]);
    expect(mail.attachments.map((attachment) => attachment.content.toString())).toEqual(["invoice", "withdrawal", "legal"]);
  });

  it("appends the legal block to an operator override that leaves it out, and falls back to a note without days", async () => {
    mocks.findUnique.mockResolvedValue({ key: "orderConfirmation", subject: "Hvala {{orderNumber}}", bodyHtml: "<h1>Hvala</h1>{{items}}<p>{{deliveryNote}}|{{estimate}}</p>" });
    await sendOrderConfirmationEmail(order, content({ estimate: null, legal: { ...content().legal, accepted: { terms: null, withdrawal: null } } }));
    const mail = sent();
    expect(mail.subject).toBe("Hvala NS-2026-00042");
    expect(mail.html).toContain("<p>Ob odpošiljanju prejmete sporočilo s številko sledenja.|</p>");
    expect(mail.html.indexOf("<h1>Hvala</h1>")).toBeLessThan(mail.html.indexOf("data-order-legal"));
    expect(mail.html).not.toContain("SHA-256");
    expect(mail.attachments).toHaveLength(3);
    const { html } = mail;
    expect(html).toContain(`href="mailto:info@nasmeh.si"`);
    expect(html).toContain("Pravica do odstopa od pogodbe");
  });

  it("omits the telephone line when the company has none", async () => {
    await sendOrderConfirmationEmail(order, content({ legal: { ...content().legal, seller: { ...content().legal.seller, phone: "" } } }));
    expect(sent().html).not.toContain("tel:");
  });

  it("links a '+386 (0)1' number without the trunk zero and shows it as typed (S7)", async () => {
    await sendOrderConfirmationEmail(order, content({ legal: { ...content().legal, seller: { ...content().legal.seller, phone: "+386 (0)1 234 56 78" } } }));
    expect(sent().html).toContain(`<a href="tel:+38612345678" style="color:rgb(0,122,255);word-break:break-all;">+386 (0)1 234 56 78</a>`);
  });

  it("puts the delivery sentence into the required block when an override leaves {{deliveryNote}} out, once (U6)", async () => {
    mocks.findUnique.mockResolvedValue({ key: "orderConfirmation", subject: "Hvala {{orderNumber}}", bodyHtml: "<h1>Hvala</h1>{{items}}" });
    await sendOrderConfirmationEmail(order, content());
    const { html } = sent();
    const note = "Predviden rok dostave: 2–3 delovni dnevi.";
    expect(html.split(note)).toHaveLength(2);
    expect(html.indexOf(note)).toBeGreaterThan(html.indexOf("data-order-legal"));
    expect(html).toContain("<h2 style=\"font-size:1rem;font-weight:500;margin:1.25rem 0 0.25rem;\">Dostava</h2>");
  });

  it("does not repeat the delivery sentence when the override shows {{deliveryNote}}, but does when it is only in an attribute or a comment", async () => {
    const note = "Predviden rok dostave: 2–3 delovni dnevi.";
    mocks.findUnique.mockResolvedValue({ key: "orderConfirmation", subject: "Hvala", bodyHtml: "<p>{{deliveryNote}}</p>" });
    await sendOrderConfirmationEmail(order, content());
    expect(sent().html.split(note)).toHaveLength(2);
    expect(sent().html.indexOf(note)).toBeLessThan(sent().html.indexOf("data-order-legal"));
    expect(sent().html).not.toContain(">Dostava</h2>");

    for (const bodyHtml of [`<p title="{{deliveryNote}}">Hvala</p>`, `<p>Hvala</p><!-- {{deliveryNote}} -->`]) {
      mocks.sendMail.mockClear();
      mocks.findUnique.mockResolvedValue({ key: "orderConfirmation", subject: "Hvala", bodyHtml });
      await sendOrderConfirmationEmail(order, content());
      const { html } = sent();
      expect(html.slice(html.indexOf("data-order-legal")), bodyHtml).toContain(note);
    }
  });

  it("keeps the legal block visible under hostile override markup (U8)", async () => {
    for (const bodyHtml of [
      "<h1>Hvala</h1><!-- ",
      "<h1>Hvala</h1><div style=\"display:none\">",
      "<style>[data-order-legal]{display:none} div{display:none!important}</style><h1>Hvala</h1>",
      "<h1>Hvala</h1><title>",
      "<head><style>*{visibility:hidden}</style></head><h1>Hvala</h1>",
      "<h1>Hvala</h1><table><tr><td style=\"font-size:0;opacity:0;height:0;overflow:hidden\">",
      "<h1>Hvala</h1></td></tr></tbody></table><div style=\"position:absolute;top:-9999px\">",
    ]) {
      mocks.sendMail.mockClear();
      mocks.findUnique.mockResolvedValue({ key: "orderConfirmation", subject: "Hvala", bodyHtml });
      await sendOrderConfirmationEmail(order, content());
      const { html } = sent();
      const block = html.indexOf("<div data-order-legal");
      expect(block, bodyHtml).toBeGreaterThan(0);
      const before = html.slice(html.indexOf("<td style=\"background-color:rgb(255,255,255)"), block);
      expect(before, bodyHtml).toContain("<h1>Hvala</h1>");
      expect(before, bodyHtml).not.toMatch(/<!--|<style|<title|<head|display:none|visibility|opacity|overflow|position|font-size:0|height:0/);
      expect(before.match(/<(div|td|table|tr)\b/g)?.length ?? 0, bodyHtml).toBe((before.match(/<\/(div|td|table|tr)>/g)?.length ?? 0) + 1);
      expectLegalBlock(html);
    }
  });

  it("gives the legal block a random attribute name per render, so no stable selector exists", async () => {
    await sendOrderConfirmationEmail(order, content());
    await sendOrderConfirmationEmail(order, content());
    const markers = mocks.sendMail.mock.calls.map((call) => /<div (data-order-legal-[0-9a-f]{8})\b/.exec((call[0] as { html: string }).html)?.[1]);
    expect(markers[0]).toMatch(/^data-order-legal-[0-9a-f]{8}$/);
    expect(markers[1]).toMatch(/^data-order-legal-[0-9a-f]{8}$/);
    expect(markers[0]).not.toBe(markers[1]);
    expect((mocks.sendMail.mock.calls[0][0] as { html: string }).html).not.toMatch(/data-order-legal[\s=>]/);
  });
});

describe("orderConfirmation template definition", () => {
  it("offers the delivery placeholders and no longer hard-codes a day count", () => {
    const def = EMAIL_TEMPLATE_DEFS.orderConfirmation;
    expect(def.defaultBody).not.toContain("2–4");
    expect(def.defaultBody).toContain("{{deliveryNote}}");
    expect(unknownPlaceholders("orderConfirmation", def.defaultSubject, def.defaultBody)).toEqual([]);
    expect(renderSample("orderConfirmation", null, null).html).toContain("Predviden rok dostave: 2–3 delovni dnevi.");
  });

  it("tells the operator that the delivery time is added when the template leaves it out", () => {
    const def = EMAIL_TEMPLATE_DEFS.orderConfirmation;
    expect(def.description).toContain("Rok dostave (če ga predloga ne prikaže z {{deliveryNote}})");
    expect(def.placeholders.find((placeholder) => placeholder.name === "deliveryNote")?.description).toContain("obvezni del");
  });

  it("previews and test-sends the required legal block with sample data (X11)", () => {
    const sample = renderSample("orderConfirmation", "Hvala", "<h1>Hvala</h1>");
    expect(sample.html).toContain("data-order-legal-");
    expect(sample.html).toContain("Pravica do odstopa od pogodbe");
    expect(sample.html).toContain("Predviden rok dostave: 2–3 delovni dnevi.");
    const withNote = renderSample("orderConfirmation", null, null).html;
    expect(withNote.split("Predviden rok dostave: 2–3 delovni dnevi.")).toHaveLength(2);
    expect(renderSample("verifySubscription", null, null).html).toContain("data-newsletter-unsubscribe");
    expect(renderSample("resetPassword", null, null).html).not.toContain("data-order-legal");
  });
});
