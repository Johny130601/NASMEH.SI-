import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findOrder: vi.fn(), createRequests: vi.fn(), updateRequests: vi.fn(), send: vi.fn(), setting: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { order: { findMany: mocks.findMany, findUnique: mocks.findOrder }, reviewRequest: { createMany: mocks.createRequests, updateMany: mocks.updateRequests } } }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-review-secret" }) }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.setting }));
vi.mock("@/lib/email/mailer", () => ({ sendReviewRequestEmail: mocks.send }));

import { sendDueReviewRequests } from "@/lib/jobs/review-requests";
import { verifyRatingToken } from "@/lib/reviews/rating-token";

const now = new Date("2026-09-20T12:00:00Z");
const deliveredAt = new Date("2026-09-10T12:00:00Z");
const order = { id: "order-1", status: "DELIVERED", deliveredAt, refundRequired: false,
  email: "private@example.test", items: [{ id: "item-1", title: "Review item" }] };

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.setting.mockResolvedValue(7);
  mocks.findMany.mockImplementation(async query => query.where.reviewRequest === null ? [{ id: order.id }] : []);
  mocks.findOrder.mockResolvedValue(order); mocks.createRequests.mockResolvedValue({ count: 1 });
  mocks.updateRequests.mockResolvedValue({ count: 1 }); mocks.send.mockResolvedValue({ messageId: "sent" });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("durable review requests", () => {
  it("claims before mail and supplies five independently signed rating links", async () => {
    expect(await sendDueReviewRequests(now)).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(mocks.createRequests).toHaveBeenCalledWith({ data: [{ orderId: "order-1" }], skipDuplicates: true });
    expect(mocks.updateRequests.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    const links = mocks.send.mock.calls[0][1][0].ratingUrls as Array<{ rating: number; token: string }>;
    expect(links.map(link => verifyRatingToken(link.token, "unit-review-secret", now.getTime())?.rating)).toEqual([1, 2, 3, 4, 5]);
    expect(mocks.updateRequests).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ sentAt: now, leaseUntil: null, leaseToken: null }) }));
  });

  it("uses delivery time and configured delay, never updatedAt, for eligibility", async () => {
    mocks.setting.mockResolvedValue(10);
    await sendDueReviewRequests(now);
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.deliveredAt).toEqual({ lte: deliveredAt });
    expect(where).not.toHaveProperty("updatedAt");
    expect(where.items).toEqual({ some: { variantId: { not: null }, review: null } });
  });

  it("never selects an anonymised order, neither as a new recipient nor as a retry", async () => {
    mocks.findMany.mockResolvedValue([]);
    await sendDueReviewRequests(now);
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    for (const [query] of mocks.findMany.mock.calls) expect(query.where.anonymizedAt).toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("skips when another worker already owns the send lease", async () => {
    mocks.updateRequests.mockResolvedValueOnce({ count: 0 });
    expect(await sendDueReviewRequests(now)).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps an SMTP failure retryable, then marks a successful retry sent", async () => {
    mocks.send.mockRejectedValueOnce(new Error("SMTP unavailable"));
    expect(await sendDueReviewRequests(now)).toMatchObject({ sent: 0, failed: 1 });
    const release = mocks.updateRequests.mock.calls.at(-1)![0];
    expect(release.where.leaseToken).toEqual(expect.any(String));
    expect(release.data).toEqual({ leaseUntil: null, leaseToken: null, lastError: "Error" });
    expect(release.data).not.toHaveProperty("sentAt");
    mocks.findMany.mockImplementation(async query => query.where.reviewRequest === null ? [] : [{ id: order.id }]);
    expect(await sendDueReviewRequests(now)).toMatchObject({ sent: 1, failed: 0 });
  });

  it("does not lose pending work if SMTP succeeds but its acknowledgement cannot commit", async () => {
    mocks.updateRequests.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("DB outage"));
    expect(await sendDueReviewRequests(now)).toMatchObject({ sent: 0, failed: 1 });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.updateRequests).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ sentAt: null }), data: expect.not.objectContaining({ sentAt: expect.anything() }) }));
  });

  it.each([
    { ...order, status: "REFUNDED" }, { ...order, refundRequired: true },
    { ...order, deliveredAt: now }, { ...order, items: [] }, { ...order, anonymizedAt: now }, null,
  ])("rechecks eligibility after claiming: %j", async changed => {
    mocks.findOrder.mockResolvedValue(changed);
    expect(await sendDueReviewRequests(now)).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("starts each lease at claim time even after an earlier delivery was slow", async () => {
    mocks.findMany.mockImplementation(async query => query.where.reviewRequest === null ? [{ id: "order-1" }, { id: "order-2" }] : []);
    mocks.send.mockImplementationOnce(async () => vi.setSystemTime(now.getTime() + 6 * 60_000));
    await sendDueReviewRequests(now);
    const secondClaim = mocks.updateRequests.mock.calls[2][0];
    expect(secondClaim.data.leaseUntil.getTime()).toBe(now.getTime() + 11 * 60_000);
  });

  it("gives a new recipient capacity ahead of an old failing batch and caps the combined batch at fifty", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: "new-recipient" }])
      .mockResolvedValueOnce(Array.from({ length: 49 }, (_, index) => ({ id: `retry-${index}` })));
    mocks.findOrder.mockImplementation(async query => ({ ...order, id: query.where.id }));
    expect(await sendDueReviewRequests(now)).toMatchObject({ processed: 50, sent: 50 });
    expect(mocks.send.mock.calls[0][0].id).toBe("new-recipient");
    expect(mocks.findMany.mock.calls[1][0]).toEqual({
      where: {
        status: "DELIVERED", deliveredAt: { lte: new Date(now.getTime() - 7 * 86_400_000) }, refundRequired: false, anonymizedAt: null,
        items: { some: { variantId: { not: null }, review: null } },
        id: { notIn: ["new-recipient"] },
        reviewRequest: { is: { sentAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] } },
      },
      select: { id: true },
      orderBy: [{ reviewRequest: { attempts: "asc" } }, { deliveredAt: "asc" }, { id: "asc" }],
      take: 49,
    });
  });

  it("does not select retries when fifty unrequested recipients already fill the batch", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 50 }, (_, index) => ({ id: `new-${index}` })));
    expect(await sendDueReviewRequests(now)).toMatchObject({ processed: 50 });
    expect(mocks.findMany).toHaveBeenCalledOnce();
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ where: { reviewRequest: null }, take: 50 });
  });

  it("rotates failed retry recipients so rows after the first fifty get an attempt on the next run", async () => {
    const queued = Array.from({ length: 52 }, (_, index) => ({ id: `retry-${String(index).padStart(2, "0")}`, attempts: 0 }));
    mocks.findMany.mockImplementation(async query => {
      if (query.where.reviewRequest === null) return [];
      expect(query.orderBy).toEqual([{ reviewRequest: { attempts: "asc" } }, { deliveredAt: "asc" }, { id: "asc" }]);
      return [...queued].sort((a, b) => a.attempts - b.attempts || a.id.localeCompare(b.id)).slice(0, query.take).map(row => ({ id: row.id }));
    });
    mocks.findOrder.mockImplementation(async query => ({ ...order, id: query.where.id }));
    mocks.updateRequests.mockImplementation(async query => {
      if (query.data.attempts) queued.find(row => row.id === query.where.orderId)!.attempts += query.data.attempts.increment;
      return { count: 1 };
    });
    mocks.send.mockRejectedValue(new Error("Recipient rejected"));
    expect(await sendDueReviewRequests(now)).toMatchObject({ processed: 50, failed: 50 });
    expect(queued.slice(-2).map(row => row.attempts)).toEqual([0, 0]);
    expect(await sendDueReviewRequests(now)).toMatchObject({ processed: 50, failed: 50 });
    expect(mocks.send.mock.calls.slice(50, 52).map(call => call[0].id)).toEqual(["retry-50", "retry-51"]);
    expect(queued.every(row => row.attempts > 0)).toBe(true);
  });
});
