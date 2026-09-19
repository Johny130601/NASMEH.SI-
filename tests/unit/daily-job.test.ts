import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ confirmations: vi.fn(), refunds: vi.fn(), shipped: vi.fn(), reviews: vi.fn(), restock: vi.fn(), tickets: vi.fn(), retention: vi.fn(), env: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: mocks.env }));
vi.mock("@/lib/orders/confirmation-delivery", () => ({ retryPendingOrderConfirmations: mocks.confirmations }));
vi.mock("@/lib/orders/refunds", () => ({ resolvePendingRefunds: mocks.refunds }));
vi.mock("@/lib/orders/shipped-delivery", () => ({ retryPendingShippedEmails: mocks.shipped }));
vi.mock("@/lib/jobs/review-requests", () => ({ sendDueReviewRequests: mocks.reviews }));
vi.mock("@/lib/jobs/restock-alerts", () => ({ sendPendingRestockAlerts: mocks.restock }));
vi.mock("@/lib/support/delivery", () => ({ retryPendingTicketEmails: mocks.tickets }));
vi.mock("@/lib/jobs/retention", () => ({ runRetention: mocks.retention }));
import { POST } from "@/app/api/jobs/daily/route";
const zero = { processed: 0, sent: 0, failed: 0, skipped: 0 };
const retention = { authTokensDeleted: 0, activationDataCleared: 0, abandonedCheckoutsDeleted: 0, rejectedReviewPhotosRemoved: 0, unownedSupportPhotosRemoved: 0, failed: 0 };
const refundResolution = { applied: 0, interrupted: 0, failed: 0 };
const request = (authorization = "Bearer job-secret") => new Request("http://localhost/api/jobs/daily", {
  method: "POST", headers: { authorization },
});
beforeEach(() => {
  vi.resetAllMocks(); mocks.env.mockReturnValue({ JOBS_SECRET: "job-secret" });
  mocks.confirmations.mockResolvedValue(zero); mocks.shipped.mockResolvedValue(zero);
  mocks.reviews.mockResolvedValue(zero); mocks.restock.mockResolvedValue(zero); mocks.tickets.mockResolvedValue(zero);
  mocks.retention.mockResolvedValue(retention); mocks.refunds.mockResolvedValue(refundResolution);
});
afterEach(() => vi.restoreAllMocks());
describe("daily delivery job", () => {
  it("returns retryable failure when a pending refund could not be resolved, and reports the counts only", async () => {
    mocks.refunds.mockResolvedValue({ applied: 1, interrupted: 1, failed: 1 });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).refundResolution).toEqual({ applied: 1, interrupted: 1, failed: 1 });
    expect(mocks.refunds).toHaveBeenCalledOnce();
    expect(mocks.retention).toHaveBeenCalledOnce();
  });
  it("returns retryable failure when only confirmations fail", async () => {
    mocks.confirmations.mockResolvedValue({ processed: 1, sent: 0, failed: 1, skipped: 0 });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ...zero, confirmationRetries: { processed: 1, sent: 0, failed: 1, skipped: 0 }, refundResolution, shippedRetries: zero, restockAlerts: zero, ticketRetries: zero, retention });
    expect(mocks.reviews).toHaveBeenCalledOnce();
    expect(mocks.retention).toHaveBeenCalledOnce();
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
    expect(await response.json()).toEqual({ ...zero, confirmationRetries: zero, refundResolution, shippedRetries: shipped, restockAlerts: zero, ticketRetries: zero, retention });
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
    expect(await response.json()).toEqual({ ...zero, confirmationRetries: zero, refundResolution, shippedRetries: zero, restockAlerts: zero, ticketRetries: tickets, retention });
  });
  it("reports retention counts only and asks for a retry when a clean-up step failed", async () => {
    const counts = { authTokensDeleted: 3, activationDataCleared: 2, abandonedCheckoutsDeleted: 4, rejectedReviewPhotosRemoved: 1, failed: 0 };
    mocks.retention.mockResolvedValue(counts);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(((await response.json()) as { retention: unknown }).retention).toEqual(counts);
    mocks.retention.mockResolvedValue({ ...counts, failed: 1 });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.retention.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.tickets.mock.invocationCallOrder[0]);
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
    expect(mocks.retention).not.toHaveBeenCalled();
  });
});
