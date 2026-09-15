import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), findUnique: vi.fn(), createManyAndReturn: vi.fn(), updateMany: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/email/mailer", () => ({ sendSubscriptionVerification: mocks.send }));
vi.mock("next/server", () => ({ after: mocks.after }));

import {
  requestCheckoutSubscription,
  scheduleCheckoutSubscriptionMail,
  sendCheckoutSubscriptionMail,
} from "@/lib/orders/checkout-subscription";

const EMAIL = "kupec@example.test";
const client = { subscriber: { findUnique: mocks.findUnique, createManyAndReturn: mocks.createManyAndReturn, updateMany: mocks.updateMany } } as never;
const PENDING_TOKEN = "p".repeat(48);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.createManyAndReturn.mockResolvedValue([{ id: "sub-1" }]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => vi.restoreAllMocks());

describe("requestCheckoutSubscription", () => {
  it("arms a PENDING checkout subscriber with a fresh token for a new address, without risking a unique-constraint abort", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const result = await requestCheckoutSubscription(client, " Kupec@Example.TEST ");
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { email: EMAIL }, select: { id: true, status: true, confirmToken: true } });
    expect(result).toMatchObject({ status: "pending-confirmation", subscriberId: "sub-1" });
    const token = (result as { token: string }).token;
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    expect(mocks.createManyAndReturn).toHaveBeenCalledWith({
      data: [{ email: EMAIL, confirmToken: token, source: "checkout" }], skipDuplicates: true, select: { id: true },
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("keeps a PENDING subscriber's token (an earlier mail's link stays valid) and holds the row conditionally", async () => {
    mocks.findUnique.mockResolvedValue({ id: "sub-3", status: "PENDING", confirmToken: PENDING_TOKEN });
    const result = await requestCheckoutSubscription(client, EMAIL);
    expect(result).toEqual({ status: "pending-confirmation", subscriberId: "sub-3", token: PENDING_TOKEN });
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "sub-3", status: "PENDING", confirmToken: PENDING_TOKEN },
      data: { updatedAt: expect.any(Date) },
    });
    // Neither the token, the source nor the status is rewritten.
    const data = mocks.updateMany.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(["updatedAt"]);
    expect(mocks.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("re-arms an UNSUBSCRIBED subscriber with a fresh token, conditional on it still being unsubscribed", async () => {
    mocks.findUnique.mockResolvedValue({ id: "sub-4", status: "UNSUBSCRIBED", confirmToken: "old" });
    const result = await requestCheckoutSubscription(client, EMAIL);
    const token = (result as { token: string }).token;
    expect(result).toMatchObject({ status: "pending-confirmation", subscriberId: "sub-4" });
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "sub-4", status: "UNSUBSCRIBED" },
      data: { status: "PENDING", confirmToken: token, confirmedAt: null, source: "checkout" },
    });
  });

  it("never touches or re-mails a CONFIRMED subscriber", async () => {
    mocks.findUnique.mockResolvedValue({ id: "sub-9", status: "CONFIRMED", confirmToken: "t" });
    const result = await requestCheckoutSubscription(client, EMAIL);
    expect(result).toEqual({ status: "already-confirmed", subscriberId: "sub-9", token: null });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.createManyAndReturn).not.toHaveBeenCalled();
    expect(await sendCheckoutSubscriptionMail(EMAIL, result)).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not downgrade a PENDING subscriber confirmed between the read and the write", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ id: "sub-5", status: "PENDING", confirmToken: PENDING_TOKEN })
      .mockResolvedValueOnce({ id: "sub-5", status: "CONFIRMED", confirmToken: PENDING_TOKEN });
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await requestCheckoutSubscription(client, EMAIL)).toEqual({ status: "already-confirmed", subscriberId: "sub-5", token: null });
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not re-arm an UNSUBSCRIBED row that was confirmed through a newer request in between", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ id: "sub-6", status: "UNSUBSCRIBED", confirmToken: "old" })
      .mockResolvedValueOnce({ id: "sub-6", status: "CONFIRMED", confirmToken: "new" });
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await requestCheckoutSubscription(client, EMAIL)).toEqual({ status: "already-confirmed", subscriberId: "sub-6", token: null });
  });

  it("follows a concurrent insert for the same address instead of failing the order", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "sub-7", status: "PENDING", confirmToken: PENDING_TOKEN });
    mocks.createManyAndReturn.mockResolvedValueOnce([]);
    expect(await requestCheckoutSubscription(client, EMAIL)).toEqual({ status: "pending-confirmation", subscriberId: "sub-7", token: PENDING_TOKEN });
  });

  it("gives up after repeated lost races rather than writing unconditionally", async () => {
    mocks.findUnique.mockResolvedValue({ id: "sub-8", status: "PENDING", confirmToken: PENDING_TOKEN });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(requestCheckoutSubscription(client, EMAIL)).rejects.toThrow("checkout_subscription_contended");
    expect(mocks.updateMany).toHaveBeenCalledTimes(3);
  });
});

describe("sendCheckoutSubscriptionMail", () => {
  it("sends the newsletter verification mail for a pending request", async () => {
    mocks.send.mockResolvedValue({});
    const sent = await sendCheckoutSubscriptionMail("Kupec@Example.test", { status: "pending-confirmation", subscriberId: "sub-1", token: "t".repeat(48) });
    expect(sent).toBe(true);
    expect(mocks.send).toHaveBeenCalledWith(EMAIL, "t".repeat(48), "sub-1");
  });

  it("does nothing without a request (unticked box)", async () => {
    expect(await sendCheckoutSubscriptionMail(EMAIL, null)).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("swallows an SMTP failure so the placed order is never reported as failed, logging the error class only", async () => {
    mocks.send.mockRejectedValue(new Error(`smtp rejected ${EMAIL}`));
    await expect(sendCheckoutSubscriptionMail(EMAIL, { status: "pending-confirmation", subscriberId: "sub-1", token: "a".repeat(48) })).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith("checkout newsletter verification failed", "Error");
  });
});

describe("scheduleCheckoutSubscriptionMail", () => {
  const pending = { status: "pending-confirmation", subscriberId: "sub-1", token: "t".repeat(48) } as const;

  it("hands the send to `after` inside a request, so nothing is sent before the response", async () => {
    mocks.send.mockResolvedValue({});
    scheduleCheckoutSubscriptionMail(EMAIL, pending);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.send).toHaveBeenCalledWith(EMAIL, pending.token, "sub-1");
  });

  it("falls back to a detached send outside a request scope, and a failure stays inside it", async () => {
    mocks.after.mockImplementation(() => { throw new Error("`after` was called outside a request scope"); });
    mocks.send.mockRejectedValue(new Error("smtp down"));
    expect(() => scheduleCheckoutSubscriptionMail(EMAIL, pending)).not.toThrow();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith("checkout newsletter verification failed", "Error"));
  });

  it("schedules nothing without a token", () => {
    scheduleCheckoutSubscriptionMail(EMAIL, null);
    scheduleCheckoutSubscriptionMail(EMAIL, { status: "already-confirmed", subscriberId: "sub-9", token: null });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
