import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ confirmations: vi.fn(), shipped: vi.fn(), reviews: vi.fn(), restock: vi.fn(), tickets: vi.fn(), env: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: mocks.env }));
vi.mock("@/lib/orders/confirmation-delivery", () => ({ retryPendingOrderConfirmations: mocks.confirmations }));
vi.mock("@/lib/orders/shipped-delivery", () => ({ retryPendingShippedEmails: mocks.shipped }));
vi.mock("@/lib/jobs/review-requests", () => ({ sendDueReviewRequests: mocks.reviews }));
vi.mock("@/lib/jobs/restock-alerts", () => ({ sendPendingRestockAlerts: mocks.restock }));
vi.mock("@/lib/support/delivery", () => ({ retryPendingTicketEmails: mocks.tickets }));
import { POST } from "@/app/api/jobs/daily/route";
const zero = { processed: 0, sent: 0, failed: 0, skipped: 0 };
const request = (authorization = "Bearer job-secret") => new Request("http://localhost/api/jobs/daily", {
  method: "POST", headers: { authorization },
});
beforeEach(() => {
  vi.resetAllMocks(); mocks.env.mockReturnValue({ JOBS_SECRET: "job-secret" });
  mocks.confirmations.mockResolvedValue(zero); mocks.shipped.mockResolvedValue(zero);
  mocks.reviews.mockResolvedValue(zero); mocks.restock.mockResolvedValue(zero); mocks.tickets.mockResolvedValue(zero);
});
afterEach(() => vi.restoreAllMocks());
describe("daily delivery job", () => {
  it("returns retryable failure when only confirmations fail", async () => {
    mocks.confirmations.mockResolvedValue({ processed: 1, sent: 0, failed: 1, skipped: 0 });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ...zero, confirmationRetries: { processed: 1, sent: 0, failed: 1, skipped: 0 }, shippedRetries: zero, restockAlerts: zero, ticketRetries: zero });
    expect(mocks.reviews).toHaveBeenCalledOnce();
  });
  it("does not report successful or intentionally skipped work as failure", async () => {
    mocks.confirmations.mockResolvedValue({ processed: 3, sent: 1, failed: 0, skipped: 2 });
    expect((await POST(request())).status).toBe(200);
  });
  it("still reports review delivery failures independently", async () => {
    mocks.reviews.mockResolvedValue({ processed: 1, sent: 0, failed: 1, skipped: 0 });
    expect((await POST(request())).status).toBe(503);
  });
  it("returns retryable failure when only a shipped notification fails", async () => {
    const shipped = { processed: 1, sent: 0, failed: 1, skipped: 0 };
    mocks.shipped.mockResolvedValue(shipped);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ...zero, confirmationRetries: zero, shippedRetries: shipped, restockAlerts: zero, ticketRetries: zero });
  });
  it("returns retryable failure when only a restock alert fails, and counts disarmed rows as skips", async () => {
    mocks.restock.mockResolvedValue({ processed: 2, sent: 0, failed: 1, skipped: 1 });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(((await response.json()) as { restockAlerts: unknown }).restockAlerts).toEqual({ processed: 2, sent: 0, failed: 1, skipped: 1 });
    mocks.restock.mockResolvedValue({ processed: 2, sent: 1, failed: 0, skipped: 1 });
    expect((await POST(request())).status).toBe(200);
  });
  it("returns retryable failure when only a support ticket email fails", async () => {
    const tickets = { processed: 2, sent: 1, failed: 1, skipped: 0 };
    mocks.tickets.mockResolvedValue(tickets);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ...zero, confirmationRetries: zero, shippedRetries: zero, restockAlerts: zero, ticketRetries: tickets });
  });
  it("treats already-claimed ticket emails as skips rather than delivery failures", async () => {
    mocks.tickets.mockResolvedValue({ processed: 2, sent: 0, failed: 0, skipped: 2 });
    expect((await POST(request())).status).toBe(200);
  });
  it("does not expose an unexpected raw delivery error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.confirmations.mockRejectedValue(new Error("SMTP recipient private@example.test"));
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "retry_required" });
    expect(log).toHaveBeenCalledWith("Daily delivery job requires retry");
  });
  it.each(["", "Bearer invalid", "Bearer job-secret-extra"])("rejects unauthorized jobs before any side effects: %s", async authorization => {
    expect((await POST(request(authorization))).status).toBe(401);
    expect(mocks.confirmations).not.toHaveBeenCalled(); expect(mocks.shipped).not.toHaveBeenCalled();
    expect(mocks.reviews).not.toHaveBeenCalled(); expect(mocks.restock).not.toHaveBeenCalled(); expect(mocks.tickets).not.toHaveBeenCalled();
  });
});
