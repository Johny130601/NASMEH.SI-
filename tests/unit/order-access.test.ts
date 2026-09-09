import { describe, expect, it } from "vitest";
import {
  accessHash, cartDigest, orderAccessCookieName, sessionOwnsOrder,
  signOrderReceipt, verifyOrderReceipt, type OrderReceipt,
} from "@/lib/orders/access-token";

const secret = "receipt-unit-secret-which-is-at-least-32-characters";
const now = new Date("2026-09-09T12:00:00Z");
const order = { number: "NS-2026-00001", checkoutKey: "a".repeat(32), userId: "owner" };
const receipt: OrderReceipt = {
  v: 1, orderNumber: order.number, checkoutKeyHash: accessHash(order.checkoutKey), principal: null, allowCartClear: true,
  cartDigest: cartDigest([{ variantId: "v1", quantity: 1 }]), cartVersion: "cart-version",
  expiresAt: now.getTime() + 60_000,
};

describe("order purchaser receipt", () => {
  it("permits the original unexpired order and never contains the checkout secret", () => {
    const raw = signOrderReceipt(receipt, secret);
    expect(verifyOrderReceipt(raw, order, secret, now)).toEqual(receipt);
    expect(Buffer.from(raw.split(".")[0], "base64url").toString()).not.toContain(order.checkoutKey);
  });
  it("rejects modified identity, cart permission, signature and wrong signing key", () => {
    const raw = signOrderReceipt(receipt, secret);
    const modified = Buffer.from(JSON.stringify({ ...receipt, orderNumber: "NS-2026-00002" })).toString("base64url");
    expect(verifyOrderReceipt(`${modified}.${raw.split(".")[1]}`, order, secret, now)).toBeNull();
    expect(verifyOrderReceipt(`${raw.slice(0, -4)}aaaa`, order, secret, now)).toBeNull();
    expect(verifyOrderReceipt(raw, order, "different-secret", now)).toBeNull();
  });
  it("cannot reuse a receipt for a different order or revoked checkout key", () => {
    const raw = signOrderReceipt(receipt, secret);
    expect(verifyOrderReceipt(raw, { ...order, number: "NS-2026-00002" }, secret, now)).toBeNull();
    expect(verifyOrderReceipt(raw, { ...order, checkoutKey: "b".repeat(32) }, secret, now)).toBeNull();
    expect(verifyOrderReceipt(raw, { ...order, checkoutKey: null }, secret, now)).toBeNull();
  });
  it("rejects expiry, malformed payloads and missing proof", () => {
    const raw = signOrderReceipt(receipt, secret);
    expect(verifyOrderReceipt(raw, order, secret, new Date(receipt.expiresAt))).toBeNull();
    for (const invalid of [undefined, order.number, "invalid.cookie", `${raw}.extra`, `${raw.split(".")[0]}.${"é".repeat(43)}`, "x".repeat(2049)]) {
      expect(verifyOrderReceipt(invalid, order, secret, now)).toBeNull();
    }
  });
  it("distinguishes item quantities but ignores ordering in a cart fingerprint", () => {
    const lines = [{ variantId: "b", quantity: 1 }, { variantId: "a", quantity: 2 }];
    expect(cartDigest(lines)).toBe(cartDigest([...lines].reverse()));
    expect(cartDigest(lines)).not.toBe(cartDigest([{ variantId: "b", quantity: 2 }, lines[1]]));
    expect(orderAccessCookieName(order.number)).not.toBe(orderAccessCookieName("NS-2026-00002"));
  });
  it("allows only the owner or admin session, never another customer or anonymous guest", () => {
    expect(sessionOwnsOrder(order, { user: { id: "owner", role: "CUSTOMER" } })).toBe(true);
    expect(sessionOwnsOrder(order, { user: { id: "admin", role: "ADMIN" } })).toBe(true);
    expect(sessionOwnsOrder(order, { user: { id: "other", role: "CUSTOMER" } })).toBe(false);
    expect(sessionOwnsOrder(order, null)).toBe(false);
    expect(sessionOwnsOrder({ userId: null }, { user: { id: "other", role: "CUSTOMER" } })).toBe(false);
  });
});
