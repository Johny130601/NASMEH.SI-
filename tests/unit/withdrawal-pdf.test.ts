import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ company: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getCompany: mocks.company }));

import { generateWithdrawalFormPdf } from "@/lib/returns/withdrawal-pdf";
import { GET } from "@/app/(storefront)/odstop-od-pogodbe/obrazec.pdf/route";

const COMPANY = {
  name: "Nasmeh.si, d.o.o.", address: "Čopova 1, 1000 Ljubljana", registrationNumber: "1234567000", vatId: "SI12345678", email: "info@nasmeh.si",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("model withdrawal form PDF", () => {
  it("produces a titled PDF with the seller block, with or without a telephone", async () => {
    for (const company of [COMPANY, { ...COMPANY, phone: "+386 1 234 56 78" }]) {
      const pdf = await generateWithdrawalFormPdf(company);
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      const raw = pdf.toString("latin1");
      // Page content streams are compressed; the object headers and the info
      // dictionary are not, whichever string encoding pdfkit picks for the title.
      expect(raw).toContain("/Type /Page");
      expect(raw).toContain("/Title");
      expect(pdf.length).toBeGreaterThan(2000);
    }
  });
});

describe("GET /odstop-od-pogodbe/obrazec.pdf", () => {
  it("serves the form from the validated company Setting", async () => {
    mocks.company.mockResolvedValue(COMPANY);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("answers 503 no-store instead of a form without the seller when the Setting is missing or invalid", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      // getCompany() returns null for both a missing and a malformed row (lib/settings.ts readSetting).
      mocks.company.mockResolvedValue(null);
      const response = await GET();
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-type")).toBeNull();
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});
