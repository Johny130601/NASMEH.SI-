import type { Order, OrderItem } from "@prisma/client";
import { getCompany, getInvoiceFooter, type CompanySetting } from "@/lib/settings";
import { readInvoiceSnapshot, type InvoiceSnapshot } from "./snapshot";

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
  /** Buyer name frozen at issuance; null when only the address snapshot carries it. */
  customerName: string | null;
  customerEmail: string;
  address: Order["shippingAddress"];
  lines: InvoiceLine[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  vatRatePercent: number;
  vatCents: number;
  /** Tax base derived from the stored totals (total − VAT), never recalculated. */
  taxBaseCents: number;
  currency: string;
  /** Operator footer line (`invoice.footer` Setting), printed under the fixed VAT note. */
  footer: string | null;
}

/** Invoice data assembly (§14.7/§14.13) — totals come from the ORDER snapshot; seller and footer as given. */
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
    customerName: null,
    customerEmail: order.email,
    address: order.billingAddress ?? order.shippingAddress,
    lines,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    vatRatePercent: order.vatRatePercent,
    vatCents: order.vatCents,
    taxBaseCents: order.totalCents - order.vatCents,
    currency: order.currency,
    footer: footer?.trim() ? footer.trim() : null,
  };
}

/** The invoice as issued: seller, buyer, footer and issue date from `Order.invoiceSnapshot`. */
export function buildInvoiceDataFromSnapshot(
  order: Order & { items: OrderItem[] },
  snapshot: InvoiceSnapshot,
): InvoiceData {
  return {
    ...buildInvoiceData(order, snapshot.seller, snapshot.footer),
    issuedAt: new Date(snapshot.issuedAt),
    customerName: snapshot.buyer.name,
    customerEmail: snapshot.buyer.email,
    address: (snapshot.buyer.address ?? null) as Order["shippingAddress"],
  };
}

/**
 * Download route and confirmation mail: the frozen snapshot when the order has
 * one; orders issued before Phase 9 step 4 fall back to the live Settings.
 */
export async function buildInvoiceDataWithCompany(
  order: Order & { items: OrderItem[] },
): Promise<InvoiceData> {
  const snapshot = readInvoiceSnapshot(order.invoiceSnapshot);
  if (snapshot) return buildInvoiceDataFromSnapshot(order, snapshot);
  const [company, footer] = await Promise.all([getCompany(), getInvoiceFooter()]);
  return buildInvoiceData(order, company, footer);
}
