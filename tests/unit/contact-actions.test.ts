import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), lookup: vi.fn(), product: vi.fn(), verify: vi.fn(), create: vi.fn(), deliver: vi.fn(), address: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/client-address", () => ({ requestClientAddress: mocks.address }));
vi.mock("@/lib/db", () => ({ db: { order: { findFirst: mocks.lookup }, product: { findUnique: mocks.product } } }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.verify }));
vi.mock("@/lib/support/tickets", () => ({ createContactTicket: mocks.create }));
vi.mock("@/lib/support/delivery", () => ({ deliverTicketEmails: mocks.deliver }));
import { lookupContactOrderAction, submitContactAction } from "@/app/(storefront)/actions/contact";
import { submitWithdrawalAction } from "@/app/(storefront)/actions/returns";
import { submitAdverseEventAction } from "@/app/(storefront)/actions/adverse";
import { adverse } from "@/lib/copy/adverse";
import { contact } from "@/lib/copy/contact";
import { returns } from "@/lib/copy/returns";
import { shopToday } from "@/lib/support/validation";
let client = 0;
function form() {
  const f = new FormData();
  for (const [key, value] of Object.entries({ requestKey: "0ea827bf-3fd0-4b4d-af19-8f80d4661888", name: "Živa Ščuk", email: "ziva@example.test", topic: "ADVICE", reason: "HOW_TO_USE", message: "Prosim za pomoč pri uporabi izdelka.", privacyAccepted: "on", turnstileToken: "challenge" })) f.set(key, value);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(null); mocks.verify.mockResolvedValue(true);
  // A fresh rate-limit bucket per test: the lookup budget is per client address.
  mocks.address.mockResolvedValue(`198.51.100.${++client}`);
  mocks.create.mockResolvedValue({ ok: true, ticketId: "ticket", reference: "NP-123" });
  mocks.deliver.mockResolvedValue({ processed: 2, sent: 2, failed: 0, skipped: 0 });
});
afterEach(() => vi.restoreAllMocks());
describe("contact server boundaries", () => {
  it("rejects missing consent before invoking side effects", async () => {
    const f = form(); f.delete("privacyAccepted");
    expect(await submitContactAction(f)).toEqual({ ok: false, error: contact.errors.invalid });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("verifies a fresh challenge for lookup and final submission", async () => {
    mocks.verify.mockResolvedValue(false);
    expect(await lookupContactOrderAction({ email: "ziva@example.test", orderNumber: "NS-2026-00001", turnstileToken: "bad" })).toEqual({ ok: false, error: contact.errors.challenge });
    expect(await submitContactAction(form())).toEqual({ ok: false, error: contact.errors.challenge });
    expect(mocks.lookup).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("returns only the one matched order's minimal context", async () => {
    const createdAt = new Date("2026-09-09T00:00:00Z");
    mocks.lookup.mockResolvedValue({ number: "NS-2026-00001", status: "PAID", createdAt });
    expect(await lookupContactOrderAction({ email: " ZIVA@EXAMPLE.TEST ", orderNumber: "ns-2026-00001", turnstileToken: "challenge" })).toEqual({ ok: true, order: { number: "NS-2026-00001", status: "PAID", createdAt: createdAt.toISOString() } });
    expect(mocks.lookup).toHaveBeenCalledWith({ where: { number: "NS-2026-00001", email: { equals: "ziva@example.test", mode: "insensitive" } }, select: { number: true, status: true, createdAt: true } });
  });
  it("does not reveal database errors or distinguish missing private details", async () => {
    const request = { email: "ziva@example.test", orderNumber: "NS-2026-00001", turnstileToken: "challenge" };
    mocks.lookup.mockResolvedValue(null); expect(await lookupContactOrderAction(request)).toEqual({ ok: false, error: contact.errors.orderNotFound });
    mocks.lookup.mockRejectedValue(new Error("private row")); expect(await lookupContactOrderAction(request)).toEqual({ ok: false, error: contact.errors.failed });
  });
  it("limits order lookups per client like /sledi, answering like a miss (QA T4-F7)", async () => {
    const request = { email: "ziva@example.test", orderNumber: "NS-2026-00001", turnstileToken: "challenge" };
    mocks.lookup.mockResolvedValue({ number: "NS-2026-00001", status: "PAID", createdAt: new Date() });
    for (let attempt = 0; attempt < 20; attempt++) expect((await lookupContactOrderAction(request)).ok).toBe(true);
    expect(await lookupContactOrderAction(request)).toEqual({ ok: false, error: contact.errors.orderNotFound });
    expect(mocks.lookup).toHaveBeenCalledTimes(20);
    // Another client keeps its own budget.
    mocks.address.mockResolvedValue("203.0.113.77");
    expect((await lookupContactOrderAction(request)).ok).toBe(true);
  });
  it("passes actual session identity and sends only after durable creation", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner" } });
    expect(await submitContactAction(form())).toEqual({ ok: true, reference: "NP-123" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ privacyAccepted: true }), [], "owner");
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.deliver.mock.invocationCallOrder[0]);
  });
  it("keeps a persisted receipt successful even if delivery throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deliver.mockRejectedValue(new Error("SMTP customer email"));
    expect(await submitContactAction(form())).toEqual({ ok: true, reference: "NP-123" });
    expect(log).toHaveBeenCalledWith("Ticket emails remain queued");
  });
  it("does not send email for a rejected payload or forged photo field", async () => {
    mocks.create.mockResolvedValue({ ok: false, error: "conflict" });
    expect(await submitContactAction(form())).toEqual({ ok: false, error: contact.errors.conflict });
    const f = form(); f.set("photos", "../../private");
    expect(await submitContactAction(f)).toEqual({ ok: false, error: contact.errors.photos });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});

function formOf(fields: Record<string, string>) {
  const f = new FormData();
  for (const [key, value] of Object.entries(fields)) f.set(key, value);
  return f;
}
const withdrawalFields = {
  requestKey: "0ea827bf-3fd0-4b4d-af19-8f80d4661888", name: "Živa Ščuk", email: "ziva@example.test", address: "Testna ulica 1, 1000 Ljubljana",
  orderNumber: "NS-2026-00042", deliveryStatus: "not_received", items: "1 × Belilni trakci", privacyAccepted: "on", turnstileToken: "challenge",
};
const adverseFields = {
  requestKey: "0ea827bf-3fd0-4b4d-af19-8f80d4661888", name: "Živa Ščuk", email: "ziva@example.test", reporterType: "USER",
  productSlug: "serum-korektor-barve-zob", purchasePlace: "nasmeh.si", description: "Po prvi uporabi je bilo dlesni rdeče in pekoče.",
  ongoing: "no", medicalTreatment: "no", privacyAccepted: "on", turnstileToken: "challenge",
};

describe("withdrawal and adverse-event server boundaries", () => {
  it("accepts a withdrawal before delivery without a date and reports an unlinked notice", async () => {
    mocks.create.mockResolvedValue({ ok: true, ticketId: "ticket", reference: "NP-W", orderLinked: false });
    expect(await submitWithdrawalAction(formOf(withdrawalFields))).toEqual({ ok: true, reference: "NP-W", orderLinked: false });
    const [input] = mocks.create.mock.calls[0];
    expect(input).toMatchObject({ topic: "RETURN", reason: "WITHDRAWAL", orderNumber: "NS-2026-00042", details: { kind: "withdrawal", goodsReceived: false, receivedAt: "" } });
    expect(input.message).toContain("Blago še ni prejeto");
  });
  it("requires the receipt date only for received goods", async () => {
    expect(await submitWithdrawalAction(formOf({ ...withdrawalFields, deliveryStatus: "received" }))).toEqual({ ok: false, error: returns.withdrawal.errors.fields.receivedAt });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.create.mockResolvedValue({ ok: true, ticketId: "ticket", reference: "NP-W", orderLinked: true });
    expect(await submitWithdrawalAction(formOf({ ...withdrawalFields, deliveryStatus: "received", receivedAt: "2026-09-01" }))).toEqual({ ok: true, reference: "NP-W", orderLinked: true });
    expect(mocks.create.mock.calls[0][0].details).toMatchObject({ goodsReceived: true, receivedAt: "2026-09-01" });
  });
  it("accepts an adverse report whose batch number is stated as unknown, and refuses one with neither", async () => {
    mocks.product.mockResolvedValue({ slug: "serum-korektor-barve-zob", title: "Serum korektor barve zob" });
    expect(await submitAdverseEventAction(formOf(adverseFields))).toEqual({ ok: false, error: adverse.errors.fields.batchNumber });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await submitAdverseEventAction(formOf({ ...adverseFields, batchUnknown: "on" }))).toEqual({ ok: true, reference: "NP-123" });
    expect(mocks.create.mock.calls[0][0].details).toMatchObject({ kind: "adverse", batchNumber: "", batchUnknown: true });
  });
});

describe("field-level refusals and dates (QA T4-F4, T4-F6)", () => {
  const tomorrow = () => { const date = new Date(`${shopToday()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); };
  it("refuses an adverse purchase or onset date in the future and names the field", async () => {
    mocks.product.mockResolvedValue({ slug: "serum-korektor-barve-zob", title: "Serum korektor barve zob" });
    const valid = { ...adverseFields, batchUnknown: "on" };
    expect(await submitAdverseEventAction(formOf({ ...valid, purchaseDate: tomorrow() }))).toEqual({ ok: false, error: adverse.errors.fields.purchaseDate });
    expect(await submitAdverseEventAction(formOf({ ...valid, onsetDate: tomorrow() }))).toEqual({ ok: false, error: adverse.errors.fields.onsetDate });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await submitAdverseEventAction(formOf({ ...valid, purchaseDate: shopToday(), onsetDate: shopToday() }))).toEqual({ ok: true, reference: "NP-123" });
  });
  it("names the first invalid field of the adverse and withdrawal forms", async () => {
    expect(await submitAdverseEventAction(formOf({ ...adverseFields, batchUnknown: "on", description: "kratko" }))).toEqual({ ok: false, error: adverse.errors.fields.description });
    expect(await submitAdverseEventAction(formOf({ ...adverseFields, batchUnknown: "on", email: "ni-e-posta" }))).toEqual({ ok: false, error: adverse.errors.fields.email });
    expect(await submitWithdrawalAction(formOf({ ...withdrawalFields, items: "x" }))).toEqual({ ok: false, error: returns.withdrawal.errors.fields.items });
    const withoutConsent: Record<string, string> = { ...withdrawalFields };
    delete withoutConsent.privacyAccepted;
    expect(await submitWithdrawalAction(formOf(withoutConsent))).toEqual({ ok: false, error: returns.withdrawal.errors.fields.privacyAccepted });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
