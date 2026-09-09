import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), lookup: vi.fn(), verify: vi.fn(), create: vi.fn(), deliver: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { order: { findFirst: mocks.lookup } } }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.verify }));
vi.mock("@/lib/support/tickets", () => ({ createContactTicket: mocks.create }));
vi.mock("@/lib/support/delivery", () => ({ deliverTicketEmails: mocks.deliver }));
import { lookupContactOrderAction, submitContactAction } from "@/app/(storefront)/actions/contact";
import { contact } from "@/lib/copy/contact";
function form() {
  const f = new FormData();
  for (const [key, value] of Object.entries({ requestKey: "0ea827bf-3fd0-4b4d-af19-8f80d4661888", name: "Živa Ščuk", email: "ziva@example.test", topic: "ADVICE", reason: "HOW_TO_USE", message: "Prosim za pomoč pri uporabi izdelka.", privacyAccepted: "on", turnstileToken: "challenge" })) f.set(key, value);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(null); mocks.verify.mockResolvedValue(true);
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
