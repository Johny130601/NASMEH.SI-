import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), orderFindUnique: vi.fn(), settingFindUnique: vi.fn(), packingSlip: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { order: { findUnique: mocks.orderFindUnique }, setting: { findUnique: mocks.settingFindUnique } } }));
vi.mock("@/lib/invoice/packing-slip", () => ({ generatePackingSlipPdf: mocks.packingSlip }));

import { companyPlaceholderFields, companySchema, COMPANY_SEED_PLACEHOLDERS } from "@/lib/settings-schemas";
import { telHref } from "@/lib/phone";
import { GET as packingSlipRoute } from "@/app/admin/(shell)/narocila/[number]/dobavnica.pdf/route";

/** Phase 9 step 4: optional trader telephone and the seed-placeholder guard (gate G4). */

const company = { name: "Nasmeh.si, d.o.o.", address: "Čopova 1, 1000 Ljubljana", registrationNumber: "1234567000", vatId: "SI12345678", email: "info@nasmeh.si" };

describe("companySchema phone", () => {
  it("is optional, trims, and accepts common Slovenian and international notations", () => {
    expect(companySchema.parse(company)).not.toHaveProperty("phone");
    expect(companySchema.parse({ ...company, phone: "" }).phone).toBe("");
    expect(companySchema.parse({ ...company, phone: "   " }).phone).toBe("");
    for (const phone of ["+386 1 234 56 78", "01/234-56-78", "(01) 234 5678", "041 123 456"]) {
      expect(companySchema.parse({ ...company, phone: ` ${phone} ` }).phone, phone).toBe(phone);
    }
  });

  it("refuses letters, too few digits and overlong values", () => {
    for (const phone of ["pokličite nas", "12345", "+386 1 234 56 78 ext 5", "1".repeat(41)]) {
      expect(companySchema.safeParse({ ...company, phone }).success, phone).toBe(false);
    }
  });
});

describe("telHref (S7)", () => {
  it("drops the trunk '(0)' after a country code and keeps the leading +", () => {
    for (const phone of ["+386 (0)1 234 56 78", "+386(0)1 234 56 78", "+386 ( 0 ) 1/234-56-78", "00386 (0)1 234 56 78", "+386 1 234 56 78", "+386 (1) 234-56-78"]) {
      expect(telHref(phone), phone).toBe("tel:+38612345678");
    }
    expect(telHref(" +386 (0)41 123 456 ")).toBe("tel:+38641123456");
  });

  it("keeps national Slovenian notations as dialled locally", () => {
    expect(telHref("01 234 56 78")).toBe("tel:012345678");
    expect(telHref("01/234-56-78")).toBe("tel:012345678");
    expect(telHref("(01) 234 5678")).toBe("tel:012345678");
    expect(telHref("041 123 456")).toBe("tel:041123456");
    expect(telHref("080 12 34")).toBe("tel:0801234");
  });

  it("returns null without digits", () => {
    expect(telHref("")).toBeNull();
    expect(telHref(" + ( ) ")).toBeNull();
    expect(telHref("00")).toBeNull();
  });

  it("builds a valid link for every phone the company schema accepts in its own examples", () => {
    for (const phone of ["+386 1 234 56 78", "01/234-56-78", "(01) 234 5678", "041 123 456"]) {
      const parsed = companySchema.parse({ ...company, phone });
      expect(telHref(parsed.phone ?? ""), phone).toMatch(/^tel:\+?\d{6,}$/);
    }
  });
});

describe("companyPlaceholderFields", () => {
  it("flags every seed placeholder the prisma seed writes", () => {
    const seeded = { ...company, address: "Trg nasmeha 1, 1000 Ljubljana, Slovenija", registrationNumber: COMPANY_SEED_PLACEHOLDERS.registrationNumber, vatId: COMPANY_SEED_PLACEHOLDERS.vatId };
    expect(companyPlaceholderFields(seeded)).toEqual(["registrationNumber", "vatId", "address"]);
    expect(companyPlaceholderFields({ ...company, vatId: "si000000" })).toEqual(["vatId"]);
    expect(companyPlaceholderFields({ ...company, registrationNumber: "000" })).toEqual(["registrationNumber"]);
    expect(companyPlaceholderFields({ ...company, address: "TRG NASMEHA 1" })).toEqual(["address"]);
  });

  it("is empty for real data, a missing Setting or a form still blank", () => {
    expect(companyPlaceholderFields(company)).toEqual([]);
    expect(companyPlaceholderFields(null)).toEqual([]);
    expect(companyPlaceholderFields({ ...company, vatId: "SI10000000", registrationNumber: "1000000000" })).toEqual([]);
    expect(companyPlaceholderFields({ address: "", registrationNumber: "", vatId: "" })).toEqual([]);
  });
});

describe("packing slip company block (X4)", () => {
  const owner = { user: { id: "cmf0owner000000000000001", email: "owner@nasmeh.si", name: "Owner", role: "OWNER", mfaEnrolled: true } };
  const slip = () => packingSlipRoute(new Request("https://nasmeh.example/x"), { params: Promise.resolve({ number: "NS-2026-00042" }) });

  it("reads the company through the validated reader: normalised when valid, no block when malformed", async () => {
    mocks.auth.mockResolvedValue(owner);
    mocks.orderFindUnique.mockResolvedValue({ id: "o", number: "NS-2026-00042", items: [] });
    mocks.packingSlip.mockResolvedValue(Buffer.from("%PDF"));
    mocks.settingFindUnique.mockResolvedValue({ key: "company", value: { ...company, vatId: " si12345678 ", phone: " +386 1 234 56 78 " } });
    expect((await slip()).status).toBe(200);
    expect(mocks.settingFindUnique).toHaveBeenCalledWith({ where: { key: "company" } });
    expect(mocks.packingSlip.mock.calls[0][1]).toEqual({ ...company, vatId: "SI12345678", phone: "+386 1 234 56 78" });
    mocks.settingFindUnique.mockResolvedValue({ key: "company", value: { name: "Nasmeh", address: "" } });
    expect((await slip()).status).toBe(200);
    expect(mocks.packingSlip.mock.calls[1][1]).toBeNull();
  });
});
