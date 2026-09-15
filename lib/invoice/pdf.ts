import PDFDocument from "pdfkit";
import path from "node:path";
import { formatEUR } from "@/lib/pricing";
import { invoice as copy } from "@/lib/copy/invoice";
import type { InvoiceData } from "./data";
import { snapshotAddressLines } from "@/lib/account/order-view";

/** The embedded OFL Unicode font every generated PDF uses (Helvetica cannot encode č/š/ž). */
export const PDF_FONT_PATH = path.join(process.cwd(), "public/fonts/invoice-liberation-sans.ttf");

/** PDF invoice (§14.7) — pdfkit, dependency-light, standalone-safe. */
export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  // Embed a complete, OFL-licensed Unicode font. PDF's built-in Helvetica
  // cannot encode Slovenian č/š/ž. public/ ships with both runtime packages.
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    font: PDF_FONT_PATH,
    info: { Title: copy.title(data.number) },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(18).text(copy.title(data.number), { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(9).text(copy.issuedAt(data.issuedAt));

  if (data.company) {
    doc.moveDown();
    doc.fontSize(11).text(data.company.name);
    doc.fontSize(9).text(data.company.address);
    doc.text(copy.registration(data.company.registrationNumber));
    doc.text(copy.vatId(data.company.vatId));
    doc.text(copy.email(data.company.email));
    if (data.company.phone?.trim()) doc.text(copy.phone(data.company.phone.trim()));
  }

  doc.moveDown();
  doc.fontSize(11).text(copy.customer);
  doc.fontSize(9);
  const addressLines = snapshotAddressLines(data.address);
  if (data.customerName && !addressLines.includes(data.customerName)) doc.text(data.customerName);
  doc.text(data.customerEmail);
  for (const line of addressLines) doc.text(line);

  doc.moveDown();
  doc.fontSize(10).text(copy.items);
  doc.moveDown(0.3);
  for (const line of data.lines) {
    doc
      .fontSize(9)
      .text(
        `${line.title} (${line.sku}) - ${line.quantity} × ${formatEUR(line.unitPriceCents)} = ${formatEUR(line.lineTotalCents)}`,
      );
  }

  doc.moveDown();
  doc.fontSize(9).text(`${copy.subtotal}: ${formatEUR(data.subtotalCents)}`);
  if (data.discountCents > 0) {
    doc.text(`${copy.discount}: -${formatEUR(data.discountCents)}`);
  }
  doc.text(`${copy.shipping}: ${formatEUR(data.shippingCents)}`);
  // Tax is the immutable paid-order snapshot, not a new calculation at download.
  doc.text(copy.taxBase(data.vatRatePercent, data.taxBaseCents));
  doc.text(copy.vat(data.vatRatePercent, data.vatCents));
  doc.fontSize(12).text(`${copy.total}: ${formatEUR(data.totalCents)}`, {
    align: "right",
  });

  doc.moveDown();
  doc
    .fontSize(8)
    .text(copy.footer);
  if (data.footer) doc.text(data.footer);

  doc.end();
  return done;
}
