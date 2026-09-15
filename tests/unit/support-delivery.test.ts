import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { ticketEmailDelivery: { findMany: mocks.findMany, findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/email/mailer", () => ({ sendMail: mocks.send }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));
import { deliverTicketEmails, retryPendingTicketEmails } from "@/lib/support/delivery";
import { renderSupportStaffEmail, renderSupportCustomerEmail } from "@/lib/email/templates/support-ticket";

const now = new Date("2026-09-20T12:00:00Z");
const ticket = {
  id: "ticket-1", reference: "POD-2026-00001", topic: "DAMAGED" as const, reason: null,
  name: "Reporter <script>alert(1)</script>", email: "reporter@example.test",
  orderNumber: "NS-2026-00001", orderProof: "EMAIL_NUMBER",
  message: "Private medical note <img src=x onerror=alert(1)>\nSecond line & more",
  attachments: [{ id: "photo-1" }],
};
interface DeliveryRow {
  id: string; ticketId: string; kind: "STAFF" | "CUSTOMER"; recipient: string;
  sentAt: Date | null; attempts: number; leaseToken: string | null; leaseUntil: Date | null;
  lastError: string | null; createdAt: Date; ticket: typeof ticket;
}
const rows = new Map<string, DeliveryRow>();
const row = (kind: DeliveryRow["kind"]): DeliveryRow => ({
  id: `delivery-${kind.toLowerCase()}`, ticketId: ticket.id, kind,
  recipient: kind === "STAFF" ? "support@example.test" : ticket.email,
  sentAt: null, attempts: 0, leaseToken: null, leaseUntil: null, lastError: null,
  createdAt: new Date(now.getTime() + (kind === "STAFF" ? 0 : 1)), ticket,
});

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  rows.clear(); for (const kind of ["STAFF", "CUSTOMER"] as const) { const value = row(kind); rows.set(value.id, value); }
  mocks.send.mockResolvedValue({ messageId: "sent" });
  mocks.findMany.mockImplementation(async query => [...rows.values()].filter(value =>
    value.sentAt === null && (!query.where.ticketId || query.where.ticketId === value.ticketId) &&
    (!query.where.OR || !value.leaseUntil || value.leaseUntil <= new Date()),
  ).sort((a, b) => (query.orderBy[0].attempts ? a.attempts - b.attempts : 0) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, query.take).map(value => ({ id: value.id })));
  mocks.findUnique.mockImplementation(async query => { const value = rows.get(query.where.id); return value ? { ...value } : null; });
  mocks.updateMany.mockImplementation(async query => {
    const value = rows.get(query.where.id);
    if (!value || value.sentAt !== null || (query.where.leaseToken && query.where.leaseToken !== value.leaseToken) ||
      (query.where.OR && value.leaseUntil && value.leaseUntil > new Date())) return { count: 0 };
    for (const [field, change] of Object.entries(query.data)) {
      if (field === "attempts") value.attempts += (change as { increment: number }).increment;
      else Object.assign(value, { [field]: change });
    }
    return { count: 1 };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("independent support ticket email deliveries", () => {
  it("claims both persisted recipients before sending, with stable identifiers and staff-only replyTo", async () => {
    expect(await deliverTicketEmails(ticket.id)).toEqual({ processed: 2, sent: 2, failed: 0, skipped: 0 });
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: "support@example.test", replyTo: ticket.email, messageId: "<support-ticket.delivery-staff@nasmeh.si>" });
    expect(mocks.send.mock.calls[1][0]).toMatchObject({ to: ticket.email, messageId: "<support-ticket.delivery-customer@nasmeh.si>" });
    expect(mocks.send.mock.calls[1][0]).not.toHaveProperty("replyTo");
    expect([...rows.values()].every(value => value.sentAt && !value.leaseToken && !value.leaseUntil)).toBe(true);
    expect(await deliverTicketEmails(ticket.id)).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it.each(["STAFF", "CUSTOMER"] as const)("retries a failed %s leg without resending the successful leg", async kind => {
    const recipient = rows.get(`delivery-${kind.toLowerCase()}`)!.recipient;
    mocks.send.mockImplementation(async input => { if (input.to === recipient) throw new Error("SMTP refused reporter@example.test"); return {}; });
    expect(await deliverTicketEmails(ticket.id)).toEqual({ processed: 2, sent: 1, failed: 1, skipped: 0 });
    const failed = rows.get(`delivery-${kind.toLowerCase()}`)!;
    expect(failed).toMatchObject({ sentAt: null, leaseToken: null, leaseUntil: null, lastError: "DeliveryError" });
    expect(console.error).toHaveBeenCalledWith("Support ticket email remains queued");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(ticket.email);
    mocks.send.mockResolvedValue({});
    expect(await retryPendingTicketEmails()).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(3); expect(mocks.send.mock.calls[2][0].to).toBe(recipient);
    expect(mocks.send.mock.calls[2][0].messageId).toBe(`<support-ticket.${failed.id}@nasmeh.si>`);
  });

  it("allows only one simultaneous worker to send each recipient", async () => {
    const outcomes = await Promise.all([deliverTicketEmails(ticket.id), deliverTicketEmails(ticket.id)]);
    expect(outcomes.reduce((sum, value) => sum + value.sent, 0)).toBe(2);
    expect(outcomes.reduce((sum, value) => sum + value.failed, 0)).toBe(0);
    expect(mocks.send.mock.calls.map(call => call[0].to).sort()).toEqual([ticket.email, "support@example.test"].sort());
    expect([...rows.values()].map(value => value.attempts)).toEqual([1, 1]);
  });

  it("reclaims an expired lease while leaving active leases untouched", async () => {
    const expired = rows.get("delivery-staff")!, active = rows.get("delivery-customer")!;
    expired.leaseToken = "old"; expired.leaseUntil = new Date(now.getTime() - 1);
    active.leaseToken = "active"; active.leaseUntil = new Date(now.getTime() + 60_000);
    expect(await retryPendingTicketEmails()).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(active.leaseToken).toBe("active"); expect(active.attempts).toBe(0);
    const claim = mocks.updateMany.mock.calls[0][0];
    expect(claim.data.leaseToken).not.toBe("old");
    expect(claim.data.leaseUntil.getTime()).toBe(now.getTime() + 5 * 60_000);
  });

  it("starts each recipient lease at the current time after a slow previous send", async () => {
    mocks.send.mockImplementationOnce(async () => { vi.setSystemTime(now.getTime() + 6 * 60_000); });
    await deliverTicketEmails(ticket.id);
    expect(mocks.updateMany.mock.calls[2][0].data.leaseUntil.getTime()).toBe(now.getTime() + 11 * 60_000);
  });

  it("does not acknowledge or release another worker's replacement lease", async () => {
    rows.delete("delivery-customer");
    mocks.send.mockImplementation(async () => { rows.get("delivery-staff")!.leaseToken = "new-worker"; return {}; });
    expect(await deliverTicketEmails(ticket.id)).toEqual({ processed: 1, sent: 0, failed: 1, skipped: 0 });
    expect(rows.get("delivery-staff")).toMatchObject({ sentAt: null, leaseToken: "new-worker" });
    const release = mocks.updateMany.mock.calls.at(-1)![0];
    expect(release.where.leaseToken).not.toBe("new-worker");
  });

  it("retains a retryable leg when SMTP accepts but the acknowledgement cannot commit", async () => {
    const update = mocks.updateMany.getMockImplementation()!;
    mocks.updateMany.mockImplementationOnce(update).mockRejectedValueOnce(new Error("DB unavailable"));
    expect(await deliverTicketEmails(ticket.id)).toEqual({ processed: 2, sent: 1, failed: 1, skipped: 0 });
    expect(rows.get("delivery-staff")).toMatchObject({ sentAt: null, leaseUntil: null, lastError: "DeliveryError" });
    expect(await retryPendingTicketEmails()).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(mocks.send.mock.calls.map(call => call[0].messageId)).toEqual([
      "<support-ticket.delivery-staff@nasmeh.si>", "<support-ticket.delivery-customer@nasmeh.si>",
      "<support-ticket.delivery-staff@nasmeh.si>",
    ]);
  });

  it("sends a RETURN/WITHDRAWAL ticket stored without details as a withdrawal to staff and the reporter (S8/U19)", async () => {
    for (const value of rows.values()) value.ticket = { ...ticket, topic: "RETURN", reason: "WITHDRAWAL" } as unknown as typeof ticket;
    expect(await deliverTicketEmails(ticket.id)).toEqual({ processed: 2, sent: 2, failed: 0, skipped: 0 });
    const [staff, customer] = mocks.send.mock.calls.map(call => call[0] as { subject: string; text: string; html: string });
    expect(staff.subject.startsWith("[ODSTOP] ")).toBe(true);
    expect(staff.text).not.toContain("ne prekliče naročila");
    expect(customer.html).toContain("Prejeli smo vaše obvestilo o odstopu od pogodbe");
  });

  it("sends the staff alert without Reply-To when the reporter address no longer parses", async () => {
    rows.delete("delivery-customer");
    rows.get("delivery-staff")!.ticket = { ...ticket, email: "[anonimizirano]" };
    expect(await deliverTicketEmails(ticket.id)).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: "support@example.test" });
    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });

  it("uses only valid persisted recipients and never falls back to reporter input", async () => {
    rows.delete("delivery-customer"); rows.get("delivery-staff")!.recipient = "bad\r\nBcc: victim@example.test";
    expect(await deliverTicketEmails(ticket.id)).toMatchObject({ sent: 0, failed: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("prioritizes low-attempt retries, bounds the batch and keeps unsent/lease filtering", async () => {
    rows.get("delivery-staff")!.attempts = 9;
    expect(await retryPendingTicketEmails(1)).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(mocks.send.mock.calls[0][0].to).toBe(ticket.email);
    expect(mocks.findMany.mock.calls[0][0]).toEqual({
      where: { sentAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
      select: { id: true }, orderBy: [{ attempts: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 1,
    });
    await retryPendingTicketEmails(500);
    expect(mocks.findMany.mock.calls[1][0].take).toBe(50);
  });
});

describe("support email privacy and escaping", () => {
  it("escapes free text and links staff only to the authorized attachment route", () => {
    const output = renderSupportStaffEmail(ticket);
    expect(output.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(output.html).toContain("&lt;img src=x onerror=alert(1)&gt;<br>Second line &amp; more");
    expect(output.html).not.toContain("<script>"); expect(output.html).not.toContain("<img src=x");
    expect(output.html).toContain("https://nasmeh.example/api/support/attachments/photo-1");
    expect(output.html).not.toContain("/uploads/");
    expect(output.text).toContain("lastništvo naslova ni potrjeno");
    expect(output.text).toContain("Ujemanje e-pošte in številke naročila");
  });
  it("customer acknowledgements contain only reference and generic text even if passed a full ticket", () => {
    const output = renderSupportCustomerEmail(ticket);
    expect(output.html).toContain(ticket.reference);
    for (const privateValue of [ticket.name, ticket.email, ticket.orderNumber, "Private medical note", "photo-1", "DAMAGED"]) {
      expect(JSON.stringify(output)).not.toContain(privateValue);
    }
  });
  it("escapes an unexpected reference and prevents subject line injection", () => {
    const output = renderSupportCustomerEmail({ reference: '<x>\r\nBcc: other@example.test' });
    expect(output.subject).not.toMatch(/[\r\n]/); expect(output.html).toContain("&lt;x&gt;"); expect(output.html).not.toContain("<x>");
  });
  it("localizes topic and reason codes and safely handles historical unknown reasons", () => {
    const output = renderSupportStaffEmail({ ...ticket, topic: "CANCEL", reason: "CHANGED_MIND", orderProof: "ACCOUNT" });
    expect(output.text).toContain("Preklic naročila"); expect(output.text).toContain("Premislil/-a sem si");
    expect(output.text).toContain("Prijavljeni imetnik računa");
    expect(renderSupportStaffEmail({ ...ticket, reason: "<legacy>" }).html).toContain("&lt;legacy&gt;");
    expect(renderSupportStaffEmail({ ...ticket, reason: "__proto__" }).text).toContain("__proto__");
  });
});
