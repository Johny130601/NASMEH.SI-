import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { InvalidReviewPhoto } from "@/lib/reviews/photo-storage";
import { getContactSettings } from "./settings";
import { prepareSupportPhotos, saveSupportPhotos, removeSupportPhotos } from "./photos";
import { contactPayloadHash, CONTACT_PRIVACY_VERSION, type ContactInput } from "./validation";

export type ContactTicketResult =
  | { ok: true; ticketId: string; reference: string }
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

/** Durable creation is independent of SMTP. Only exact replays reuse a receipt. */
export async function createContactTicket(input: ContactInput, files: File[], userId: string | null): Promise<ContactTicketResult> {
  if (files.length && input.topic !== "WRONG" && input.topic !== "DAMAGED") return { ok: false, error: "photos" };
  // Hash supplied bytes before encoding so a changed attachment cannot reuse a key.
  const digests: string[] = [];
  for (const file of files) {
    if (file.size > 2 * 1024 * 1024 || files.length > 4) return { ok: false, error: "photos" };
    digests.push(createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"));
  }
  const payloadHash = contactPayloadHash(input, userId, digests);
  const replay = async (): Promise<ContactTicketResult | null> => {
    const existing = await db.ticket.findUnique({ where: { submissionKey: input.requestKey }, select: { id: true, reference: true, payloadHash: true } });
    if (!existing) return null;
    return existing.payloadHash === payloadHash
      ? { ok: true, ticketId: existing.id, reference: existing.reference }
      : { ok: false, error: "conflict" };
  };
  const existing = await replay();
  if (existing) return existing;
  const order = await resolveContactOrder(input, userId);
  if (input.orderNumber && !order) return { ok: false, error: "orderNotFound" };

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
        privacyAcceptedAt: new Date(), privacyVersion: CONTACT_PRIVACY_VERSION,
        attachments: { create: saved },
        deliveries: { create: [
          { kind: "STAFF", recipient: input.topic === "ADVERSE" ? settings.complianceEmail : settings.supportEmail },
          { kind: "CUSTOMER", recipient: input.email },
        ] },
      }, select: { id: true, reference: true } });
    });
    persisted = true;
    return { ok: true, ticketId: ticket.id, reference: ticket.reference };
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
