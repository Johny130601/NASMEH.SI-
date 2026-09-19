import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { InvalidReviewPhoto } from "@/lib/reviews/photo-storage";
import { getContactSettings } from "./settings";
import { prepareSupportPhotos, saveSupportPhotos, removeSupportPhotos } from "./photos";
import { contactPayloadHash, privacyNoticeVersion, ticketDetailsForInput, type ContactInput } from "./validation";

export type ContactTicketResult =
  /** `orderLinked`: whether the ticket carries a verified order (a withdrawal or an adverse-event
   * report is still recorded when the stated number cannot be proved, and reports it unlinked). */
  | { ok: true; ticketId: string; reference: string; orderLinked: boolean }
  | { ok: false; error: "orderNotFound" | "photos" | "conflict" | "failed" };

/** Contact proof is deliberately separate from checkout access capabilities. */
export async function resolveContactOrder(input: ContactInput, userId: string | null) {
  if (!input.orderNumber) return null;
  const order = await db.order.findUnique({
    where: { number: input.orderNumber }, select: { id: true, number: true, userId: true, email: true },
  });
  if (!order) return null;
  if (userId && order.userId === userId) return { id: order.id, number: order.number, proof: "ACCOUNT" };
  if (input.orderEmail && order.email.toLowerCase() === input.orderEmail) {
    return { id: order.id, number: order.number, proof: "EMAIL_NUMBER" };
  }
  return null;
}

/**
 * Notices recorded without an order link that name this order number
 * (details.claimedOrderNumber) — a withdrawal or an adverse-event report — newest
 * first, so the order's admin page shows them to staff who handle the order but
 * cannot open the ticket queue.
 */
export async function listUnlinkedTicketsClaimingOrder(orderNumber: string) {
  return db.ticket.findMany({
    where: { orderId: null, details: { path: ["claimedOrderNumber"], equals: orderNumber } },
    select: { id: true, reference: true, topic: true, reason: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

/** RETURN: the money-back guarantee page asks for a photo of the product and packaging through this topic. */
const PHOTO_TOPICS: ReadonlySet<string> = new Set(["WRONG", "DAMAGED", "RETURN", "ADVERSE"]);

/** Durable creation is independent of SMTP. Only exact replays reuse a receipt. */
export async function createContactTicket(input: ContactInput, files: File[], userId: string | null): Promise<ContactTicketResult> {
  if (files.length && !PHOTO_TOPICS.has(input.topic)) return { ok: false, error: "photos" };
  // Hash supplied bytes before encoding so a changed attachment cannot reuse a key.
  const digests: string[] = [];
  for (const file of files) {
    if (file.size > 2 * 1024 * 1024 || files.length > 4) return { ok: false, error: "photos" };
    digests.push(createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"));
  }
  const payloadHash = contactPayloadHash(input, userId, digests);
  const replay = async (): Promise<ContactTicketResult | null> => {
    const existing = await db.ticket.findUnique({ where: { submissionKey: input.requestKey }, select: { id: true, reference: true, payloadHash: true, orderId: true } });
    if (!existing) return null;
    return existing.payloadHash === payloadHash
      ? { ok: true, ticketId: existing.id, reference: existing.reference, orderLinked: existing.orderId !== null }
      : { ok: false, error: "conflict" };
  };
  const existing = await replay();
  if (existing) return existing;
  const order = await resolveContactOrder(input, userId);
  // Any unequivocal statement sent in time is a valid withdrawal (Directive 2011/83/EU
  // Art. 11(1)), and an adverse-event report is a vigilance notice that must never be
  // lost over an optional field — the reporter may be a carer or a professional, so the
  // stated order was bought by someone else and can never match. Both are recorded
  // without an order link, keeping the number as stated for staff to verify by hand.
  // Other forms still refuse an order number they cannot prove.
  const stated = ticketDetailsForInput(input);
  const unlinkedNotice = !!input.orderNumber && !order && (stated?.kind === "withdrawal" || input.topic === "ADVERSE");
  if (input.orderNumber && !order && !unlinkedNotice) return { ok: false, error: "orderNotFound" };
  const details = unlinkedNotice
    ? { ...stated, claimedOrderNumber: input.orderNumber }
    : stated;

  let saved: Array<{ filename: string; size: number }> = [];
  let persisted = false;
  try {
    const settings = await getContactSettings();
    saved = await saveSupportPhotos(await prepareSupportPhotos(files));
    const reference = `NP-${randomBytes(6).toString("hex").toUpperCase()}`;
    const ticket = await db.$transaction(async tx => {
      // A concurrent order/user deletion should roll back the entire ticket.
      return tx.ticket.create({ data: {
        reference, submissionKey: input.requestKey, payloadHash,
        userId, orderId: order?.id ?? null, orderNumber: order?.number ?? null, orderProof: order?.proof ?? null,
        topic: input.topic, reason: input.reason, name: input.name, email: input.email, message: input.message,
        ...(details ? { details: details as Prisma.InputJsonObject } : {}),
        privacyAcceptedAt: new Date(), privacyVersion: privacyNoticeVersion(input),
        attachments: { create: saved },
        deliveries: { create: [
          { kind: "STAFF", recipient: input.topic === "ADVERSE" ? settings.complianceEmail : settings.supportEmail },
          { kind: "CUSTOMER", recipient: input.email },
        ] },
      }, select: { id: true, reference: true } });
    });
    persisted = true;
    return { ok: true, ticketId: ticket.id, reference: ticket.reference, orderLinked: order !== null };
  } catch (error) {
    if (error instanceof InvalidReviewPhoto) return { ok: false, error: "photos" };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const repeated = await replay();
      if (repeated) return repeated;
    }
    console.error("Contact request persistence failed");
    return { ok: false, error: "failed" };
  } finally {
    if (!persisted && saved.length) await removeSupportPhotos(saved);
  }
}
