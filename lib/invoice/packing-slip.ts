import PDFDocument from "pdfkit";
import path from "node:path";
import type { Order, OrderItem } from "@prisma/client";
import { admin } from "@/lib/copy/admin";
import type { CompanySetting } from "@/lib/settings";
import { snapshotAddressLines } from "@/lib/account/order-view";

const copy = admin.packingSlip;

/** Packing slip (§14.7): what goes in the parcel, bundle components expanded, no prices. */
export async function generatePackingSlipPdf(
  order: Order & { items: OrderItem[] },
  company: CompanySetting | null,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    font: path.join(process.cwd(), "public/fonts/invoice-liberation-sans.ttf"),
    info: { Title: `${copy.title} ${order.number}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(18).text(`${copy.title} ${order.number}`);
  doc.moveDown(0.5);
  doc.fontSize(9).text(`${copy.date}: ${new Date().toLocaleDateString("sl-SI")}`);
  if (order.shippingMethod) doc.text(`${copy.method}: ${order.shippingMethod}`);
  if (company) {
    doc.moveDown();
    doc.fontSize(11).text(company.name);
    doc.fontSize(9).text(company.address);
  }

  doc.moveDown();
  doc.fontSize(11).text(copy.shipTo);
  doc.fontSize(9);
  for (const line of snapshotAddressLines(order.shippingAddress)) doc.text(line);
  if (order.phone) doc.text(order.phone);

  doc.moveDown();
  doc.fontSize(11).text(copy.items);
  doc.moveDown(0.3);
  for (const item of order.items) {
    doc.fontSize(10).text(`${item.quantity} × ${item.title} (${item.sku})`);
    const properties = item.properties as { bundleComponents?: Array<{ title?: unknown; quantity?: unknown }> } | null;
    if (properties?.bundleComponents && Array.isArray(properties.bundleComponents)) {
      for (const component of properties.bundleComponents) {
        if (typeof component.title === "string" && typeof component.quantity === "number") {
          doc.fontSize(9).text(`    ${copy.component}: ${component.quantity * item.quantity} × ${component.title}`);
        }
      }
    }
    doc.moveDown(0.2);
  }

  doc.moveDown();
  doc.fontSize(8).text(copy.footer);
  doc.end();
  return done;
}
