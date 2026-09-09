import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { test, expect } from "@playwright/test";
import { prisma } from "./helpers";
import { db } from "@/lib/db";
import { contactInputSchema } from "@/lib/support/validation";
import { createContactTicket } from "@/lib/support/tickets";
import { removeSupportPhotos, SUPPORT_UPLOAD_DIR } from "@/lib/support/photos";

test.afterAll(async () => { await Promise.all([prisma.$disconnect(), db.$disconnect()]); });

test("simultaneous exact contact submissions persist one ticket and clean losing uploads", async ({ request }) => {
  const key = randomUUID();
  const input = contactInputSchema.parse({ requestKey: key, name: "Concurrency check", email: `contact-${key}@example.test`, topic: "DAMAGED", reason: "PRODUCT_DAMAGED", message: "Isolated damaged product test request", privacyAccepted: true });
  const buffer = await sharp({ create: { width: 30, height: 20, channels: 3, background: "white" } }).png().toBuffer();
  const file = new File([new Uint8Array(buffer)], "damage.png", { type: "image/png" });
  const before = new Set(await readdir(SUPPORT_UPLOAD_DIR).catch(() => []));
  try {
    const results = await Promise.all(Array.from({ length: 4 }, () => createContactTicket(input, [file], null)));
    expect(results.every(result => result.ok)).toBe(true);
    expect(new Set(results.map(result => result.ok ? result.reference : "failed")).size).toBe(1);
    const tickets = await prisma.ticket.findMany({ where: { submissionKey: key }, include: { attachments: true, deliveries: true } });
    expect(tickets).toHaveLength(1); const ticket = tickets[0];
    expect(ticket.attachments).toHaveLength(1); expect(ticket.deliveries).toHaveLength(2);
    expect((await readdir(SUPPORT_UPLOAD_DIR)).filter(filename => !before.has(filename))).toEqual([ticket.attachments[0].filename]);
    expect((await request.get(`/api/support/attachments/${ticket.attachments[0].id}`)).status()).toBe(404);
    expect((await request.get(`/uploads/support/${ticket.attachments[0].filename}`)).status()).toBe(404);
    const beforeRows = await prisma.ticket.count({ where: { submissionKey: key } });
    expect(await createContactTicket({ ...input, message: "Different message with the same key" }, [file], null)).toEqual({ ok: false, error: "conflict" });
    expect(await prisma.ticket.count({ where: { submissionKey: key } })).toBe(beforeRows);
    // Real job retries use separate durable rows; parallel invocations do not duplicate either leg.
    const jobs = await Promise.all([0, 1].map(() => request.post("/api/jobs/daily", { headers: { authorization: "Bearer jobs_e2e_secret" } })));
    expect(jobs.every(job => job.status() === 200)).toBe(true);
    const bodies = await Promise.all(jobs.map(job => job.json()));
    expect(bodies.reduce((count, body) => count + body.ticketRetries.sent, 0)).toBe(2);
    const deliveries = await prisma.ticketEmailDelivery.findMany({ where: { ticketId: ticket.id } });
    expect(deliveries.every(delivery => delivery.sentAt !== null && delivery.attempts === 1)).toBe(true);
  } finally {
    const tickets = await prisma.ticket.findMany({ where: { submissionKey: key }, include: { attachments: true } });
    for (const ticket of tickets) await removeSupportPhotos(ticket.attachments);
    await prisma.ticket.deleteMany({ where: { submissionKey: key } });
  }
});

test("contact context checks live order ownership and never changes a cancellation target", async () => {
  const key = randomUUID();
  const owner = await prisma.user.create({ data: { email: `contact-owner-${key}@example.test` } });
  const order = await prisma.order.create({ data: { number: `NS-2099-${String(Math.floor(Math.random() * 90000) + 10000)}`, email: owner.email, userId: owner.id, status: "PAID", subtotalCents: 1999, totalCents: 1999, vatCents: 360, shippingAddress: {} } });
  const input = contactInputSchema.parse({ requestKey: key, name: "Context test", email: `reporter-${key}@example.test`, topic: "CANCEL", reason: "CHANGED_MIND", message: "Please review this cancellation request", privacyAccepted: true, orderNumber: order.number });
  try {
    expect(await createContactTicket(input, [], null)).toEqual({ ok: false, error: "orderNotFound" });
    expect(await createContactTicket({ ...input, orderEmail: "wrong@example.test" }, [], null)).toEqual({ ok: false, error: "orderNotFound" });
    const accepted = await createContactTicket({ ...input, orderEmail: owner.email }, [], null);
    expect(accepted.ok).toBe(true);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { submissionKey: key } });
    expect(ticket.orderId).toBe(order.id); expect(ticket.userId).toBeNull(); expect(ticket.orderProof).toBe("EMAIL_NUMBER");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    await prisma.order.update({ where: { id: order.id }, data: { email: `changed-${key}@example.test` } });
    expect(await createContactTicket({ ...input, requestKey: randomUUID(), orderEmail: owner.email }, [], null)).toEqual({ ok: false, error: "orderNotFound" });
    const fromAccount = await createContactTicket({ ...input, requestKey: randomUUID() }, [], owner.id);
    expect(fromAccount.ok).toBe(true);
  } finally {
    const tickets = await prisma.ticket.findMany({ where: { orderId: order.id }, include: { attachments: true } });
    for (const ticket of tickets) await removeSupportPhotos(ticket.attachments);
    await prisma.ticket.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } }); await prisma.user.delete({ where: { id: owner.id } });
  }
});
