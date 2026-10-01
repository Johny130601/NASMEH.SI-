import { describe, expect, it } from "vitest";
import { wordingVersion } from "@/lib/consent-log";
import { adverse as adverseCopy } from "@/lib/copy/adverse";
import { contact } from "@/lib/copy/contact";
import { returns } from "@/lib/copy/returns";
import {
  adverseInputSchema, adverseToContactInput, contactPayloadHash, PRIVACY_NOTICE_VERSIONS, privacyNoticeVersion,
  withdrawalInputSchema, withdrawalToContactInput, WITHDRAWAL_STATUTORY_BASIS,
} from "@/lib/support/validation";

const today = new Date().toISOString().slice(0, 10);
const withdrawal = {
  requestKey: "0ea827bf-3fd0-4b4d-af19-8f80d4661888", name: "Živa Ščuk", email: "Ziva@Example.Test",
  address: "Testna ulica 1, 1000 Ljubljana", orderNumber: "ns-2026-00042", deliveryStatus: "received", receivedAt: "2026-09-01",
  items: "1 × Belilni trakci", note: "", privacyAccepted: true,
};

describe("withdrawal form validation", () => {
  it("accepts the model fields, normalising e-mail and order number", () => {
    const parsed = withdrawalInputSchema.parse(withdrawal);
    expect(parsed.email).toBe("ziva@example.test");
    expect(parsed.orderNumber).toBe("NS-2026-00042");
  });

  it("accepts a withdrawal before delivery without a receipt date (Annex I(B) ordered on / received on)", () => {
    const parsed = withdrawalInputSchema.parse({ ...withdrawal, deliveryStatus: "not_received", receivedAt: undefined });
    expect(parsed).toMatchObject({ deliveryStatus: "not_received", receivedAt: "" });
  });

  it.each([
    ["a receipt date in the future", { receivedAt: "2999-01-01" }],
    ["a malformed date", { receivedAt: "01.09.2026" }],
    ["an impossible date", { receivedAt: "2026-02-30" }],
    ["received goods without a receipt date", { receivedAt: "" }],
    ["a missing delivery answer", { deliveryStatus: undefined }],
    ["an unknown delivery answer", { deliveryStatus: "maybe" }],
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
    // Staff read the receipt date the Slovenian way in the message as in the rows (QA T4-F11); details keep ISO.
    expect(input.message).toContain("Blago prejeto dne: 1. 9. 2026");
    expect(input.message).not.toContain("2026-09-01");
    expect(input.message).toContain("Opomba: Embalaža nepoškodovana");
    expect(input.message.split("\n")).toEqual([
      returns.withdrawal.staffMessage.intro("1 × Belilni trakci"),
      "Številka naročila: NS-2026-00042",
      "Blago prejeto dne: 1. 9. 2026",
      "Naslov potrošnika: Testna ulica 1, 1000 Ljubljana",
      "Opomba: Embalaža nepoškodovana",
    ]);
    expect(input.details).toEqual({
      kind: "withdrawal", statutoryBasis: WITHDRAWAL_STATUTORY_BASIS, goodsReceived: true,
      address: "Testna ulica 1, 1000 Ljubljana", receivedAt: "2026-09-01", items: "1 × Belilni trakci", note: "Embalaža nepoškodovana",
    });
  });

  it("records goods not yet received, ignoring a contradictory date", () => {
    const input = withdrawalToContactInput(withdrawalInputSchema.parse({ ...withdrawal, deliveryStatus: "not_received" }));
    expect(input.message).toContain("Blago še ni prejeto");
    expect(input.message).not.toContain("2026-09-01");
    expect(input.details).toMatchObject({ goodsReceived: false, receivedAt: "" });
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
const product = { slug: "serum-korektor-barve-zob", title: "Serum korektor barve zob" };

describe("adverse-event report validation", () => {
  it("accepts a complete report", () => {
    expect(adverseInputSchema.safeParse(adverse).success).toBe(true);
  });

  it("accepts a report without a batch number when the reporter states it is unknown", () => {
    const parsed = adverseInputSchema.parse({ ...adverse, batchNumber: "", batchUnknown: true });
    expect(adverseToContactInput(parsed, product).details).toMatchObject({ batchNumber: "", batchUnknown: true });
    expect(adverseInputSchema.parse({ ...adverse, batchNumber: undefined, batchUnknown: true }).batchNumber).toBe("");
  });

  it.each([
    ["a missing batch number without the unknown answer", { batchNumber: "" }],
    ["a batch number that is too short", { batchNumber: "12" }],
    ["a too-short batch number even when marked unknown", { batchNumber: "12", batchUnknown: true }],
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
    const withoutOrder = adverseToContactInput(adverseInputSchema.parse(adverse), product);
    expect(withoutOrder).toMatchObject({ topic: "ADVERSE", reason: "REACTION", message: adverse.description, orderNumber: "", orderEmail: "" });
    expect(withoutOrder.details).toEqual({
      kind: "adverse", reporterType: "USER", phone: "+386 40 123 456", product,
      batchNumber: "LOT 2026-09A", batchUnknown: false, purchasePlace: "nasmeh.si", purchaseDate: "", onsetDate: today,
      ongoing: false, medicalTreatment: true, medicalDetails: "Posvet z zobozdravnikom.", contactPermission: true,
    });
    const withOrder = adverseToContactInput(adverseInputSchema.parse({ ...adverse, orderNumber: "ns-2026-00042" }), product);
    expect(withOrder).toMatchObject({ orderNumber: "NS-2026-00042", orderEmail: "ziva@example.test" });
    // A given batch number wins over a contradictory "unknown" tick.
    expect(adverseToContactInput(adverseInputSchema.parse({ ...adverse, batchUnknown: true }), product).details)
      .toMatchObject({ batchNumber: "LOT 2026-09A", batchUnknown: false });
  });
});

describe("per-form privacy notice versions", () => {
  it("derives one version per form from the wording each form shows", () => {
    expect(PRIVACY_NOTICE_VERSIONS).toEqual({
      contact: `contact-${wordingVersion(contact.message.privacy)}`,
      withdrawal: `withdrawal-${wordingVersion(returns.withdrawal.privacy)}`,
      adverse: `adverse-${wordingVersion(`${adverseCopy.consent.privacy}\n${adverseCopy.consent.contact}`)}`,
    });
    expect(new Set(Object.values(PRIVACY_NOTICE_VERSIONS)).size).toBe(3);
  });

  it("selects the version from the server-built details and binds it into the payload hash", () => {
    const withdrawalInput = withdrawalToContactInput(withdrawalInputSchema.parse(withdrawal));
    const adverseInput = adverseToContactInput(adverseInputSchema.parse(adverse), product);
    expect(privacyNoticeVersion(withdrawalInput)).toBe(PRIVACY_NOTICE_VERSIONS.withdrawal);
    expect(privacyNoticeVersion(adverseInput)).toBe(PRIVACY_NOTICE_VERSIONS.adverse);
    expect(privacyNoticeVersion({ details: undefined })).toBe(PRIVACY_NOTICE_VERSIONS.contact);
    // Same submitted fields under another form's notice must not replay as the same request.
    expect(contactPayloadHash({ ...adverseInput, details: { ...adverseInput.details!, kind: "withdrawal" } }, null, []))
      .not.toBe(contactPayloadHash(adverseInput, null, []));
  });

  it("keeps the adverse notice neutral about the obligor's role", () => {
    expect(adverseCopy.consent.privacy).not.toMatch(/proizvajal/i);
  });
});
