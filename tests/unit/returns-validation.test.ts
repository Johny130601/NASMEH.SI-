import { describe, expect, it } from "vitest";
import {
  adverseInputSchema, adverseToContactInput, contactPayloadHash,
  withdrawalInputSchema, withdrawalToContactInput, WITHDRAWAL_STATUTORY_BASIS,
} from "@/lib/support/validation";

const today = new Date().toISOString().slice(0, 10);
const withdrawal = {
  requestKey: "0ea827bf-3fd0-4b4d-af19-8f80d4661888", name: "Živa Ščuk", email: "Ziva@Example.Test",
  address: "Testna ulica 1, 1000 Ljubljana", orderNumber: "ns-2026-00042", receivedAt: "2026-09-01",
  items: "1 × Belilni trakci", note: "", privacyAccepted: true,
};

describe("withdrawal form validation", () => {
  it("accepts the model fields, normalising e-mail and order number", () => {
    const parsed = withdrawalInputSchema.parse(withdrawal);
    expect(parsed.email).toBe("ziva@example.test");
    expect(parsed.orderNumber).toBe("NS-2026-00042");
  });

  it.each([
    ["a receipt date in the future", { receivedAt: "2999-01-01" }],
    ["a malformed date", { receivedAt: "01.09.2026" }],
    ["an impossible date", { receivedAt: "2026-02-30" }],
    ["a missing privacy acknowledgment", { privacyAccepted: false }],
    ["an order number outside the NS format", { orderNumber: "12345" }],
    ["items that are too short", { items: "x" }],
    ["control characters in the name", { name: "Živa\nŠčuk" }],
    ["a NUL byte in the address", { address: `Testna 1${String.fromCharCode(0)}` }],
  ])("rejects %s", (_label, override) => {
    expect(withdrawalInputSchema.safeParse({ ...withdrawal, ...override }).success).toBe(false);
  });

  it("composes the statutory message and structured details with the order e-mail as proof", () => {
    const input = withdrawalToContactInput(withdrawalInputSchema.parse({ ...withdrawal, note: "Embalaža nepoškodovana" }));
    expect(input).toMatchObject({ topic: "RETURN", reason: "WITHDRAWAL", orderNumber: "NS-2026-00042", orderEmail: "ziva@example.test", privacyAccepted: true });
    expect(input.message).toContain("odstopam od pogodbe");
    expect(input.message).toContain("1 × Belilni trakci");
    expect(input.message).toContain("Opomba: Embalaža nepoškodovana");
    expect(input.details).toEqual({
      kind: "withdrawal", statutoryBasis: WITHDRAWAL_STATUTORY_BASIS,
      address: "Testna ulica 1, 1000 Ljubljana", receivedAt: "2026-09-01", items: "1 × Belilni trakci", note: "Embalaža nepoškodovana",
    });
  });

  it("hashes structured details into the idempotency payload", () => {
    const base = withdrawalToContactInput(withdrawalInputSchema.parse(withdrawal));
    const changed = { ...base, details: { ...base.details!, items: "2 × Ustna voda" } };
    expect(contactPayloadHash(base, null, [])).toBe(contactPayloadHash({ ...base }, null, []));
    expect(contactPayloadHash(base, null, [])).not.toBe(contactPayloadHash(changed, null, []));
  });
});

const adverse = {
  requestKey: "0ea827bf-3fd0-4b4d-af19-8f80d4661888", name: "Živa Ščuk", email: "ziva@example.test",
  phone: "+386 40 123 456", reporterType: "USER", reason: "REACTION", productSlug: "serum-korektor-barve-zob",
  batchNumber: "LOT 2026-09A", purchasePlace: "nasmeh.si", purchaseDate: "", orderNumber: "",
  description: "Po prvi uporabi je bilo dlesni rdeče in pekoče približno eno uro.",
  onsetDate: today, ongoing: "no", medicalTreatment: "yes", medicalDetails: "Posvet z zobozdravnikom.",
  contactPermission: true, privacyAccepted: true,
};

describe("adverse-event report validation", () => {
  it("accepts a complete report", () => {
    expect(adverseInputSchema.safeParse(adverse).success).toBe(true);
  });

  it.each([
    ["a missing batch number", { batchNumber: "" }],
    ["a batch number that is too short", { batchNumber: "12" }],
    ["unsafe batch characters", { batchNumber: "<script>" }],
    ["a description under twenty characters", { description: "kratko" }],
    ["an unknown reporter type", { reporterType: "ALIEN" }],
    ["a missing yes/no answer", { ongoing: "" }],
    ["a rejected privacy acknowledgment", { privacyAccepted: false }],
    ["a phone with letters", { phone: "call me" }],
    ["an order number outside the NS format", { orderNumber: "ABC" }],
    ["a product slug with unsafe characters", { productSlug: "../x" }],
  ])("rejects %s", (_label, override) => {
    expect(adverseInputSchema.safeParse({ ...adverse, ...override }).success).toBe(false);
  });

  it("maps to an ADVERSE ticket with structured details; order proof only when a number is given", () => {
    const product = { slug: "serum-korektor-barve-zob", title: "Serum korektor barve zob" };
    const withoutOrder = adverseToContactInput(adverseInputSchema.parse(adverse), product);
    expect(withoutOrder).toMatchObject({ topic: "ADVERSE", reason: "REACTION", message: adverse.description, orderNumber: "", orderEmail: "" });
    expect(withoutOrder.details).toEqual({
      kind: "adverse", reporterType: "USER", phone: "+386 40 123 456", product,
      batchNumber: "LOT 2026-09A", purchasePlace: "nasmeh.si", purchaseDate: "", onsetDate: today,
      ongoing: false, medicalTreatment: true, medicalDetails: "Posvet z zobozdravnikom.", contactPermission: true,
    });
    const withOrder = adverseToContactInput(adverseInputSchema.parse({ ...adverse, orderNumber: "ns-2026-00042" }), product);
    expect(withOrder).toMatchObject({ orderNumber: "NS-2026-00042", orderEmail: "ziva@example.test" });
  });
});
