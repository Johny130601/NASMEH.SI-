import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 7 step 5 (§14.11): placeholder rendering and escaping, unknown-placeholder rejection, override resolution. */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { emailTemplate: { findUnique: mocks.findUnique } } }));

import {
  EMAIL_TEMPLATE_DEFS, EMAIL_TEMPLATE_KEYS, findPlaceholders, isEmailTemplateKey, substitutePlaceholders, unknownPlaceholders,
} from "@/lib/email/template-defs";
import { renderEmailOverride, renderSample, renderTemplate, resolveMail } from "@/lib/email/templates/render";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue(null);
});

describe("an override without its action link is never sent (QA 2026-10-03 T6-02)", () => {
  it("falls back to the code template", async () => {
    mocks.findUnique.mockResolvedValue({ key: "resetPassword", subject: "Geslo", bodyHtml: "<p>Brez povezave.</p>" });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const mail = await resolveMail("resetPassword", { resetUrl: "https://nasmeh.si/ponastavi-geslo/x" }, () => ({ subject: "Koda", html: "<a href=\"https://nasmeh.si/ponastavi-geslo/x\">x</a>" }));
      expect(mail).toEqual({ subject: "Koda", html: "<a href=\"https://nasmeh.si/ponastavi-geslo/x\">x</a>" });
    } finally {
      log.mockRestore();
    }
  });

  it("every default body carries its own required placeholders", () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      for (const name of EMAIL_TEMPLATE_DEFS[key].requiredPlaceholders ?? []) expect(EMAIL_TEMPLATE_DEFS[key].defaultBody, key).toContain(`{{${name}}}`);
    }
  });
});

describe("template definitions", () => {
  it("cover the P1 mails, sample every placeholder and use only known placeholders in the defaults", () => {
    expect(EMAIL_TEMPLATE_KEYS).toEqual([
      "orderConfirmation", "orderShipped", "orderProcessing", "orderDelivered", "orderCancelled", "orderRefunded",
      "reviewRequest", "backInStockAlert", "backInStockConfirm", "verifySubscription", "verifyAccount", "resetPassword", "supportReceipt",
    ]);
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const def = EMAIL_TEMPLATE_DEFS[key];
      expect(def.label.length, key).toBeGreaterThan(0);
      expect(def.placeholders.length, key).toBeGreaterThan(0);
      for (const placeholder of def.placeholders) expect(Object.keys(def.sample), `${key}.${placeholder.name}`).toContain(placeholder.name);
      expect(unknownPlaceholders(key, def.defaultSubject, def.defaultBody), key).toEqual([]);
      expect(def.defaultSubject, key).toContain("Nasmeh.si");
    }
    expect(isEmailTemplateKey("orderShipped")).toBe(true);
    expect(isEmailTemplateKey("HELP")).toBe(false);
    expect(isEmailTemplateKey(42)).toBe(false);
  });

  it("finds placeholder names once each, with or without inner spaces", () => {
    expect(findPlaceholders("{{a}} and {{ b }} then {{a}} but not {{ 1x }} nor {{c d}}")).toEqual(["a", "b"]);
  });
});

describe("substitutePlaceholders", () => {
  it("escapes text values in HTML mode, inserts prepared blocks as they are and removes unknown names", () => {
    const html = substitutePlaceholders("orderConfirmation",
      "<p>{{orderNumber}} {{items}} {{ total }} {{nope}}</p>",
      { orderNumber: `NS-1 <script>alert("x")</script> & 'q'`, items: "<table><tr><td>row</td></tr></table>", total: "10,00 €" }, "html");
    expect(html).toBe(`<p>NS-1 &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39; <table><tr><td>row</td></tr></table> 10,00 € </p>`);
  });

  it("leaves text values alone in text mode but never inserts an HTML block into a subject", () => {
    expect(substitutePlaceholders("orderConfirmation", "Naročilo {{orderNumber}} <{{items}}>", { orderNumber: "NS-2 & co", items: "<b>x</b>" }, "text"))
      .toBe("Naročilo NS-2 & co <>");
  });

  it("treats a missing value as empty", () => {
    expect(substitutePlaceholders("resetPassword", "[{{resetUrl}}]", {}, "html")).toBe("[]");
  });
});

describe("unknownPlaceholders", () => {
  it("flags names the key does not provide and HTML blocks used in a subject", () => {
    expect(unknownPlaceholders("orderShipped", "{{orderNumber}} {{carrier}}", "{{trackingUrl}} {{customerName}}")).toEqual(["customerName"]);
    expect(unknownPlaceholders("reviewRequest", "{{items}} {{orderNumber}} {{x}}", "{{items}}")).toEqual(["items", "x"]);
    expect(unknownPlaceholders("supportReceipt", "{{reference}}", "{{note}} {{reference}}")).toEqual([]);
  });
});

describe("renderTemplate / renderSample", () => {
  it("collapses subject whitespace and wraps the body in the shared layout", () => {
    const mail = renderTemplate("resetPassword", "  Geslo   {{resetUrl}}\n ", "<a href=\"{{resetUrl}}\">x</a>", { resetUrl: "https://nasmeh.si/ponastavi-geslo/t?a=1&b=2" });
    expect(mail.subject).toBe("Geslo https://nasmeh.si/ponastavi-geslo/t?a=1&b=2");
    expect(mail.html.startsWith("<!doctype html>")).toBe(true);
    expect(mail.html).toContain(`<a href="https://nasmeh.si/ponastavi-geslo/t?a=1&amp;b=2">x</a>`);
  });

  it("renders the default definition with its sample values, or the given subject/body", () => {
    const sample = renderSample("orderRefunded", null, null);
    expect(sample.subject).toBe("Vračilo denarja NS-2026-00042 — Nasmeh.si");
    expect(sample.html).toContain("15,00 €");
    const custom = renderSample("orderRefunded", "Vrnili smo {{amount}}", "<p>{{orderNumber}}</p>");
    expect(custom.subject).toBe("Vrnili smo 15,00 €");
    expect(custom.html).toContain("<p>NS-2026-00042</p>");
  });
});

describe("resolveMail", () => {
  const fallback = () => ({ subject: "koda", html: "<p>koda</p>" });

  it("uses the code template when no override row exists", async () => {
    expect(await resolveMail("verifyAccount", { confirmUrl: "https://x" }, fallback)).toEqual({ subject: "koda", html: "<p>koda</p>" });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { key: "verifyAccount" } });
  });

  it("renders the stored override with live values", async () => {
    mocks.findUnique.mockResolvedValue({ key: "verifyAccount", subject: "Aktivacija {{confirmUrl}}", bodyHtml: "<a href=\"{{confirmUrl}}\">go</a>" });
    const mail = await resolveMail("verifyAccount", { confirmUrl: "https://nasmeh.si/potrdi-racun/abc" }, fallback);
    expect(mail.subject).toBe("Aktivacija https://nasmeh.si/potrdi-racun/abc");
    expect(mail.html).toContain(`<a href="https://nasmeh.si/potrdi-racun/abc">go</a>`);
    // an override carrying its key's action link renders; one without it is never sent (QA 2026-10-03 T6-02)
    mocks.findUnique.mockResolvedValue({ key: "resetPassword", subject: "Geslo", bodyHtml: "<a href=\"{{resetUrl}}\">novo geslo</a>" });
    expect(await renderEmailOverride("resetPassword", {})).not.toBeNull();
  });

  it("falls back to the code template when the override lookup fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.findUnique.mockRejectedValue(new Error("db down"));
    expect(await resolveMail("resetPassword", { resetUrl: "x" }, fallback)).toEqual({ subject: "koda", html: "<p>koda</p>" });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
