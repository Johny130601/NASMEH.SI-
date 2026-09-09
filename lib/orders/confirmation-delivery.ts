import { db } from "@/lib/db";
import { sendOrderConfirmationEmail } from "@/lib/email/mailer";
import { buildInvoiceDataWithCompany } from "@/lib/invoice/data";
import { generateInvoicePdf } from "@/lib/invoice/pdf";

const LEASE_MS = 5 * 60_000;

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
    if (order.refundRequired || !order.stockDeducted || ["CANCELLED", "REFUNDED"].includes(order.status)) {
      await db.order.update({
        where: { id: orderId },
        data: { confirmationEmailPending: false, confirmationEmailLeaseUntil: null },
      });
      return "skipped";
    }
    const data = await buildInvoiceDataWithCompany(order);
    await sendOrderConfirmationEmail(order, await generateInvoicePdf(data));
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
