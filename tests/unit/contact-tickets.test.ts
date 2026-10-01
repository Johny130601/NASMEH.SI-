import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ ticket: vi.fn(), findMany: vi.fn(), create: vi.fn(), order: vi.fn(), transaction: vi.fn(), settings: vi.fn(), prepare: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { ticket: { findUnique: mocks.ticket, findMany: mocks.findMany }, order: { findUnique: mocks.order }, $transaction: mocks.transaction } }));
vi.mock("@/lib/support/settings", () => ({ getContactSettings: mocks.settings }));
vi.mock("@/lib/support/photos", () => ({ prepareSupportPhotos: mocks.prepare, saveSupportPhotos: mocks.save, removeSupportPhotos: mocks.remove }));
import { createContactTicket, listUnlinkedTicketsClaimingOrder } from "@/lib/support/tickets";
import { contactInputSchema, contactPayloadHash, PRIVACY_NOTICE_VERSIONS, WITHDRAWAL_STATUTORY_BASIS } from "@/lib/support/validation";
import { InvalidReviewPhoto } from "@/lib/reviews/photo-storage";

const input = contactInputSchema.parse({ requestKey: "0ea827bf-3fd0-4b4d-af19-8f80d4661888", name: "Živa Ščuk", email: "ziva@example.test", topic: "ADVICE", reason: "HOW_TO_USE", message: "Prosim za pomoč pri uporabi izdelka.", privacyAccepted: true });
const saved = [{ filename: `${"a".repeat(24)}.webp`, size: 40 }];
beforeEach(() => {
  vi.resetAllMocks(); mocks.ticket.mockResolvedValue(null); mocks.order.mockResolvedValue(null);
  mocks.settings.mockResolvedValue({ supportEmail: "support@example.test", complianceEmail: "compliance@example.test" });
  mocks.prepare.mockResolvedValue([]); mocks.save.mockResolvedValue([]); mocks.remove.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ id: "ticket-id", reference: "NP-RECEIPT" });
  mocks.transaction.mockImplementation(callback => callback({ ticket: { create: mocks.create } }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("durable contact tickets", () => {
  it.each(["ADVICE", "ADVERSE"] as const)("atomically persists separate receipt/staff legs and server routes %s", async topic => {
    const result = await createContactTicket({ ...input, topic, reason: topic === "ADVERSE" ? "REACTION" : input.reason }, [], null);
    expect(result).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT", orderLinked: false });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.deliveries.create).toEqual([{ kind: "STAFF", recipient: topic === "ADVERSE" ? "compliance@example.test" : "support@example.test" }, { kind: "CUSTOMER", recipient: input.email }]);
    expect(data.privacyAcceptedAt).toBeInstanceOf(Date); expect(data.privacyVersion).toBe(PRIVACY_NOTICE_VERSIONS.contact);
    expect(data.attachments.create).toEqual([]); expect(data.orderId).toBeNull();
  });
  it("persists structured details and allows photos for adverse reports", async () => {
    const photo = new File(["png bytes"], "photo.png", { type: "image/png" });
    mocks.save.mockResolvedValue(saved);
    const details = { kind: "adverse" as const, batchNumber: "LOT 1" };
    const result = await createContactTicket({ ...input, topic: "ADVERSE", reason: "REACTION", details }, [photo], null);
    expect(result).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT", orderLinked: false });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ topic: "ADVERSE", details, attachments: { create: saved }, privacyVersion: PRIVACY_NOTICE_VERSIONS.adverse });
    expect(data.deliveries.create[0].recipient).toBe("compliance@example.test");
    expect(typeof data.payloadHash).toBe("string");
  });
  it("requires proof again when the submitted order is not owned by the current user", async () => {
    mocks.order.mockResolvedValue({ id: "o", number: "NS-2026-00001", userId: "owner", email: "buyer@example.test" });
    expect(await createContactTicket({ ...input, orderNumber: "NS-2026-00001" }, [], "other")).toEqual({ ok: false, error: "orderNotFound" });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("records an unmatched withdrawal notice without an order link, keeping the stated number in details", async () => {
    mocks.order.mockResolvedValue({ id: "o", number: "NS-2026-00001", userId: null, email: "buyer@example.test" });
    const details = { kind: "withdrawal" as const, items: "1 × trakci" };
    const withdrawal = { ...input, topic: "RETURN" as const, reason: "WITHDRAWAL", orderNumber: "NS-2026-00001", orderEmail: "someone-else@example.test", details };
    expect(await createContactTicket(withdrawal, [], null)).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT", orderLinked: false });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orderId: null, orderNumber: null, orderProof: null, privacyVersion: PRIVACY_NOTICE_VERSIONS.withdrawal });
    expect(data.details).toEqual({ ...details, claimedOrderNumber: "NS-2026-00001" });
    expect(data.deliveries.create).toHaveLength(2);
    // A matched notice links the order and adds no claimed number.
    mocks.create.mockClear();
    const matched = await createContactTicket({ ...withdrawal, requestKey: "1ea827bf-3fd0-4b4d-af19-8f80d4661888", orderEmail: "buyer@example.test" }, [], null);
    expect(matched).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT", orderLinked: true });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ orderId: "o", orderProof: "EMAIL_NUMBER", details });
    expect(mocks.create.mock.calls[0][0].data.details).not.toHaveProperty("claimedOrderNumber");
  });
  it("stores a RETURN/WITHDRAWAL contact message as a withdrawal without the model form's fields, keeping the contact privacy version (S8/U19)", async () => {
    const contactWithdrawal = { ...input, topic: "RETURN" as const, reason: "WITHDRAWAL", message: "Odstopam od pogodbe za naročilo NS-2026-00001." };
    expect(await createContactTicket(contactWithdrawal, [], null)).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT", orderLinked: false });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.details).toEqual({ kind: "withdrawal", statutoryBasis: WITHDRAWAL_STATUTORY_BASIS, viaContactForm: true });
    expect(data.privacyVersion).toBe(PRIVACY_NOTICE_VERSIONS.contact);
    expect(data.payloadHash).toBe(contactPayloadHash(contactWithdrawal, null, []));
    // Other return reasons carry no details.
    mocks.create.mockClear();
    await createContactTicket({ ...input, requestKey: "2ea827bf-3fd0-4b4d-af19-8f80d4661888", topic: "RETURN", reason: "CHANGED_MIND" }, [], null);
    expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty("details");
  });

  it("records a contact-form withdrawal naming an order it cannot verify, like the dedicated form", async () => {
    mocks.order.mockResolvedValue({ id: "o", number: "NS-2026-00001", userId: "owner", email: "buyer@example.test" });
    const contactWithdrawal = { ...input, topic: "RETURN" as const, reason: "WITHDRAWAL", orderNumber: "NS-2026-00001", orderEmail: "" };
    expect(await createContactTicket(contactWithdrawal, [], "someone-else")).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT", orderLinked: false });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      orderId: null, orderNumber: null, privacyVersion: PRIVACY_NOTICE_VERSIONS.contact,
      details: { kind: "withdrawal", viaContactForm: true, claimedOrderNumber: "NS-2026-00001" },
    });
    // A different contact reason with the same unverifiable order is still refused.
    expect(await createContactTicket({ ...contactWithdrawal, requestKey: "3ea827bf-3fd0-4b4d-af19-8f80d4661888", reason: "RETURN_QUESTION" }, [], "someone-else")).toEqual({ ok: false, error: "orderNotFound" });
  });

  it("lists unlinked tickets that name an order number for the order's admin page, telling withdrawals from other reports (U9, QA T4-F5)", async () => {
    const withdrawal = { id: "t1", reference: "NP-1", topic: "RETURN", reason: "WITHDRAWAL", status: "OPEN", createdAt: new Date() };
    const adverseReport = { id: "t2", reference: "NP-2", topic: "ADVERSE", reason: "REACTION", status: "OPEN", createdAt: new Date() };
    mocks.findMany.mockResolvedValue([withdrawal, adverseReport]);
    expect(await listUnlinkedTicketsClaimingOrder("NS-2026-00001")).toEqual([{ ...withdrawal, kind: "withdrawal" }, { ...adverseReport, kind: "other" }]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { orderId: null, details: { path: ["claimedOrderNumber"], equals: "NS-2026-00001" } },
      select: { id: true, reference: true, topic: true, reason: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 20,
    });
  });

  // A vigilance notice is never lost to an optional field: a carer may report for the buyer,
  // so the stated number is kept as a claim and the ticket is recorded unlinked.
  it("records an adverse report with an unmatched order number as unlinked, keeping the claim", async () => {
    const details = { kind: "adverse" as const, batchNumber: "LOT 1" };
    const result = await createContactTicket({ ...input, topic: "ADVERSE", reason: "REACTION", orderNumber: "NS-2026-00001", orderEmail: input.email, details }, [], null);
    expect(result).toMatchObject({ ok: true, orderLinked: false });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ orderId: null, topic: "ADVERSE" });
    expect(mocks.create.mock.calls[0][0].data.details).toMatchObject({ kind: "adverse", batchNumber: "LOT 1", claimedOrderNumber: "NS-2026-00001" });
  });
  it.each(["ACCOUNT", "EMAIL_NUMBER"])("attaches a verified %s context without changing order state", async proof => {
    mocks.order.mockResolvedValue({ id: "o", number: "NS-2026-00001", userId: "owner", email: "Buyer@Example.Test" });
    await createContactTicket({ ...input, orderNumber: "NS-2026-00001", orderEmail: proof === "EMAIL_NUMBER" ? "buyer@example.test" : "" }, [], proof === "ACCOUNT" ? "owner" : null);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ orderId: "o", orderNumber: "NS-2026-00001", orderProof: proof });
  });
  it("returns only the same receipt for an exact replay, without file writes or another ticket", async () => {
    await createContactTicket(input, [], "owner");
    const hash = mocks.create.mock.calls[0][0].data.payloadHash;
    mocks.ticket.mockResolvedValue({ id: "ticket-id", reference: "NP-RECEIPT", payloadHash: hash, orderId: null });
    expect(await createContactTicket(input, [], "owner")).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT", orderLinked: false });
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.save).toHaveBeenCalledOnce();
    expect(await createContactTicket({ ...input, message: "Different valid message" }, [], "owner")).toEqual({ ok: false, error: "conflict" });
    expect(await createContactTicket(input, [], "other")).toEqual({ ok: false, error: "conflict" });
  });
  it("handles a concurrent unique-key loser and removes only its unused generated files", async () => {
    const photo = new File(["png bytes"], "photo.png", { type: "image/png" });
    const wrong = { ...input, topic: "WRONG" as const, reason: "WRONG_ITEM" };
    mocks.save.mockResolvedValue(saved);
    mocks.create.mockImplementation(async ({ data }) => {
      mocks.ticket.mockResolvedValue({ id: "winner", reference: "NP-WINNER", payloadHash: data.payloadHash, orderId: "o" });
      throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6", meta: { target: ["submissionKey"] } });
    });
    expect(await createContactTicket(wrong, [photo], null)).toEqual({ ok: true, ticketId: "winner", reference: "NP-WINNER", orderLinked: true });
    expect(mocks.remove).toHaveBeenCalledWith(saved);
  });
  it("compensates generated files when the transaction fails, without logging PII", async () => {
    mocks.save.mockResolvedValue(saved); mocks.create.mockRejectedValue(new Error("private customer data"));
    expect(await createContactTicket(input, [], null)).toEqual({ ok: false, error: "failed" });
    expect(mocks.remove).toHaveBeenCalledWith(saved); expect(console.error).toHaveBeenCalledWith("Contact request persistence failed");
  });
  it("rejects undecodable images without persisting a ticket", async () => {
    mocks.prepare.mockRejectedValue(new InvalidReviewPhoto());
    expect(await createContactTicket(input, [], null)).toEqual({ ok: false, error: "photos" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("limits attachments to wrong/damaged/return/adverse requests and checks size before decoding", async () => {
    const file = new File(["image"], "x.png", { type: "image/png" });
    expect(await createContactTicket(input, [file], null)).toEqual({ ok: false, error: "photos" });
    expect(await createContactTicket({ ...input, topic: "RETURN", reason: "UNSUITABLE" }, [file], null)).toMatchObject({ ok: true });
    expect(mocks.prepare).toHaveBeenCalledWith([file]);
    mocks.prepare.mockClear(); mocks.create.mockClear();
    const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "x.png", { type: "image/png" });
    expect(await createContactTicket({ ...input, topic: "WRONG", reason: "WRONG_ITEM" }, [oversized], null)).toEqual({ ok: false, error: "photos" });
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
});
