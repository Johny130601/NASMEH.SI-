import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));
import { renderSupportCustomerEmail, renderSupportStaffEmail, ticketDetailsKind, ticketKind } from "@/lib/email/templates/support-ticket";

const base = {
  reference: "NP-TEST", topic: "ADVERSE" as const, reason: "REACTION", name: "Živa Ščuk", email: "ziva@example.test",
  orderNumber: null, orderProof: null, message: "Opis učinka", attachments: [{ id: "att-1" }],
};

describe("support ticket staff mail", () => {
  it("renders adverse details with labels, yes/no, the reporter type and the product title, escaping HTML", () => {
    const mail = renderSupportStaffEmail({ ...base, details: {
      kind: "adverse", reporterType: "PROFESSIONAL", phone: "", product: { slug: "x", title: "Serum <b>korektor</b>" },
      batchNumber: "LOT 1", purchasePlace: "nasmeh.si", purchaseDate: "", onsetDate: "2026-09-09",
      ongoing: true, medicalTreatment: false, medicalDetails: "", contactPermission: true,
    } });
    expect(mail.html).toContain("Strukturirani podatki obrazca");
    expect(mail.html).toContain("Zdravstveni delavec");
    expect(mail.html).toContain("Serum &lt;b&gt;korektor&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>korektor</b>");
    expect(mail.text).toContain("Številka serije (natisnjena na embalaži): LOT 1");
    expect(mail.text).toContain("Učinek še traja: Da");
    // Staff read calendar dates in the Slovenian form, as in the admin inbox (QA T4-F11).
    expect(mail.text).toContain("9. 9. 2026");
    expect(mail.text).not.toContain("2026-09-09");
    expect(mail.text).toContain("Poiskana zdravniška pomoč: Ne");
    expect(mail.text).not.toContain("Telefon prijavitelja");
    expect(mail.text).toContain("https://nasmeh.example/api/support/attachments/att-1");
  });

  it("shows staff the order number an adverse report states but could not be linked (QA M15)", () => {
    const mail = renderSupportStaffEmail({ ...base, details: { kind: "adverse", reporterType: "CARER", batchNumber: "LOT 1", claimedOrderNumber: "NS-2026-99999" } });
    expect(mail.text).toContain("Številka naročila, ki jo je navedel prijavitelj (ni samodejno povezana z naročilom): NS-2026-99999");
    expect(mail.html).toContain("NS-2026-99999");
  });

  it("renders withdrawal details in copy order and ignores unknown keys", () => {
    const mail = renderSupportStaffEmail({ ...base, topic: "RETURN", reason: "WITHDRAWAL", details: {
      kind: "withdrawal", statutoryBasis: "ZVPot-1", address: "Testna 1", receivedAt: "2026-09-01", items: "1 × trakci", note: "", secret: "never",
    } });
    expect(mail.text).toContain("Odstop od pogodbe (14 dni)");
    expect(mail.text).toContain("Pravna podlaga: ZVPot-1");
    expect(mail.text).toContain("Blago, od katerega potrošnik odstopa: 1 × trakci");
    expect(mail.text.indexOf("Blago prejeto dne")).toBeLessThan(mail.text.indexOf("Naslov potrošnika"));
    expect(mail.text).not.toContain("never");
  });

  it("flags withdrawal tickets for triage and tells staff that a timely withdrawal takes effect on notice", () => {
    const withdrawal = renderSupportStaffEmail({ ...base, topic: "RETURN", reason: "WITHDRAWAL", details: {
      kind: "withdrawal", statutoryBasis: "ZVPot-1", claimedOrderNumber: "NS-2026-00042", goodsReceived: false, receivedAt: "", items: "1 × trakci",
    } });
    expect(withdrawal.subject.startsWith("[ODSTOP] ")).toBe(true);
    for (const body of [withdrawal.text, withdrawal.html]) {
      expect(body).toContain("učinkuje z obvestilom potrošnika");
      expect(body).toContain("14 dneh od prejema tega obvestila");
      expect(body).not.toContain("ne prekliče naročila");
    }
    expect(withdrawal.text).toContain("ni samodejno povezana z naročilom): NS-2026-00042");
    expect(withdrawal.text).toContain("Potrošnik je blago že prejel: Ne");
    expect(withdrawal.text).not.toContain("Blago prejeto dne");
    const other = renderSupportStaffEmail({ ...base, details: { kind: "adverse", batchNumber: "", batchUnknown: true } });
    expect(other.subject.startsWith("[ODSTOP]")).toBe(false);
    expect(other.text).toContain("ne prekliče naročila");
    expect(other.text).toContain("Prijavitelj številke serije ne pozna (npr. embalaže nima več): Da");
  });

  it("treats a RETURN/WITHDRAWAL ticket from the contact form as a withdrawal, with or without stored details (S8/U19)", () => {
    for (const details of [null, undefined, { kind: "withdrawal", statutoryBasis: "ZVPot-1", viaContactForm: true }]) {
      const mail = renderSupportStaffEmail({ ...base, topic: "RETURN", reason: "WITHDRAWAL", attachments: [], details });
      expect(mail.subject.startsWith("[ODSTOP] "), String(details)).toBe(true);
      for (const body of [mail.text, mail.html]) {
        expect(body).toContain("učinkuje z obvestilom potrošnika");
        expect(body).toContain("14 dneh od prejema tega obvestila");
        expect(body).not.toContain("ne prekliče naročila");
      }
    }
    const structured = renderSupportStaffEmail({ ...base, topic: "RETURN", reason: "WITHDRAWAL", attachments: [], details: { kind: "withdrawal", statutoryBasis: "ZVPot-1", viaContactForm: true } });
    expect(structured.text).toContain("Pravna podlaga: ZVPot-1");
    expect(structured.text).toContain("Poslano prek splošnega kontaktnega obrazca (brez podatkov vzorčnega obrazca; blago in naslov preverite v sporočilu): Da");
    // Other return reasons stay ordinary tickets.
    const changedMind = renderSupportStaffEmail({ ...base, topic: "RETURN", reason: "CHANGED_MIND", details: null });
    expect(changedMind.subject.startsWith("[ODSTOP]")).toBe(false);
    expect(changedMind.text).toContain("ne prekliče naročila");
    expect(ticketKind({ topic: "RETURN", reason: "WITHDRAWAL", details: null })).toBe("withdrawal");
    expect(ticketKind({ topic: "RETURN", reason: "UNSUITABLE", details: null })).toBeNull();
    expect(ticketKind({ topic: "ADVERSE", reason: "REACTION", details: { kind: "adverse" } })).toBe("adverse");
    expect(ticketKind({ topic: "OTHER", reason: "OTHER", details: { kind: "other" } })).toBeNull();
    // An ADVERSE report sent through the general contact form (no structured details) is still an adverse report (QA T4-F8).
    expect(ticketKind({ topic: "ADVERSE", reason: "REACTION", details: null })).toBe("adverse");
  });

  it("omits the details section without a recognised kind", () => {
    for (const details of [undefined, null, "text", { kind: "other" }, { items: "x" }]) {
      expect(renderSupportStaffEmail({ ...base, details }).html).not.toContain("Strukturirani podatki obrazca");
      expect(ticketDetailsKind(details)).toBeNull();
    }
    expect(ticketDetailsKind({ kind: "withdrawal" })).toBe("withdrawal");
    expect(ticketDetailsKind({ kind: "adverse" })).toBe("adverse");
  });
});

describe("support ticket customer receipt", () => {
  it("adds only a generic statutory note per kind, never submitted data", () => {
    const withdrawal = renderSupportCustomerEmail({ reference: "NP-1", kind: "withdrawal" });
    expect(withdrawal.text).toContain("NP-1");
    expect(withdrawal.text).toContain("14 dneh");
    // Directive 2011/83/EU Art. 13: counted from the withdrawal notice, withheld only until goods or proof arrive.
    expect(withdrawal.text).toContain("brez nepotrebnega odlašanja, najpozneje pa v 14 dneh od prejema vašega obvestila o odstopu");
    expect(withdrawal.text).toContain("kar nastopi prej");
    expect(withdrawal.text).not.toContain("od prejema vrnjenega blaga");
    const adverse = renderSupportCustomerEmail({ reference: "NP-2", kind: "adverse" });
    expect(adverse.text).toContain("varnost izdelkov");
    const plain = renderSupportCustomerEmail({ reference: "NP-3" });
    expect(plain.text).not.toContain("14 dneh");
    expect(plain.text).not.toContain("varnost izdelkov");
  });
});
