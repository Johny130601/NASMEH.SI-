import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The purchaser account's newsletter flag (Phase 9 step 4 review S4):
 * Order.marketingOptIn is only the checkout box's request, so the account opts
 * in only while a CONFIRMED Subscriber exists for the address; the value lands
 * in User.marketingOptIn and therefore in the VERIFY_EMAIL activation snapshot
 * that issueAuthToken reads from the row.
 */

const mocks = vi.hoisted(() => ({
  receipt: vi.fn(), findOrder: vi.fn(), claimOrder: vi.fn(), findUser: vi.fn(), updateUsers: vi.fn(), createUser: vi.fn(),
  consent: vi.fn(), issueToken: vi.fn(), mail: vi.fn(), tx: vi.fn(), txSubscriber: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/orders/access", () => ({ getOrderReceipt: mocks.receipt, currentCartVersion: vi.fn() }));
vi.mock("@/lib/cart/server", () => ({ getCartLines: vi.fn(), clearGuestCart: vi.fn() }));
vi.mock("@/lib/auth-tokens", () => ({ issueAuthToken: mocks.issueToken }));
vi.mock("@/lib/email/mailer", () => ({ sendVerifyAccountEmail: mocks.mail }));
vi.mock("@/lib/db", () => ({ db: {
  order: { findUnique: mocks.findOrder },
  user: { findUnique: mocks.findUser },
  $transaction: mocks.tx,
} }));

import { createPurchaserAccount } from "@/lib/orders/post-purchase";
import { marketingVersion } from "@/lib/consent-log";

const order = {
  id: "o1", number: "NS-2026-00005", status: "PAID", userId: null, email: "Kupec@Test.si",
  shippingAddress: { fullName: "Kupec Test" }, marketingOptIn: true,
};
const claim = { orderNumber: order.number, password: "Password123!" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findOrder.mockResolvedValue(order);
  mocks.receipt.mockResolvedValue({ principal: null, allowCartClear: true });
  mocks.findUser.mockResolvedValue(null);
  mocks.createUser.mockResolvedValue({ id: "new-user" });
  mocks.claimOrder.mockResolvedValue({ count: 1 });
  mocks.consent.mockResolvedValue({});
  mocks.issueToken.mockResolvedValue("verification-token");
  mocks.updateUsers.mockResolvedValue({ count: 1 });
  mocks.tx.mockImplementation(async (operation) => operation({
    order: { updateMany: mocks.claimOrder }, user: { create: mocks.createUser, updateMany: mocks.updateUsers },
    subscriber: { findUnique: mocks.txSubscriber }, consentLog: { create: mocks.consent },
  }));
});

describe("purchaser account newsletter flag", () => {
  it.each([
    ["no subscriber", null],
    ["a PENDING (unconfirmed) subscriber", { id: "sub-1", status: "PENDING" }],
    ["an UNSUBSCRIBED (withdrawn) subscriber", { id: "sub-1", status: "UNSUBSCRIBED" }],
  ])("stays false with %s, even though the checkout box was ticked", async (_label, subscriber) => {
    mocks.txSubscriber.mockResolvedValue(subscriber);
    expect(await createPurchaserAccount(claim)).toEqual({ ok: true });
    expect(mocks.txSubscriber).toHaveBeenCalledWith({ where: { email: "kupec@test.si" }, select: { id: true, status: true } });
    expect(mocks.createUser).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "kupec@test.si", marketingOptIn: false }) });
    expect(mocks.consent).toHaveBeenCalledWith({ data: {
      userId: "new-user", kind: "marketing-register", version: marketingVersion("marketing-checkout"), visitorId: null,
      choices: {
        marketing: false, requested: true, source: "post-purchase", orderNumber: order.number,
        subscriberStatus: subscriber?.status ?? "none", ...(subscriber ? { subscriberId: subscriber.id } : {}),
      },
    } });
    // The activation snapshot is read from the created row, so the link carries false too.
    expect(mocks.issueToken).toHaveBeenCalledWith("new-user", "VERIFY_EMAIL");
  });

  it("is true only for a CONFIRMED subscriber for the address", async () => {
    mocks.txSubscriber.mockResolvedValue({ id: "sub-2", status: "CONFIRMED" });
    mocks.findOrder.mockResolvedValue({ ...order, marketingOptIn: false });
    expect(await createPurchaserAccount(claim)).toEqual({ ok: true });
    expect(mocks.createUser).toHaveBeenCalledWith({ data: expect.objectContaining({ marketingOptIn: true }) });
    expect(mocks.consent.mock.calls[0][0].data.choices).toEqual({
      marketing: true, requested: false, source: "post-purchase", orderNumber: order.number, subscriberStatus: "CONFIRMED", subscriberId: "sub-2",
    });
  });

  it("a resent activation for the claimed account lowers, and logs, an opt-in whose subscription is no longer confirmed", async () => {
    mocks.findOrder.mockResolvedValue({ ...order, userId: "claimed" });
    mocks.findUser.mockResolvedValue({ id: "claimed", email: "kupec@test.si", emailVerified: null, marketingOptIn: true });
    mocks.txSubscriber.mockResolvedValue({ id: "sub-3", status: "UNSUBSCRIBED" });
    expect(await createPurchaserAccount(claim)).toEqual({ ok: true });
    expect(mocks.updateUsers).toHaveBeenCalledWith({
      where: { id: "claimed", emailVerified: null, marketingOptIn: true }, data: { marketingOptIn: false },
    });
    expect(mocks.consent.mock.calls[0][0].data).toMatchObject({
      userId: "claimed", kind: "marketing-register",
      choices: { marketing: false, previous: true, source: "post-purchase-resend", orderNumber: order.number, subscriberStatus: "UNSUBSCRIBED", subscriberId: "sub-3" },
    });
    // Lowered before the token snapshots the row.
    expect(mocks.updateUsers.mock.invocationCallOrder[0]).toBeLessThan(mocks.issueToken.mock.invocationCallOrder[0]);
    expect(mocks.issueToken).toHaveBeenCalledWith("claimed", "VERIFY_EMAIL");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("a resent activation keeps a still-confirmed opt-in and leaves an opted-out account alone", async () => {
    mocks.findOrder.mockResolvedValue({ ...order, userId: "claimed" });
    mocks.findUser.mockResolvedValue({ id: "claimed", email: "kupec@test.si", emailVerified: null, marketingOptIn: true });
    mocks.txSubscriber.mockResolvedValue({ id: "sub-3", status: "CONFIRMED" });
    expect(await createPurchaserAccount(claim)).toEqual({ ok: true });
    expect(mocks.updateUsers).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();

    mocks.findUser.mockResolvedValue({ id: "claimed", email: "kupec@test.si", emailVerified: null, marketingOptIn: false });
    mocks.txSubscriber.mockClear();
    expect(await createPurchaserAccount(claim)).toEqual({ ok: true });
    expect(mocks.txSubscriber).not.toHaveBeenCalled();
    expect(mocks.updateUsers).not.toHaveBeenCalled();
  });

  it("a resent activation logs nothing when a concurrent change already lowered the flag", async () => {
    mocks.findOrder.mockResolvedValue({ ...order, userId: "claimed" });
    mocks.findUser.mockResolvedValue({ id: "claimed", email: "kupec@test.si", emailVerified: null, marketingOptIn: true });
    mocks.txSubscriber.mockResolvedValue(null);
    mocks.updateUsers.mockResolvedValue({ count: 0 });
    expect(await createPurchaserAccount(claim)).toEqual({ ok: true });
    expect(mocks.consent).not.toHaveBeenCalled();
  });
});
