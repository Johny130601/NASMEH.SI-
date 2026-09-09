import { beforeEach, describe, expect, it, vi } from "vitest";
import { cartDigest } from "@/lib/orders/access-token";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), receipt: vi.fn(), cartLines: vi.fn(), cartVersion: vi.fn(), clearGuest: vi.fn(),
  findOrder: vi.fn(), claimOrder: vi.fn(), findUser: vi.fn(), createUser: vi.fn(), consent: vi.fn(),
  issueToken: vi.fn(), mail: vi.fn(), tx: vi.fn(),
  findCart: vi.fn(), deleteCart: vi.fn(), updateCart: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/orders/access", () => ({ getOrderReceipt: mocks.receipt, currentCartVersion: mocks.cartVersion }));
vi.mock("@/lib/cart/server", () => ({ getCartLines: mocks.cartLines, clearGuestCart: mocks.clearGuest }));
vi.mock("@/lib/auth-tokens", () => ({ issueAuthToken: mocks.issueToken }));
vi.mock("@/lib/email/mailer", () => ({ sendVerifyAccountEmail: mocks.mail }));
vi.mock("@/lib/db", () => ({ db: {
  order: { findUnique: mocks.findOrder, updateMany: mocks.claimOrder },
  user: { findUnique: mocks.findUser }, $transaction: mocks.tx,
} }));

import { clearPurchasedCart, createPurchaserAccount } from "@/lib/orders/post-purchase";

const lines = [{ variantId: "v1", quantity: 1 }];
const order = {
  id: "o1", number: "NS-2026-00001", checkoutKey: "a".repeat(32), status: "PAID",
  userId: null, email: "buyer@test.si", shippingAddress: { fullName: "Buyer" },
  marketingOptIn: false, cartClearedAt: null, items: lines,
};
const receipt = { principal: null, allowCartClear: true, cartDigest: cartDigest(lines), cartVersion: "original" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.findOrder.mockResolvedValue(order);
  mocks.receipt.mockResolvedValue(receipt);
  mocks.cartLines.mockResolvedValue(lines);
  mocks.cartVersion.mockResolvedValue("original");
  mocks.claimOrder.mockResolvedValue({ count: 1 });
  mocks.findUser.mockResolvedValue(null);
  mocks.createUser.mockResolvedValue({ id: "new-user" });
  mocks.issueToken.mockResolvedValue("verification-token");
  mocks.tx.mockImplementation(async (operation) => operation({
    order: { updateMany: mocks.claimOrder }, user: { create: mocks.createUser },
    consentLog: { create: mocks.consent }, cart: { findUnique: mocks.findCart, update: mocks.updateCart },
    cartItem: { deleteMany: mocks.deleteCart },
  }));
});

describe("post-purchase account ownership", () => {
  it("denies a valid order number without the original purchaser receipt", async () => {
    mocks.receipt.mockResolvedValue(null);
    expect(await createPurchaserAccount({ orderNumber: order.number, password: "Password123!" }))
      .toEqual({ ok: false, error: "order_access" });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.claimOrder).not.toHaveBeenCalled();
    expect(mocks.mail).not.toHaveBeenCalled();
  });
  it("creates and claims only a new account, logs consent, and sends verification", async () => {
    expect(await createPurchaserAccount({ orderNumber: order.number, password: "Password123!" })).toEqual({ ok: true });
    expect(mocks.createUser).toHaveBeenCalledWith({ data: expect.objectContaining({ email: order.email, marketingOptIn: false }) });
    expect(mocks.claimOrder).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: order.id, userId: null }), data: { userId: "new-user" } }));
    expect(mocks.consent).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "new-user", choices: expect.objectContaining({ marketing: false }) }) });
    expect(mocks.issueToken).toHaveBeenCalledWith("new-user", "VERIFY_EMAIL");
    expect(mocks.mail).toHaveBeenCalledWith(order.email, "verification-token");
  });
  it("never links or overwrites an existing account with the same email", async () => {
    mocks.findUser.mockResolvedValue({ id: "existing", email: order.email });
    expect(await createPurchaserAccount({ orderNumber: order.number, password: "Password123!" }))
      .toEqual({ ok: false, error: "email_taken" });
    expect(mocks.tx).not.toHaveBeenCalled();
    expect(mocks.issueToken).not.toHaveBeenCalled();
  });
  it("can resend activation for the same claimed unverified account without resetting its password", async () => {
    mocks.findOrder.mockResolvedValue({ ...order, userId: "claimed" });
    mocks.findUser.mockResolvedValue({ id: "claimed", email: order.email, emailVerified: null });
    expect(await createPurchaserAccount({ orderNumber: order.number, password: "Different123!" })).toEqual({ ok: true });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.issueToken).toHaveBeenCalledWith("claimed", "VERIFY_EMAIL");
  });
});

describe("paid-order cart cleanup", () => {
  it("clears the unchanged purchased guest cart only once", async () => {
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: true, cleared: true });
    expect(mocks.clearGuest).toHaveBeenCalledOnce();
    mocks.findOrder.mockResolvedValue({ ...order, cartClearedAt: new Date() });
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: true, cleared: false });
    expect(mocks.clearGuest).toHaveBeenCalledOnce();
  });
  it("preserves a newly built identical cart using its mutation version", async () => {
    mocks.cartVersion.mockResolvedValue("new-identical-cart");
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: true, cleared: false });
    expect(mocks.clearGuest).not.toHaveBeenCalled();
  });
  it("does not clear a fresh cart when an old order is recovered in a new browser", async () => {
    mocks.receipt.mockResolvedValue({ ...receipt, allowCartClear: false });
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: false });
    expect(mocks.claimOrder).not.toHaveBeenCalled();
    expect(mocks.clearGuest).not.toHaveBeenCalled();
  });
  it("preserves changed cart contents and consumes the old cleanup opportunity", async () => {
    mocks.cartLines.mockResolvedValue([{ variantId: "v2", quantity: 1 }]);
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: true, cleared: false });
    expect(mocks.claimOrder).toHaveBeenCalledOnce();
    expect(mocks.clearGuest).not.toHaveBeenCalled();
  });
  it("requires paid status, purchaser proof and the original cart principal", async () => {
    mocks.receipt.mockResolvedValue(null);
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: false });
    mocks.receipt.mockResolvedValue(receipt);
    mocks.auth.mockResolvedValue({ user: { id: "different-customer", role: "ADMIN" } });
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: false });
    mocks.auth.mockResolvedValue(null);
    mocks.findOrder.mockResolvedValue({ ...order, status: "PENDING" });
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: false });
    expect(mocks.claimOrder).not.toHaveBeenCalled();
    expect(mocks.clearGuest).not.toHaveBeenCalled();
  });
  it("clears matching account cart atomically, but preserves a changed account cart", async () => {
    const updatedAt = new Date("2026-09-09T12:00:00Z");
    mocks.auth.mockResolvedValue({ user: { id: "owner", role: "CUSTOMER" } });
    mocks.receipt.mockResolvedValue({ ...receipt, principal: "owner", cartVersion: `c1:${updatedAt.toISOString()}` });
    mocks.findCart.mockResolvedValue({ id: "c1", updatedAt, items: lines });
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: true, cleared: true });
    expect(mocks.deleteCart).toHaveBeenCalledWith({ where: { cartId: "c1" } });
    mocks.findCart.mockResolvedValue({ id: "c1", updatedAt: new Date(updatedAt.getTime() + 1), items: lines });
    expect(await clearPurchasedCart({ orderNumber: order.number })).toEqual({ ok: true, cleared: false });
    expect(mocks.deleteCart).toHaveBeenCalledOnce();
    expect(mocks.clearGuest).not.toHaveBeenCalled();
  });
});
