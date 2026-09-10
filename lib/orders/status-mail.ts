import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendOrderStatusEmail } from "@/lib/email/mailer";
import type { OrderStatusMailKind } from "@/lib/email/templates/order-status";

/**
 * Best-effort transition mail (processing, delivered, cancelled, refunded).
 * The outcome is written to the timeline; only confirmation and shipped mail
 * have durable retry queues (Phase 3 / Phase 6 step 3).
 */
export async function notifyOrderStatus(
  orderId: string,
  kind: OrderStatusMailKind,
  details: { amountCents?: number } = {},
): Promise<boolean> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.anonymizedAt) return false;
  let sent = false;
  try {
    await sendOrderStatusEmail(order, kind, details);
    sent = true;
  } catch {
    console.error("Order status mail not delivered", order.number, kind);
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`);
      const current = await tx.order.findUnique({ where: { id: orderId }, select: { timeline: true } });
      const timeline = Array.isArray(current?.timeline) ? current.timeline as Prisma.JsonArray : [];
      await tx.order.update({
        where: { id: orderId },
        data: { timeline: [...timeline, { at: new Date().toISOString(), event: sent ? `mail_sent:${kind}` : `mail_failed:${kind}` }] as Prisma.InputJsonValue },
      });
    });
  } catch {
    // The mail outcome is informational; a timeline write failure is not.
  }
  return sent;
}
