import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));
import { renderSupportCustomerEmail, renderSupportStaffEmail, ticketDetailsKind } from "@/lib/email/templates/support-ticket";

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
    expect(mail.text).toContain("Poiskana zdravniška pomoč: Ne");
    expect(mail.text).not.toContain("Telefon prijavitelja");
    expect(mail.text).toContain("https://nasmeh.example/api/support/attachments/att-1");
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
    const adverse = renderSupportCustomerEmail({ reference: "NP-2", kind: "adverse" });
    expect(adverse.text).toContain("varnost izdelkov");
    const plain = renderSupportCustomerEmail({ reference: "NP-3" });
    expect(plain.text).not.toContain("14 dneh");
    expect(plain.text).not.toContain("varnost izdelkov");
  });
});
