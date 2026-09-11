import type { Order, OrderItem } from "@prisma/client";
import { getCompany, getInvoiceFooter, type CompanySetting } from "@/lib/settings";

export interface InvoiceLine {
  title: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface InvoiceData {
  number: string;
  issuedAt: Date;
  company: CompanySetting | null;
  customerEmail: string;
  address: Order["shippingAddress"];
  lines: InvoiceLine[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  vatRatePercent: number;
  vatCents: number;
  currency: string;
  /** Operator footer line (`invoice.footer` Setting), printed under the fixed VAT note. */
  footer: string | null;
}

/** Invoice data assembly (§14.7/§14.13) — totals come from the ORDER snapshot. */
export function buildInvoiceData(
  order: Order & { items: OrderItem[] },
  company: CompanySetting | null = null,
  footer: string | null = null,
): InvoiceData {
  const lines: InvoiceLine[] = order.items.map((item) => ({
    title: item.title,
    sku: item.sku,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    lineTotalCents: item.unitPriceCents * item.quantity,
  }));

  return {
    number: order.invoiceNumber ?? order.number,
    issuedAt: order.invoiceIssuedAt ?? order.paidAt ?? order.createdAt,
    company,
    customerEmail: order.email,
    address: order.billingAddress ?? order.shippingAddress,
    lines,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    vatRatePercent: order.vatRatePercent,
    vatCents: order.vatCents,
    currency: order.currency,
    footer: footer?.trim() ? footer.trim() : null,
  };
}

export async function buildInvoiceDataWithCompany(
  order: Order & { items: OrderItem[] },
): Promise<InvoiceData> {
  const [company, footer] = await Promise.all([getCompany(), getInvoiceFooter()]);
  return buildInvoiceData(order, company, footer);
}
