import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidate: vi.fn(), findUnique: vi.fn(), update: vi.fn(), noteCreate: vi.fn(),
  refundOrder: vi.fn(), cancelOrder: vi.fn(), processing: vi.fn(), ship: vi.fn(), deliver: vi.fn(),
  deliverConfirmation: vi.fn(), deliverShipped: vi.fn(), executeRaw: vi.fn(), settle: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => ({ db: { order: { findUnique: mocks.findUnique, update: mocks.update }, orderNote: { create: mocks.noteCreate }, $executeRaw: mocks.executeRaw } }));
vi.mock("@/lib/orders/refunds", () => ({ refundOrder: mocks.refundOrder, cancelOrder: mocks.cancelOrder, refundCapturedPayment: mocks.settle }));
vi.mock("@/lib/orders/transitions", () => ({ markOrderProcessing: mocks.processing, markOrderShipped: mocks.ship, markOrderDelivered: mocks.deliver }));
vi.mock("@/lib/orders/confirmation-delivery", () => ({ deliverOrderConfirmation: mocks.deliverConfirmation }));
vi.mock("@/lib/orders/shipped-delivery", () => ({ deliverOrderShipped: mocks.deliverShipped }));

import {
  addOrderNoteAction, cancelOrderAction, markDeliveredAction, markProcessingAction, refundOrderAction,
  resendConfirmationAction, resendShippedAction, settleCapturedPaymentAction, shipOrderAction,
} from "@/app/admin/(shell)/narocila/[number]/actions";

/** The timeline entry one `$executeRaw` call appended: the JSON parameter of the tagged template. */
const appended = (call: unknown[]) => JSON.parse(call.find((value) => typeof value === "string" && value.startsWith("[{")) as string)[0];

const session = (role: string, mfaEnrolled = true) => ({ user: { id: `cmf0${role.toLowerCase()}00000000000000001`, email: `${role.toLowerCase()}@nasmeh.si`, name: role, role, mfaEnrolled } });
const orderId = "cmf0order000000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(session("OWNER"));
  mocks.findUnique.mockResolvedValue({ id: orderId, number: "NS-2026-00042", status: "PAID", paidAt: new Date(), stockDeducted: true, refundRequired: false, trackingNumber: null });
  mocks.update.mockResolvedValue({});
  mocks.noteCreate.mockResolvedValue({});
  mocks.refundOrder.mockResolvedValue({ ok: true, refundId: "r", amountCents: 100, full: false, status: "PAID" });
  mocks.cancelOrder.mockResolvedValue({ ok: true, refunded: true });
  mocks.processing.mockResolvedValue({ ok: true, orderNumber: "NS-2026-00042", status: "PROCESSING" });
  mocks.ship.mockResolvedValue({ ok: true, orderNumber: "NS-2026-00042", status: "SHIPPED" });
  mocks.deliver.mockResolvedValue({ ok: true, orderNumber: "NS-2026-00042", status: "DELIVERED" });
  mocks.deliverConfirmation.mockResolvedValue(true);
  mocks.deliverShipped.mockResolvedValue(false);
  mocks.executeRaw.mockResolvedValue(1);
  mocks.settle.mockResolvedValue({ ok: true, refundId: "r", amountCents: 3989, full: true, status: "CANCELLED" });
});

describe("order action permissions (direct calls)", () => {
  it("FULFILLMENT ships and processes but never refunds or cancels", async () => {
    mocks.auth.mockResolvedValue(session("FULFILLMENT"));
    expect(await markProcessingAction({ orderId })).toEqual({ ok: true, message: "processing" });
    expect(mocks.processing).toHaveBeenCalledWith(orderId, { actor: "fulfillment@nasmeh.si" });
    expect(await shipOrderAction({ orderId, carrier: "GLS", trackingNumber: "GLS123456" })).toEqual({ ok: true, message: "shipped" });
    await expect(refundOrderAction({ orderId, lines: [], refundShipping: true, adjustmentCents: 0, reason: "x", restock: true })).rejects.toThrow("forbidden");
    await expect(cancelOrderAction({ orderId, reason: "x" })).rejects.toThrow("forbidden");
    await expect(settleCapturedPaymentAction({ orderId, reason: "x" })).rejects.toThrow("forbidden");
    expect(mocks.refundOrder).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.cancelOrder).not.toHaveBeenCalled();
  });

  it("SUPPORT refunds, cancels and notes but never ships or processes", async () => {
    mocks.auth.mockResolvedValue(session("SUPPORT"));
    expect(await refundOrderAction({ orderId, lines: [{ orderItemId: "cmf0item0000000000000001", quantity: 1 }], refundShipping: false, adjustmentCents: 0, reason: "poškodovano", restock: true }))
      .toEqual({ ok: true, message: "refunded" });
    expect(mocks.refundOrder.mock.calls[0][1]).toMatchObject({ actorId: session("SUPPORT").user.id, actorName: "support@nasmeh.si", restock: true, reason: "poškodovano" });
    expect(await cancelOrderAction({ orderId, reason: "stranka" })).toEqual({ ok: true, message: "cancelled" });
    expect(await addOrderNoteAction({ orderId, body: "Klic stranke", visibleToCustomer: false })).toEqual({ ok: true, message: "noteSaved" });
    expect(mocks.noteCreate.mock.calls[0][0].data).toMatchObject({ orderId, authorName: "SUPPORT", body: "Klic stranke", visibleToCustomer: false });
    // QA N3: the note leaves a trace in the activity log, naming the author and never the text.
    expect(appended(mocks.executeRaw.mock.calls[0])).toMatchObject({ event: "note_added", detail: "support@nasmeh.si" });
    expect(JSON.stringify(mocks.executeRaw.mock.calls[0])).not.toContain("Klic stranke");
    expect(await settleCapturedPaymentAction({ orderId, reason: "zaloga pošla" })).toEqual({ ok: true, message: "settled" });
    expect(mocks.settle).toHaveBeenCalledWith(orderId, { actorId: session("SUPPORT").user.id, actorName: "support@nasmeh.si", reason: "zaloga pošla" });
    await expect(shipOrderAction({ orderId, carrier: "GLS", trackingNumber: "GLS123456" })).rejects.toThrow("forbidden");
    await expect(markProcessingAction({ orderId })).rejects.toThrow("forbidden");
    await expect(markDeliveredAction({ orderId })).rejects.toThrow("forbidden");
    expect(mocks.ship).not.toHaveBeenCalled();
  });

  it("MANAGER reads orders only", async () => {
    mocks.auth.mockResolvedValue(session("MANAGER"));
    await expect(addOrderNoteAction({ orderId, body: "x", visibleToCustomer: true })).rejects.toThrow("forbidden");
    await expect(resendConfirmationAction({ orderId })).rejects.toThrow("forbidden");
    await expect(markDeliveredAction({ orderId })).rejects.toThrow("forbidden");
    await expect(refundOrderAction({ orderId, lines: [], refundShipping: true, adjustmentCents: 0, reason: "x", restock: false })).rejects.toThrow("forbidden");
    await expect(settleCapturedPaymentAction({ orderId, reason: "x" })).rejects.toThrow("forbidden");
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("refuses unenrolled staff, customers and anonymous callers", async () => {
    mocks.auth.mockResolvedValue(session("OWNER", false));
    await expect(markProcessingAction({ orderId })).rejects.toThrow("mfa_required");
    for (const value of [null, session("CUSTOMER")]) {
      mocks.auth.mockResolvedValue(value);
      await expect(markProcessingAction({ orderId })).rejects.toThrow("forbidden");
    }
    expect(mocks.processing).not.toHaveBeenCalled();
  });
});

describe("order action validation and resend", () => {
  it("validates input before touching a transition", async () => {
    expect(await shipOrderAction({ orderId, carrier: "", trackingNumber: "GLS123456" })).toEqual({ ok: false, message: "invalid" });
    expect(await refundOrderAction({ orderId, lines: [], refundShipping: false, adjustmentCents: 1.5, reason: "x", restock: false })).toEqual({ ok: false, message: "invalid" });
    expect(await addOrderNoteAction({ orderId, body: "   ", visibleToCustomer: false })).toEqual({ ok: false, message: "invalid" });
    expect(mocks.ship).not.toHaveBeenCalled();
    expect(mocks.refundOrder).not.toHaveBeenCalled();
  });

  it("maps transition refusals to messages", async () => {
    mocks.ship.mockResolvedValue({ ok: false, reason: "unknown_carrier" });
    expect(await shipOrderAction({ orderId, carrier: "DHL", trackingNumber: "DHL123456" })).toEqual({ ok: false, message: "unknown_carrier" });
    mocks.refundOrder.mockResolvedValue({ ok: false, reason: "amount" });
    expect(await refundOrderAction({ orderId, lines: [], refundShipping: true, adjustmentCents: 0, reason: "x", restock: false })).toEqual({ ok: false, message: "amount" });
    mocks.settle.mockResolvedValue({ ok: false, reason: "not_refundable" });
    expect(await settleCapturedPaymentAction({ orderId, reason: "x" })).toEqual({ ok: false, message: "not_refundable" });
    expect(await settleCapturedPaymentAction({ orderId, reason: "  " })).toEqual({ ok: false, message: "invalid" });
    expect(mocks.settle).toHaveBeenCalledTimes(1);
  });

  it("re-queues the durable confirmation only for paid, fulfillable orders", async () => {
    expect(await resendConfirmationAction({ orderId })).toEqual({ ok: true, message: "resent" });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ confirmationEmailPending: true, confirmationEmailSentAt: null });
    expect(mocks.deliverConfirmation).toHaveBeenCalledWith(orderId);
    expect(appended(mocks.executeRaw.mock.calls[0])).toMatchObject({ event: "confirmation_resent", detail: "owner@nasmeh.si" });
    mocks.findUnique.mockResolvedValue({ id: orderId, status: "PENDING", paidAt: null, stockDeducted: false, refundRequired: false });
    expect(await resendConfirmationAction({ orderId })).toEqual({ ok: false, message: "invalid_transition" });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
  });

  it("re-queues the shipped mail only when a tracking number exists, reporting a deferred send", async () => {
    expect(await resendShippedAction({ orderId })).toEqual({ ok: false, message: "invalid_transition" });
    mocks.findUnique.mockResolvedValue({ id: orderId, status: "SHIPPED", trackingNumber: "GLS123456" });
    expect(await resendShippedAction({ orderId })).toEqual({ ok: true, message: "resendQueued" });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ shippedEmailPending: true, shippedEmailSentAt: null });
    // Not delivered yet: the log says it is queued, not that it was sent.
    expect(appended(mocks.executeRaw.mock.calls[0])).toMatchObject({ event: "shipped_requeued", detail: "owner@nasmeh.si" });
  });

  it("refuses to re-queue either mail for an anonymised order", async () => {
    const anonymizedAt = new Date("2026-09-14T10:00:00Z");
    mocks.findUnique.mockResolvedValue({ id: orderId, status: "SHIPPED", paidAt: new Date(), stockDeducted: true, refundRequired: false, trackingNumber: "GLS123456", anonymizedAt });
    expect(await resendConfirmationAction({ orderId })).toEqual({ ok: false, message: "invalid_transition" });
    expect(await resendShippedAction({ orderId })).toEqual({ ok: false, message: "invalid_transition" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.deliverConfirmation).not.toHaveBeenCalled();
    expect(mocks.deliverShipped).not.toHaveBeenCalled();
  });
});

/**
 * QA 2026-10-03 T4-04: only an account holder ever reads a customer-visible note (on the
 * account's order page); a guest order and an erased buyer's order have no reader, so the
 * action refuses the flag instead of promising what never happens.
 */
describe("customer-visible order notes", () => {
  it("are saved for an order placed from an account", async () => {
    mocks.findUnique.mockResolvedValue({ id: orderId, userId: "cmf0user0000000000000001", anonymizedAt: null });
    expect(await addOrderNoteAction({ orderId, body: "Paket je pri sosedu.", visibleToCustomer: true })).toEqual({ ok: true, message: "noteSaved" });
    expect(mocks.findUnique.mock.calls[0][0]).toEqual({ where: { id: orderId }, select: { id: true, userId: true, anonymizedAt: true } });
    expect(mocks.noteCreate.mock.calls[0][0].data).toMatchObject({ orderId, visibleToCustomer: true });
  });

  it("are refused for a guest order and an anonymised order, while internal notes still save", async () => {
    for (const order of [
      { id: orderId, userId: null, anonymizedAt: null },
      { id: orderId, userId: "cmf0user0000000000000001", anonymizedAt: new Date("2026-10-03T11:30:00Z") },
      { id: orderId, userId: null, anonymizedAt: new Date("2026-10-03T11:30:00Z") },
    ]) {
      mocks.findUnique.mockResolvedValue(order);
      expect(await addOrderNoteAction({ orderId, body: "Vidna opomba", visibleToCustomer: true })).toEqual({ ok: false, message: "note_not_visible" });
    }
    expect(mocks.noteCreate).not.toHaveBeenCalled();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(await addOrderNoteAction({ orderId, body: "Interna opomba", visibleToCustomer: false })).toEqual({ ok: true, message: "noteSaved" });
    expect(mocks.noteCreate.mock.calls[0][0].data).toMatchObject({ visibleToCustomer: false });
  });

  it("names the refusal in words", async () => {
    const { admin } = await import("@/lib/copy/admin");
    expect(admin.orders.actions.results.note_not_visible.length).toBeGreaterThan(0);
  });
});
