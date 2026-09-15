import PDFDocument from "pdfkit";
import path from "node:path";
import type { CompanySetting } from "@/lib/settings";
import { returns } from "@/lib/copy/returns";

const copy = returns.withdrawalPdf;

/**
 * Model withdrawal form (CRD Annex I(B)) with the seller block prefilled. The
 * seller is required: a form without the trader's name, address and e-mail is
 * not the model form, so callers refuse to serve one when the Setting is missing.
 */
export async function generateWithdrawalFormPdf(company: CompanySetting): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    // Same OFL Unicode font as the invoice: built-in Helvetica cannot encode č/š/ž.
    font: path.join(process.cwd(), "public/fonts/invoice-liberation-sans.ttf"),
    info: { Title: copy.title },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(16).text(copy.title);
  doc.moveDown(0.4);
  doc.fontSize(9).text(copy.subtitle);

  doc.moveDown();
  doc.fontSize(10).text(`${copy.to}:`);
  doc.text(company.name);
  doc.text(company.address);
  doc.text(company.email);
  if (company.phone?.trim()) doc.text(company.phone.trim());

  doc.moveDown();
  for (const line of copy.lines) {
    doc.fontSize(10).text(line);
    doc.moveDown(0.8);
  }

  doc.moveDown();
  doc.fontSize(8).text(copy.hygieneNote);
  doc.moveDown(0.5);
  doc.text(copy.footer);

  doc.end();
  return done;
}
