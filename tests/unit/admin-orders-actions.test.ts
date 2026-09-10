import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidate: vi.fn(), findUnique: vi.fn(), update: vi.fn(), noteCreate: vi.fn(),
  refundOrder: vi.fn(), cancelOrder: vi.fn(), processing: vi.fn(), ship: vi.fn(), deliver: vi.fn(),
  deliverConfirmation: vi.fn(), deliverShipped: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => ({ db: { order: { findUnique: mocks.findUnique, update: mocks.update }, orderNote: { create: mocks.noteCreate } } }));
vi.mock("@/lib/orders/refunds", () => ({ refundOrder: mocks.refundOrder, cancelOrder: mocks.cancelOrder }));
vi.mock("@/lib/orders/transitions", () => ({ markOrderProcessing: mocks.processing, markOrderShipped: mocks.ship, markOrderDelivered: mocks.deliver }));
vi.mock("@/lib/orders/confirmation-delivery", () => ({ deliverOrderConfirmation: mocks.deliverConfirmation }));
vi.mock("@/lib/orders/shipped-delivery", () => ({ deliverOrderShipped: mocks.deliverShipped }));

import {
  addOrderNoteAction, cancelOrderAction, markDeliveredAction, markProcessingAction, refundOrderAction,
  resendConfirmationAction, resendShippedAction, shipOrderAction,
} from "@/app/admin/(shell)/narocila/[number]/actions";

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
});

describe("order action permissions (direct calls)", () => {
  it("FULFILLMENT ships and processes but never refunds or cancels", async () => {
    mocks.auth.mockResolvedValue(session("FULFILLMENT"));
    expect(await markProcessingAction({ orderId })).toEqual({ ok: true, message: "processing" });
    expect(mocks.processing).toHaveBeenCalledWith(orderId, { actor: "fulfillment@nasmeh.si" });
    expect(await shipOrderAction({ orderId, carrier: "GLS", trackingNumber: "GLS123456" })).toEqual({ ok: true, message: "shipped" });
    await expect(refundOrderAction({ orderId, lines: [], refundShipping: true, adjustmentCents: 0, reason: "x", restock: true })).rejects.toThrow("forbidden");
    await expect(cancelOrderAction({ orderId, reason: "x" })).rejects.toThrow("forbidden");
    expect(mocks.refundOrder).not.toHaveBeenCalled();
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
  });

  it("re-queues the durable confirmation only for paid, fulfillable orders", async () => {
    expect(await resendConfirmationAction({ orderId })).toEqual({ ok: true, message: "resent" });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ confirmationEmailPending: true, confirmationEmailSentAt: null });
    expect(mocks.deliverConfirmation).toHaveBeenCalledWith(orderId);
    mocks.findUnique.mockResolvedValue({ id: orderId, status: "PENDING", paidAt: null, stockDeducted: false, refundRequired: false });
    expect(await resendConfirmationAction({ orderId })).toEqual({ ok: false, message: "invalid_transition" });
  });

  it("re-queues the shipped mail only when a tracking number exists, reporting a deferred send", async () => {
    expect(await resendShippedAction({ orderId })).toEqual({ ok: false, message: "invalid_transition" });
    mocks.findUnique.mockResolvedValue({ id: orderId, status: "SHIPPED", trackingNumber: "GLS123456" });
    expect(await resendShippedAction({ orderId })).toEqual({ ok: true, message: "resendQueued" });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ shippedEmailPending: true, shippedEmailSentAt: null });
  });
});
