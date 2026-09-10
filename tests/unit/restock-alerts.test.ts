import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { backInStockSubscription: {
  findMany: mocks.findMany, updateMany: mocks.updateMany, findUnique: mocks.findUnique,
} } }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ AUTH_SECRET: "unit-restock-secret" }) }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));
vi.mock("@/lib/email/mailer", () => ({ sendBackInStockAlertEmail: mocks.send }));

import { sendPendingRestockAlerts } from "@/lib/jobs/restock-alerts";
import { verifyUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";

const variant = { id: "v1", stock: 3, priceCents: 1999 };
const subscription = {
  id: "cmf0restocksubscription01", email: "buyer@example.test", status: "CONFIRMED", notifiedAt: null,
  variant, product: { id: "p1", slug: "serum", title: "Serum", status: "ACTIVE", variants: [variant] },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.findMany.mockResolvedValue([{ id: subscription.id }]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockResolvedValue(subscription);
  mocks.send.mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

describe("restock alerts", () => {
  it("claims before mailing, sends the PDP link, price and a verifiable unsubscribe link, then marks notified", async () => {
    expect(await sendPendingRestockAlerts()).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    const mail = mocks.send.mock.calls[0][0];
    expect(mail).toMatchObject({
      to: "buyer@example.test", subscriptionId: subscription.id, productTitle: "Serum",
      productUrl: "https://nasmeh.example/izdelek/serum", priceCents: 1999,
    });
    const token = String(mail.unsubscribeUrl).split("/odjava-zaloga/")[1];
    expect(verifyUnsubscribeToken(token, "unit-restock-secret")).toBe(subscription.id);
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: subscription.id, notifiedAt: null }),
      data: expect.objectContaining({ notifiedAt: expect.any(Date), alertPendingSince: null, alertLeaseToken: null }),
    }));
  });

  it("selects only armed, confirmed, un-notified rows whose lease is free", async () => {
    await sendPendingRestockAlerts(new Date("2026-09-10T10:00:00Z"));
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({
      status: "CONFIRMED", notifiedAt: null, alertPendingSince: { not: null },
      OR: [{ alertLeaseUntil: null }, { alertLeaseUntil: { lte: new Date("2026-09-10T10:00:00Z") } }],
    });
  });

  it("skips when another worker already holds the lease", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await sendPendingRestockAlerts()).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    ["sold out again", { ...subscription, variant: { ...variant, stock: 0 }, product: { ...subscription.product, variants: [{ ...variant, stock: 0 }] } }],
    ["product no longer active", { ...subscription, product: { ...subscription.product, status: "ARCHIVED" } }],
    ["already notified by a concurrent worker", { ...subscription, notifiedAt: new Date() }],
    ["unsubscribed meanwhile", { ...subscription, status: "UNSUBSCRIBED" }],
  ])("disarms without mailing when %s", async (_label, row) => {
    mocks.findUnique.mockResolvedValue(row);
    expect(await sendPendingRestockAlerts()).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { alertPendingSince: null, alertLeaseToken: null, alertLeaseUntil: null },
    }));
  });

  it("keeps an SMTP failure retryable without the recipient in logs", async () => {
    mocks.send.mockRejectedValueOnce(new Error("SMTP recipient buyer@example.test rejected"));
    expect(await sendPendingRestockAlerts()).toMatchObject({ sent: 0, failed: 1 });
    const release = mocks.updateMany.mock.calls.at(-1)![0];
    expect(release.data).toEqual({ alertLeaseToken: null, alertLeaseUntil: null, alertLastError: "Error" });
    expect(release.data).not.toHaveProperty("notifiedAt");
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain("buyer@example.test");
  });
});
