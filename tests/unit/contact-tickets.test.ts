import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ ticket: vi.fn(), create: vi.fn(), order: vi.fn(), transaction: vi.fn(), settings: vi.fn(), prepare: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { ticket: { findUnique: mocks.ticket }, order: { findUnique: mocks.order }, $transaction: mocks.transaction } }));
vi.mock("@/lib/support/settings", () => ({ getContactSettings: mocks.settings }));
vi.mock("@/lib/support/photos", () => ({ prepareSupportPhotos: mocks.prepare, saveSupportPhotos: mocks.save, removeSupportPhotos: mocks.remove }));
import { createContactTicket } from "@/lib/support/tickets";
import { contactInputSchema } from "@/lib/support/validation";
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
    expect(result).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT" });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.deliveries.create).toEqual([{ kind: "STAFF", recipient: topic === "ADVERSE" ? "compliance@example.test" : "support@example.test" }, { kind: "CUSTOMER", recipient: input.email }]);
    expect(data.privacyAcceptedAt).toBeInstanceOf(Date); expect(data.privacyVersion).toBe("contact-v1");
    expect(data.attachments.create).toEqual([]); expect(data.orderId).toBeNull();
  });
  it("persists structured details and allows photos for adverse reports", async () => {
    const photo = new File(["png bytes"], "photo.png", { type: "image/png" });
    mocks.save.mockResolvedValue(saved);
    const details = { kind: "adverse" as const, batchNumber: "LOT 1" };
    const result = await createContactTicket({ ...input, topic: "ADVERSE", reason: "REACTION", details }, [photo], null);
    expect(result).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT" });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ topic: "ADVERSE", details, attachments: { create: saved } });
    expect(data.deliveries.create[0].recipient).toBe("compliance@example.test");
    expect(typeof data.payloadHash).toBe("string");
  });
  it("requires proof again when the submitted order is not owned by the current user", async () => {
    mocks.order.mockResolvedValue({ id: "o", number: "NS-2026-00001", userId: "owner", email: "buyer@example.test" });
    expect(await createContactTicket({ ...input, orderNumber: "NS-2026-00001" }, [], "other")).toEqual({ ok: false, error: "orderNotFound" });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each(["ACCOUNT", "EMAIL_NUMBER"])("attaches a verified %s context without changing order state", async proof => {
    mocks.order.mockResolvedValue({ id: "o", number: "NS-2026-00001", userId: "owner", email: "Buyer@Example.Test" });
    await createContactTicket({ ...input, orderNumber: "NS-2026-00001", orderEmail: proof === "EMAIL_NUMBER" ? "buyer@example.test" : "" }, [], proof === "ACCOUNT" ? "owner" : null);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ orderId: "o", orderNumber: "NS-2026-00001", orderProof: proof });
  });
  it("returns only the same receipt for an exact replay, without file writes or another ticket", async () => {
    await createContactTicket(input, [], "owner");
    const hash = mocks.create.mock.calls[0][0].data.payloadHash;
    mocks.ticket.mockResolvedValue({ id: "ticket-id", reference: "NP-RECEIPT", payloadHash: hash });
    expect(await createContactTicket(input, [], "owner")).toEqual({ ok: true, ticketId: "ticket-id", reference: "NP-RECEIPT" });
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.save).toHaveBeenCalledOnce();
    expect(await createContactTicket({ ...input, message: "Different valid message" }, [], "owner")).toEqual({ ok: false, error: "conflict" });
    expect(await createContactTicket(input, [], "other")).toEqual({ ok: false, error: "conflict" });
  });
  it("handles a concurrent unique-key loser and removes only its unused generated files", async () => {
    const photo = new File(["png bytes"], "photo.png", { type: "image/png" });
    const wrong = { ...input, topic: "WRONG" as const, reason: "WRONG_ITEM" };
    mocks.save.mockResolvedValue(saved);
    mocks.create.mockImplementation(async ({ data }) => {
      mocks.ticket.mockResolvedValue({ id: "winner", reference: "NP-WINNER", payloadHash: data.payloadHash });
      throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6", meta: { target: ["submissionKey"] } });
    });
    expect(await createContactTicket(wrong, [photo], null)).toEqual({ ok: true, ticketId: "winner", reference: "NP-WINNER" });
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
  it("limits attachments to wrong/damaged requests and checks size before decoding", async () => {
    const file = new File(["image"], "x.png", { type: "image/png" });
    expect(await createContactTicket(input, [file], null)).toEqual({ ok: false, error: "photos" });
    const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "x.png", { type: "image/png" });
    expect(await createContactTicket({ ...input, topic: "WRONG", reason: "WRONG_ITEM" }, [oversized], null)).toEqual({ ok: false, error: "photos" });
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
});
