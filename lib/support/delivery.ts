import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { authEmailSchema } from "@/lib/auth-validation";
import { sendMail } from "@/lib/email/mailer";
import { resolveMail } from "@/lib/email/templates/render";
import { renderSupportStaffEmail, renderSupportCustomerEmail, ticketDetailsKind } from "@/lib/email/templates/support-ticket";
import { supportEmail } from "@/lib/copy/support-email";

const LEASE_MS = 5 * 60_000;
export interface TicketDeliveryCounters { processed: number; sent: number; failed: number; skipped: number }

/** The receipt is the one support mail an operator may override (§14.11 "withdrawal received"). */
async function customerReceipt(reference: string, details: unknown) {
  const kind = ticketDetailsKind(details);
  return resolveMail("supportReceipt", { reference, note: kind ? supportEmail.customer.notes[kind] : "" },
    () => renderSupportCustomerEmail({ reference, kind }));
}

/** One claim per persisted recipient. SMTP acceptance and the DB acknowledgement
 * cannot be atomic; after a crash that gap is retried with the same Message-ID. */
async function deliverOne(id: string): Promise<"sent" | "failed" | "skipped"> {
  const leaseToken = randomUUID();
  const now = new Date();
  try {
    const claimed = await db.ticketEmailDelivery.updateMany({
      where: { id, sentAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
      data: { leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 }, lastError: null },
    });
    if (claimed.count !== 1) return "skipped";
    const delivery = await db.ticketEmailDelivery.findUnique({
      where: { id }, include: { ticket: { include: { attachments: { select: { id: true } } } } },
    });
    if (!delivery || delivery.sentAt || delivery.leaseToken !== leaseToken) return "skipped";
    const recipient = authEmailSchema.parse(delivery.recipient);
    const content = delivery.kind === "STAFF"
      ? renderSupportStaffEmail(delivery.ticket)
      : await customerReceipt(delivery.ticket.reference, delivery.ticket.details);
    await sendMail({
      ...content, to: recipient,
      ...(delivery.kind === "STAFF" ? { replyTo: authEmailSchema.parse(delivery.ticket.email) } : {}),
      messageId: `<support-ticket.${delivery.id}@nasmeh.si>`,
    });
    const acknowledged = await db.ticketEmailDelivery.updateMany({
      where: { id, leaseToken, sentAt: null },
      data: { sentAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null },
    });
    if (acknowledged.count !== 1) throw new Error("Delivery acknowledgement lost its lease");
    return "sent";
  } catch {
    await db.ticketEmailDelivery.updateMany({
      where: { id, leaseToken, sentAt: null },
      data: { leaseToken: null, leaseUntil: null, lastError: "DeliveryError" },
    }).catch(() => undefined);
    console.error("Support ticket email remains queued");
    return "failed";
  }
}

async function deliverRows(rows: Array<{ id: string }>): Promise<TicketDeliveryCounters> {
  const counters = { processed: rows.length, sent: 0, failed: 0, skipped: 0 };
  for (const row of rows) counters[await deliverOne(row.id)] += 1;
  return counters;
}

/** Called only after the ticket and both delivery rows have committed. */
export async function deliverTicketEmails(ticketId: string): Promise<TicketDeliveryCounters> {
  const rows = await db.ticketEmailDelivery.findMany({
    where: { ticketId, sentAt: null }, select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 2,
  });
  return deliverRows(rows);
}

/** Attempt ordering rotates retryable failures instead of blocking newer rows. */
export async function retryPendingTicketEmails(limit = 50): Promise<TicketDeliveryCounters> {
  const take = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit))) : 50;
  const now = new Date();
  const rows = await db.ticketEmailDelivery.findMany({
    where: { sentAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    select: { id: true }, orderBy: [{ attempts: "asc" }, { createdAt: "asc" }, { id: "asc" }], take,
  });
  return deliverRows(rows);
}
