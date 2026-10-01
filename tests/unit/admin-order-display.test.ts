import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEuroCents, refundRequiredReason, timelineDetail, timelineEventLabel } from "@/lib/admin/order-display";
import { consentChoiceParts, consentChoicesText, consentKindLabel, consentVersionLabel } from "@/lib/admin/consent-display";
import { readableDetailValue } from "@/lib/admin/tickets";

/** QA 2026-09-29: machine strings the admin showed raw (N3, M3, T5-08, T4-F11, consent history). */

const items = [
  { variantId: "v-strips", sku: "NAS-TRK-14", title: "Trakovi", properties: null },
  { variantId: "v-bundle", sku: "NAS-PAKET", title: "Paket", properties: { bundleComponents: [{ variantId: "v-serum", title: "Serum korektor", quantity: 1 }] } },
];

describe("order timeline in words", () => {
  it("labels events and the mail outcome kinds", () => {
    expect(timelineEventLabel("paid")).toBe("Plačilo prejeto");
    expect(timelineEventLabel("mail_sent:refunded")).toBe("Sporočilo poslano (vračilo denarja)");
    expect(timelineEventLabel("note_added")).toBe("Opomba dodana");
    expect(timelineEventLabel("something_new")).toBe("something_new");
    // "details" is the renderer's own sub-object, never an event label.
    expect(timelineEventLabel("details")).toBe("details");
  });

  it("renders the stored detail formats readably and keeps unknown ones as stored", () => {
    expect(timelineDetail("created", "provider:test")).toBe("ponudnik plačil: Testno");
    expect(timelineDetail("paid", "provider:stripe")).toBe("ponudnik plačil: Kartica / denarnica");
    expect(timelineDetail("partially_refunded", "cents:1500:support@nasmeh.si")).toBe("znesek: 15,00 € · izvedel: support@nasmeh.si");
    expect(timelineDetail("refunded", "cents:3989")).toBe("znesek: 39,89 €");
    expect(timelineDetail("restock_skipped", "variants:2:owner@nasmeh.si")).toBe("izbrisanih različic: 2 · izvedel: owner@nasmeh.si");
    expect(timelineDetail("shipped", "Pošta Slovenije:fulfil@nasmeh.si")).toBe("prevoznik: Pošta Slovenije · izvedel: fulfil@nasmeh.si");
    expect(timelineDetail("cancelled", "stranka: ne želi več:support@nasmeh.si")).toBe("razlog: stranka: ne želi več · izvedel: support@nasmeh.si");
    expect(timelineDetail("processing", "owner@nasmeh.si")).toBe("izvedel: owner@nasmeh.si");
    expect(timelineDetail("payment_received_refund_required", "stockout:v-strips", items)).toContain("NAS-TRK-14");
    expect(timelineDetail("payment_failed", "card_declined")).toBe("card_declined");
    expect(timelineDetail("paid", undefined)).toBe("");
  });

  it("names why a captured payment is owed, down to a bundle component", () => {
    expect(refundRequiredReason("stockout:v-strips", items)).toContain("(NAS-TRK-14)");
    expect(refundRequiredReason("stockout:v-serum", items)).toContain("(Serum korektor)");
    expect(refundRequiredReason("stockout:gone", items)).toBe("Vzrok: ob prejemu plačila izdelka ni bilo več na zalogi. Zaloga ni bila odšteta.");
    expect(refundRequiredReason("payment_received_after_cancellation", items)).toBe("Vzrok: plačilo je prispelo po preklicu naročila.");
    expect(refundRequiredReason(null, items)).toBeNull();
    expect(refundRequiredReason("unknown", items)).toBeNull();
  });
});

describe("refund adjustment in euros (T5-08)", () => {
  it("reads a signed euro amount with a comma or a dot, never as cents", () => {
    expect(parseEuroCents("-2.00")).toBe(-200);
    expect(parseEuroCents("−5,00")).toBe(-500);
    expect(parseEuroCents("5")).toBe(500);
    expect(parseEuroCents("5,5")).toBe(550);
    expect(parseEuroCents(" 12,34 € ")).toBe(1234);
    expect(parseEuroCents("+1,05")).toBe(105);
    expect(parseEuroCents("")).toBe(0);
    expect(parseEuroCents("-0")).toBe(0);
  });

  it("refuses what it would have to guess", () => {
    for (const text of ["1.234,56", "1,234", "abc", "2.", "--2", "1e3", "12345678"]) expect(parseEuroCents(text)).toBeNull();
  });
});

describe("consent history and ticket dates in words", () => {
  it("names the kind, shows a cookie version and hides a wording fingerprint", () => {
    expect(consentKindLabel("marketing-email")).toBe("E-novice (obrazec)");
    expect(consentKindLabel("new-kind")).toBe("new-kind");
    expect(consentVersionLabel("2")).toBe("različica 2");
    expect(consentVersionLabel("t-0123456789ab")).toBeNull();
  });

  it("lists the choices by label and leaves record ids out", () => {
    expect(consentChoicesText({ marketing: true, doubleOptIn: true, source: "footer", subscriberId: "cmf0" }))
      .toBe("e-novice: Da · dvojna potrditev: Da · vir: noga strani");
    // A cookie row's `marketing` is the marketing-cookie category, never the newsletter.
    expect(consentChoicesText({ necessary: true, analytics: false, marketing: false, ts: 1 }, "cookie")).toBe("nujni: Da · analitični: Ne · trženjski: Ne");
    expect(consentChoicesText({ marketing: true, previous: false }, "marketing-checkout")).toBe("e-novice: Da · prej: Ne");
    expect(consentChoicesText({ marketing: false, previousStatus: "CONFIRMED" })).toBe("e-novice: Ne · prejšnje stanje: potrjena");
    expect(consentChoicesText(null)).toBe("");
  });

  it("reads the stored codes in words: every checkout row, anonymisation and post-purchase (QA round 2)", () => {
    // Stored order is kept (Postgres jsonb sorts keys by length: action, marketing, orderNumber).
    expect(consentChoicesText({ action: "not-given", marketing: false, orderNumber: "NS-2026-00010" }, "marketing-checkout"))
      .toBe("dejanje: soglasje ni podano · e-novice: Ne · naročilo: NS-2026-00010");
    expect(consentChoicesText({ action: "pending-confirmation", marketing: true, orderNumber: "NS-1", subscriberId: "s" }, "marketing-checkout"))
      .toBe("dejanje: čaka na potrditev · e-novice: Da · naročilo: NS-1");
    expect(consentChoicesText({ action: "already-confirmed", marketing: true, orderNumber: "NS-1" }, "marketing-checkout"))
      .toBe("dejanje: že potrjena · e-novice: Da · naročilo: NS-1");
    expect(consentChoicesText({ marketing: false, previous: true, reason: "anonymised" }, "marketing-preference"))
      .toBe("e-novice: Ne · prej: Da · razlog: anonimizacija");
    expect(consentChoicesText({ marketing: false, requested: false, source: "post-purchase", subscriberStatus: "none" }, "marketing-register"))
      .toBe("e-novice: Ne · zahtevano: Ne · vir: registracija po nakupu · stanje prijave: brez prijave");
  });

  it("keeps identifiers and unknown codes as stored and never resolves a prototype member", () => {
    // A slug or an order number is never looked up as a code, even when it spells one.
    expect(consentChoicesText({ productSlug: "checkout", source: "back-in-stock" }, "back-in-stock")).toBe("izdelek: checkout · vir: obvestilo o zalogi");
    // A value is never read through the key labels (the two namespaces stay apart).
    expect(consentChoicesText({ source: "marketing" })).toBe("vir: marketing");
    expect(consentChoicesText({ source: "a-future-source" })).toBe("vir: a-future-source");
    expect(consentChoicesText({ constructor: "toString" })).toBe("constructor: toString");
    expect(consentKindLabel("constructor")).toBe("constructor");
    expect(consentChoiceParts({ orderNumber: "NS-2026-00010", ts: 1 })).toEqual([{ key: "orderNumber", label: "naročilo", value: "NS-2026-00010" }]);
  });

  it("has a word for every code a consent writer stores", () => {
    const root = process.cwd();
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
    const writers = [...walk(join(root, "app")), ...walk(join(root, "lib"))]
      .filter((file) => /recordConsent\(/.test(readFileSync(file, "utf8")) && !file.endsWith(join("lib", "consent-log.ts")));
    const codes = new Set<string>();
    for (const file of writers) {
      const source = readFileSync(file, "utf8");
      // Only the text of each call: `action: … ?? "not-given"`, `source: "register"`, `reason: "anonymised"`, `subscriberStatus: … ?? "none"`.
      for (let start = source.indexOf("recordConsent("); start !== -1; start = source.indexOf("recordConsent(", start + 1)) {
        const call = source.slice(start, source.indexOf("});", start));
        for (const match of call.matchAll(/\b(?:action|source|reason|subscriberStatus|previousStatus):\s*[^,\n}]*?"([a-z][a-z-]*)"/g)) codes.add(match[1]);
      }
    }
    // The checkout statuses stored as `action`, the Subscriber sources and the withdrawal sources.
    const checkoutSubscription = readFileSync(join(root, "lib", "orders", "checkout-subscription.ts"), "utf8");
    for (const match of checkoutSubscription.matchAll(/status: "([a-z]+-[a-z-]+)"|source: "([a-z][a-z-]*)"/g)) codes.add(match[1] ?? match[2]);
    const subscriberConsent = readFileSync(join(root, "lib", "newsletter", "subscriber-consent.ts"), "utf8");
    for (const line of subscriberConsent.split("\n").filter((text) => /NEWSLETTER_SOURCES =|NewsletterWithdrawalSource =/.test(text))) {
      for (const match of line.matchAll(/"([a-z][a-z-]*)"/g)) codes.add(match[1]);
    }
    for (const match of readFileSync(join(root, "prisma", "schema.prisma"), "utf8").matchAll(/source\s+String\s+@default\("([a-z][a-z-]*)"\)/g)) codes.add(match[1]);

    for (const expected of ["not-given", "pending-confirmation", "already-confirmed", "none", "anonymised", "footer", "welcome-popup", "checkout", "register", "unsubscribe-link", "account-preference", "back-in-stock"]) {
      expect([...codes]).toContain(expected);
    }
    for (const code of [...codes, "PENDING", "CONFIRMED", "UNSUBSCRIBED"]) {
      expect(consentChoicesText({ source: code }), code).not.toBe(`vir: ${code}`);
    }
  });

  it("shows structured ticket dates in the Slovenian form", () => {
    expect(readableDetailValue("2026-09-20")).toBe("20. 9. 2026");
    expect(readableDetailValue("od 2026-09-01 do 2026-09-03")).toBe("od 1. 9. 2026 do 3. 9. 2026");
    expect(readableDetailValue("2026-02-30")).toBe("2026-02-30");
    expect(readableDetailValue("NS-2026-00001")).toBe("NS-2026-00001");
  });
});
