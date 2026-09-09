import { describe, expect, it } from "vitest";
import { generateWithdrawalFormPdf } from "@/lib/returns/withdrawal-pdf";

describe("model withdrawal form PDF", () => {
  it("produces a titled PDF with the seller block", async () => {
    const pdf = await generateWithdrawalFormPdf({
      name: "Nasmeh.si, d.o.o.", address: "Trg nasmeha 1, 1000 Ljubljana", registrationNumber: "1", vatId: "SI1", email: "info@nasmeh.si",
    });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const raw = pdf.toString("latin1");
    // Page content streams are compressed; the object headers and the info
    // dictionary are not, whichever string encoding pdfkit picks for the title.
    expect(raw).toContain("/Type /Page");
    expect(raw).toContain("/Title");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("still renders with a placeholder seller line when the company setting is missing", async () => {
    const pdf = await generateWithdrawalFormPdf(null);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
