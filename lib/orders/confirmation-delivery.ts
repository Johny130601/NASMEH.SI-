import { Prisma, type Order, type OrderItem } from "@prisma/client";
import { db } from "@/lib/db";
import { email as emailCopy } from "@/lib/copy/email";
import { sendOrderConfirmationEmail, type OrderConfirmationContent } from "@/lib/email/mailer";
import { buildInvoiceDataWithCompany } from "@/lib/invoice/data";
import { generateLegalTextsPdf, readLegalAcceptance, type LegalTextDocument } from "@/lib/invoice/legal-texts-pdf";
import { generateInvoicePdf } from "@/lib/invoice/pdf";
import { buildInvoiceSnapshot, invoiceSnapshotJson, readInvoiceSnapshot } from "@/lib/invoice/snapshot";
import { generateWithdrawalFormPdf } from "@/lib/returns/withdrawal-pdf";
import { siteUrl } from "@/lib/seo";
import { getCompany, getInvoiceFooter, getLegalLinks } from "@/lib/settings";
import { deliveryEstimate, getShippingMethods } from "@/lib/tracking";
import { legalLinkPath, legalLinkSlug } from "./legal-acceptance";

const LEASE_MS = 5 * 60_000;

/** The money-back guarantee page is a fixed storefront route, not a legal.links entry. */
const GUARANTEE_PATH = "/garancija-vracila-denarja";

type ConfirmationOrder = Order & { items: OrderItem[] };

/** Retryable: the confirmation carries the seller identity and is never sent without it. */
export class CompanySettingMissingError extends Error {
  constructor() {
    super("Company Setting missing or invalid");
    this.name = "CompanySettingMissingError";
  }
}

/** Not retryable: after erasure no confirmation is built or sent for the order. */
export class OrderAnonymizedError extends Error {
  constructor() {
    super("Order anonymised");
    this.name = "OrderAnonymizedError";
  }
}

/**
 * An invoice issued while the company Setting was unusable has no snapshot
 * (lib/orders/transitions.ts). It is frozen from the live Settings before its
 * first delivery, so the invoice sent equals the invoice later downloaded.
 */
async function ensureInvoiceSnapshot(order: ConfirmationOrder): Promise<ConfirmationOrder> {
  // An anonymised order's row holds scrubbed placeholders: freezing them would falsify the issued invoice.
  if (order.anonymizedAt) throw new OrderAnonymizedError();
  if (!order.invoiceIssuedAt || readInvoiceSnapshot(order.invoiceSnapshot)) return order;
  const [company, footer] = await Promise.all([getCompany(), getInvoiceFooter()]);
  if (!company) throw new CompanySettingMissingError();
  const snapshot = buildInvoiceSnapshot(order, company, footer, order.invoiceIssuedAt);
  const written = await db.order.updateMany({
    where: { id: order.id, invoiceSnapshot: { equals: Prisma.DbNull } },
    data: { invoiceSnapshot: invoiceSnapshotJson(snapshot) },
  });
  if (written.count === 1) return { ...order, invoiceSnapshot: snapshot as unknown as Order["invoiceSnapshot"] };
  return db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
}

/** Invoice, model withdrawal form, legal texts and the legal block's data for one order. */
export async function buildOrderConfirmationContent(order: ConfirmationOrder, now = new Date()): Promise<OrderConfirmationContent> {
  const issued = await ensureInvoiceSnapshot(order);
  const invoice = await buildInvoiceDataWithCompany(issued);
  if (!invoice.company) throw new CompanySettingMissingError();
  const seller = invoice.company;

  const [links, methods] = await Promise.all([getLegalLinks(), getShippingMethods()]);
  const base = siteUrl();
  const accepted = readLegalAcceptance(order.legalAcceptance);
  const documents: LegalTextDocument[] = await Promise.all(
    (["terms", "withdrawal"] as const).map(async (key) => {
      const path = legalLinkPath(links[key]);
      const slug = legalLinkSlug(path);
      const page = slug
        ? await db.contentPage.findFirst({ where: { slug, published: true }, select: { title: true, body: true, updatedAt: true } })
        : null;
      return {
        key,
        title: emailCopy.orderConfirmation.legal.links[key],
        url: `${base}${path}`,
        page,
        accepted: accepted.get(key) ?? null,
      };
    }),
  );

  const [invoicePdf, withdrawalFormPdf, legalTextsPdf] = await Promise.all([
    generateInvoicePdf(invoice),
    generateWithdrawalFormPdf(seller),
    // The bodies say the seller's details are "navedeni zgoraj": the attachment carries the
    // same identity as the invoice and the mail, so the PDF is readable on its own.
    generateLegalTextsPdf({ orderNumber: order.number, preparedAt: now, documents, seller }),
  ]);

  return {
    invoicePdf,
    withdrawalFormPdf,
    legalTextsPdf,
    estimate: deliveryEstimate(order.shippingMethod, methods),
    legal: {
      seller,
      links: {
        terms: `${base}${legalLinkPath(links.terms)}`,
        withdrawal: `${base}${legalLinkPath(links.withdrawal)}`,
        // /reklamacije is a static route, not part of the legal.links mapping.
        complaints: `${base}/reklamacije`,
        guarantee: `${base}${GUARANTEE_PATH}`,
      },
      accepted: {
        terms: accepted.get("terms")?.sha256 ?? null,
        withdrawal: accepted.get("withdrawal")?.sha256 ?? null,
      },
    },
  };
}

/**
 * The payment transaction persists pending delivery. A lease prevents normal
 * concurrent sends; a crashed worker becomes retryable when its lease expires.
 * SMTP is at-least-once: a crash after SMTP acceptance can still cause a retry.
 */
async function attemptOrderConfirmation(orderId: string): Promise<"sent" | "failed" | "skipped"> {
  const now = new Date();
  const claimed = await db.order.updateMany({
    where: {
      id: orderId,
      confirmationEmailPending: true,
      confirmationEmailSentAt: null,
      OR: [
        { confirmationEmailLeaseUntil: null },
        { confirmationEmailLeaseUntil: { lte: now } },
      ],
    },
    data: {
      confirmationEmailLeaseUntil: new Date(now.getTime() + LEASE_MS),
      confirmationEmailLastError: null,
    },
  });
  if (claimed.count === 0) return "skipped";

  try {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    // Erasure ends delivery: the address is a placeholder and the invoice would carry the frozen buyer identity.
    if (order.anonymizedAt || order.refundRequired || !order.stockDeducted || ["CANCELLED", "REFUNDED"].includes(order.status)) {
      await db.order.update({
        where: { id: orderId },
        data: { confirmationEmailPending: false, confirmationEmailLeaseUntil: null },
      });
      return "skipped";
    }
    await sendOrderConfirmationEmail(order, await buildOrderConfirmationContent(order, now));
    await db.order.update({
      where: { id: orderId },
      data: {
        confirmationEmailPending: false,
        confirmationEmailSentAt: new Date(),
        confirmationEmailLeaseUntil: null,
        confirmationEmailLastError: null,
      },
    });
    return "sent";
  } catch (error) {
    // Keep the durable pending flag so a webhook replay or the daily job retries.
    await db.order.update({
      where: { id: orderId },
      data: {
        confirmationEmailLeaseUntil: null,
        confirmationEmailLastError: error instanceof Error ? error.name : "DeliveryError",
      },
    });
    // SMTP error objects may contain recipient addresses; retain only the
    // bounded error type in the DB and keep operational logs free of PII.
    console.error("Order confirmation remains queued");
    return "failed";
  }
}

/** Preserve the payment/webhook caller's existing sent-or-not contract. */
export async function deliverOrderConfirmation(orderId: string): Promise<boolean> {
  return await attemptOrderConfirmation(orderId) === "sent";
}

export async function retryPendingOrderConfirmations(limit = 25) {
  const orders = await db.order.findMany({
    where: {
      confirmationEmailPending: true,
      confirmationEmailSentAt: null,
      OR: [
        { confirmationEmailLeaseUntil: null },
        { confirmationEmailLeaseUntil: { lte: new Date() } },
      ],
    },
    select: { id: true },
    orderBy: { paidAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });
  const result = { processed: orders.length, sent: 0, failed: 0, skipped: 0 };
  for (const order of orders) {
    result[await attemptOrderConfirmation(order.id)] += 1;
  }
  return result;
}
