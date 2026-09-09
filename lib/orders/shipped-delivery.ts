import { db } from "@/lib/db";
import { sendOrderShippedEmail } from "@/lib/email/mailer";
import { deliveryEstimate, getShippingMethods, trackingUrl } from "@/lib/tracking";

const LEASE_MS = 5 * 60_000;

/**
 * The shipment transition persists pending delivery (§12.3). Same contract as
 * the order confirmation: a lease prevents concurrent sends, a crashed worker
 * becomes retryable when its lease expires, SMTP is at-least-once.
 */
async function attemptOrderShipped(orderId: string): Promise<"sent" | "failed" | "skipped"> {
  const now = new Date();
  const claimed = await db.order.updateMany({
    where: {
      id: orderId,
      shippedEmailPending: true,
      shippedEmailSentAt: null,
      OR: [
        { shippedEmailLeaseUntil: null },
        { shippedEmailLeaseUntil: { lte: now } },
      ],
    },
    data: {
      shippedEmailLeaseUntil: new Date(now.getTime() + LEASE_MS),
      shippedEmailLastError: null,
    },
  });
  if (claimed.count === 0) return "skipped";

  try {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.trackingNumber || !["SHIPPED", "DELIVERED"].includes(order.status)) {
      await db.order.update({
        where: { id: orderId },
        data: { shippedEmailPending: false, shippedEmailLeaseUntil: null },
      });
      return "skipped";
    }
    const [trackingLink, methods] = await Promise.all([
      trackingUrl(order.carrier, order.trackingNumber),
      getShippingMethods(),
    ]);
    await sendOrderShippedEmail(order, {
      trackingLink,
      estimate: deliveryEstimate(order.shippingMethod, methods),
    });
    await db.order.update({
      where: { id: orderId },
      data: {
        shippedEmailPending: false,
        shippedEmailSentAt: new Date(),
        shippedEmailLeaseUntil: null,
        shippedEmailLastError: null,
      },
    });
    return "sent";
  } catch (error) {
    await db.order.update({
      where: { id: orderId },
      data: {
        shippedEmailLeaseUntil: null,
        shippedEmailLastError: error instanceof Error ? error.name : "DeliveryError",
      },
    });
    // Only the bounded error type is stored; logs stay free of recipient data.
    console.error("Shipped notification remains queued");
    return "failed";
  }
}

/** Post-transition caller contract: true only when the mail was accepted now. */
export async function deliverOrderShipped(orderId: string): Promise<boolean> {
  return await attemptOrderShipped(orderId) === "sent";
}

export async function retryPendingShippedEmails(limit = 25) {
  const orders = await db.order.findMany({
    where: {
      shippedEmailPending: true,
      shippedEmailSentAt: null,
      OR: [
        { shippedEmailLeaseUntil: null },
        { shippedEmailLeaseUntil: { lte: new Date() } },
      ],
    },
    select: { id: true },
    orderBy: { shippedAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });
  const result = { processed: orders.length, sent: 0, failed: 0, skipped: 0 };
  for (const order of orders) {
    result[await attemptOrderShipped(order.id)] += 1;
  }
  return result;
}
