import type { Order } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(), createIntent: vi.fn(), retrieveIntent: vi.fn(),
  findOrder: vi.fn(), updateOrder: vi.fn(), createOrder: vi.fn(), transaction: vi.fn(),
  auth: vi.fn(), pricing: vi.fn(), quoteMatches: vi.fn(), clearCode: vi.fn(), capturePayPal: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {
  order: { findUnique: mocks.findOrder, update: mocks.updateOrder, create: mocks.createOrder },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: mocks.getProvider }));
vi.mock("@/lib/payments/paypal", () => ({ capturePayPalOrder: mocks.capturePayPal }));
vi.mock("@/lib/koda", () => ({ clearKodaCode: mocks.clearCode }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));
vi.mock("@/lib/orders/quote", () => ({ buildCheckoutPricing: mocks.pricing, quoteMatches: mocks.quoteMatches }));
vi.mock("@/lib/promo/resolve", () => ({ resolveCouponInput: vi.fn() }));
vi.mock("@/lib/orders/numbers", () => ({ nextOrderNumber: vi.fn() }));

import { ensureOrderPayment, placeOrder } from "@/lib/orders/create";

/** Only fields used by payment recovery; unrelated order metadata is irrelevant. */
function pendingOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-recovery-1", number: "NS-2026-00042", status: "PENDING",
    email: "purchaser@example.test", userId: null, paymentProvider: "stripe",
    totalCents: 3499, currency: "EUR", stripePaymentIntentId: null,
    paypalOrderId: null, checkoutKey: "a".repeat(32),
    ...overrides,
  } as Order;
}

const input = {
  email: "purchaser@example.test", fullName: "Test Purchaser", street: "Testna ulica",
  streetNumber: "1", city: "Ljubljana", postalCode: "1000", country: "SI",
  shippingMethodId: "standard", provider: "stripe", marketingOptIn: false,
  checkoutKey: "a".repeat(32), quoteToken: "b".repeat(64), turnstileToken: "",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue(null);
  mocks.findOrder.mockResolvedValue(null);
  mocks.updateOrder.mockResolvedValue({});
  mocks.getProvider.mockImplementation((name: string) => ({
    name, createIntent: mocks.createIntent, retrieveIntent: mocks.retrieveIntent,
  }));
  mocks.createIntent.mockResolvedValue({
    provider: "stripe", intentId: "pi_recovery", clientSecret: "pi_recovery_secret", status: "requires_payment_method", amountCents: 3499, currency: "eur",
  });
  mocks.retrieveIntent.mockResolvedValue({
    provider: "stripe", intentId: "pi_existing", clientSecret: "pi_existing_secret", status: "requires_payment_method", amountCents: 3499, currency: "eur",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("recoverable payment setup", () => {
  it("creates from the stored snapshot and associates the intent before returning payment credentials", async () => {
    const order = pendingOrder();
    let completeAssociation!: () => void;
    mocks.updateOrder.mockImplementationOnce(() => new Promise<void>((resolve) => { completeAssociation = resolve; }));
    const pending = ensureOrderPayment(order);
    let returned = false;
    void pending.then(() => { returned = true; });
    await vi.waitFor(() => expect(mocks.updateOrder).toHaveBeenCalledTimes(1));
    expect(returned).toBe(false);
    expect(mocks.createIntent).toHaveBeenCalledWith({
      orderNumber: order.number, totalCents: 3499, email: order.email,
      returnUrl: "https://nasmeh.example/potrditev/NS-2026-00042",
    });
    expect(mocks.updateOrder).toHaveBeenCalledWith({
      where: { id: order.id }, data: { stripePaymentIntentId: "pi_recovery" },
    });
    completeAssociation();
    expect(await pending).toMatchObject({ ok: true, orderNumber: order.number, totalCents: 3499, clientSecret: "pi_recovery_secret" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("retrieves an associated Stripe intent instead of creating a replacement", async () => {
    const result = await ensureOrderPayment(pendingOrder({ stripePaymentIntentId: "pi_existing" }));
    expect(result).toMatchObject({ ok: true, intentId: "pi_existing", clientSecret: "pi_existing_secret", totalCents: 3499 });
    expect(mocks.retrieveIntent).toHaveBeenCalledWith("pi_existing");
    expect(mocks.createIntent).not.toHaveBeenCalled();
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });

  it("recovers PayPal using its order ID and returns the same approval link", async () => {
    mocks.retrieveIntent.mockResolvedValue({
      provider: "paypal", intentId: "PP-EXISTING", status: "CREATED", amountCents: 3499, currency: "EUR",
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PP-EXISTING",
    });
    const result = await ensureOrderPayment(pendingOrder({
      paymentProvider: "paypal", paypalOrderId: "PP-EXISTING", stripePaymentIntentId: "pi_unrelated",
    }));
    expect(mocks.getProvider).toHaveBeenCalledWith("paypal");
    expect(mocks.retrieveIntent).toHaveBeenCalledWith("PP-EXISTING");
    expect(result).toMatchObject({ ok: true, provider: "paypal", intentId: "PP-EXISTING", approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PP-EXISTING" });
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it("stores newly created PayPal handles in the PayPal column", async () => {
    mocks.createIntent.mockResolvedValue({ provider: "paypal", intentId: "PP-NEW", status: "CREATED", amountCents: 3499, currency: "EUR" });
    await ensureOrderPayment(pendingOrder({ paymentProvider: "paypal" }));
    expect(mocks.updateOrder).toHaveBeenCalledWith({ where: { id: "order-recovery-1" }, data: { paypalOrderId: "PP-NEW" } });
  });

  it("keeps the existing order recoverable after an ambiguous provider timeout", async () => {
    const order = pendingOrder();
    mocks.createIntent.mockRejectedValueOnce(new Error("provider response timed out"));
    const failed = await ensureOrderPayment(order);
    expect(failed).toMatchObject({ ok: true, orderNumber: order.number, totalCents: 3499, paymentUnavailable: true });
    expect(failed).not.toHaveProperty("clientSecret");
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(await ensureOrderPayment(order)).toMatchObject({ ok: true, intentId: "pi_recovery" });
    // Provider adapters derive stable PSP idempotency keys from this unchanged
    // order number; the adapters' own tests verify the actual request header.
    expect(mocks.createIntent.mock.calls[1][0]).toEqual(mocks.createIntent.mock.calls[0][0]);
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("recovers the same remote intent after its local association write fails", async () => {
    const order = pendingOrder();
    mocks.updateOrder.mockRejectedValueOnce(new Error("temporary database write failure"));
    const failed = await ensureOrderPayment(order);
    expect(failed).toMatchObject({ ok: true, orderNumber: order.number, paymentUnavailable: true });
    expect(failed).not.toHaveProperty("clientSecret");
    const retried = await ensureOrderPayment(order);
    expect(retried).toMatchObject({ ok: true, intentId: "pi_recovery", clientSecret: "pi_recovery_secret" });
    expect(mocks.createIntent.mock.calls[1][0]).toEqual(mocks.createIntent.mock.calls[0][0]);
    expect(mocks.updateOrder.mock.calls[1][0]).toEqual(mocks.updateOrder.mock.calls[0][0]);
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("does not replace an existing intent when retrieval temporarily fails", async () => {
    const order = pendingOrder({ stripePaymentIntentId: "pi_existing" });
    mocks.retrieveIntent.mockRejectedValueOnce(new Error("temporary provider outage"));
    expect(await ensureOrderPayment(order)).toMatchObject({ ok: true, paymentUnavailable: true });
    expect(await ensureOrderPayment(order)).toMatchObject({ ok: true, intentId: "pi_existing", clientSecret: "pi_existing_secret" });
    expect(mocks.retrieveIntent).toHaveBeenNthCalledWith(1, "pi_existing");
    expect(mocks.retrieveIntent).toHaveBeenNthCalledWith(2, "pi_existing");
    expect(mocks.createIntent).not.toHaveBeenCalled();
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });

  it.each(["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const)("never starts another payment for a %s order", async (status) => {
    const order = pendingOrder({ status });
    expect(await ensureOrderPayment(order)).toEqual({
      ok: true, orderNumber: order.number, provider: "stripe", totalCents: 3499, paymentStatus: status,
    });
    expect(mocks.getProvider).not.toHaveBeenCalled();
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.createIntent).not.toHaveBeenCalled();
    expect(mocks.retrieveIntent).not.toHaveBeenCalled();
  });

  it("fails explicitly when the stored provider is unavailable", async () => {
    mocks.getProvider.mockReturnValue(null);
    expect(await ensureOrderPayment(pendingOrder())).toEqual({ ok: false, error: "provider_unavailable" });
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it.each(["succeeded", "processing"])("awaits the Stripe webhook for a remotely %s intent instead of offering another payment", async (status) => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "stripe", intentId: "pi_existing", clientSecret: "do-not-expose", amountCents: 3499, currency: "EUR", status });
    const result = await ensureOrderPayment(pendingOrder({ stripePaymentIntentId: "pi_existing" }));
    expect(result).toMatchObject({ ok: true, paymentStatus: "AWAITING_WEBHOOK", providerState: status });
    expect(result).not.toHaveProperty("clientSecret");
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it("does not recreate a canceled Stripe payment intent", async () => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "stripe", intentId: "pi_existing", amountCents: 3499, currency: "EUR", status: "canceled" });
    expect(await ensureOrderPayment(pendingOrder({ stripePaymentIntentId: "pi_existing" })))
      .toMatchObject({ ok: true, paymentStatus: "PAYMENT_CANCELLED", providerState: "canceled" });
    expect(mocks.createIntent).not.toHaveBeenCalled();
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });

  it("captures an approved PayPal payment then waits for its webhook without marking the order paid", async () => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "paypal", intentId: "PP-EXISTING", amountCents: 3499, currency: "EUR", status: "APPROVED" });
    const result = await ensureOrderPayment(pendingOrder({ paymentProvider: "paypal", paypalOrderId: "PP-EXISTING" }));
    expect(mocks.capturePayPal).toHaveBeenCalledWith("PP-EXISTING");
    expect(result).toMatchObject({ ok: true, paymentStatus: "AWAITING_WEBHOOK", providerState: "APPROVED" });
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it("does not recapture a completed PayPal payment while waiting for its webhook", async () => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "paypal", intentId: "PP-EXISTING", amountCents: 3499, currency: "EUR", status: "COMPLETED" });
    expect(await ensureOrderPayment(pendingOrder({ paymentProvider: "paypal", paypalOrderId: "PP-EXISTING" })))
      .toMatchObject({ ok: true, paymentStatus: "AWAITING_WEBHOOK", providerState: "COMPLETED" });
    expect(mocks.capturePayPal).not.toHaveBeenCalled();
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });

  it("leaves a failed PayPal capture retryable against the same approved order", async () => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "paypal", intentId: "PP-EXISTING", amountCents: 3499, currency: "EUR", status: "APPROVED" });
    mocks.capturePayPal.mockRejectedValueOnce(new Error("capture response timed out"));
    const order = pendingOrder({ paymentProvider: "paypal", paypalOrderId: "PP-EXISTING" });
    expect(await ensureOrderPayment(order)).toMatchObject({ ok: true, paymentUnavailable: true });
    expect(await ensureOrderPayment(order)).toMatchObject({ ok: true, paymentStatus: "AWAITING_WEBHOOK" });
    expect(mocks.capturePayPal).toHaveBeenNthCalledWith(1, "PP-EXISTING");
    expect(mocks.capturePayPal).toHaveBeenNthCalledWith(2, "PP-EXISTING");
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it("shows a recoverable state when Stripe omits its payment form secret", async () => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "stripe", intentId: "pi_existing", status: "requires_payment_method", amountCents: 3499, currency: "EUR" });
    expect(await ensureOrderPayment(pendingOrder({ stripePaymentIntentId: "pi_existing" }))).toMatchObject({ ok: true, paymentUnavailable: true });
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it.each([
    { amountCents: 1, currency: "EUR" },
    { amountCents: 3499, currency: "USD" },
    { amountCents: undefined, currency: "EUR" },
  ])("does not expose a remotely changed payment amount/currency: %j", async (money) => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "stripe", intentId: "pi_existing", clientSecret: "do-not-expose", status: "requires_payment_method", ...money });
    const result = await ensureOrderPayment(pendingOrder({ stripePaymentIntentId: "pi_existing" }));
    expect(result).toMatchObject({ ok: true, paymentUnavailable: true });
    expect(result).not.toHaveProperty("clientSecret");
    expect(mocks.createIntent).not.toHaveBeenCalled();
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });
});

describe("order creation recovery boundaries", () => {
  it("rejects another customer's checkout-key retry before exposing payment credentials", async () => {
    mocks.findOrder.mockResolvedValue(pendingOrder({ userId: "customer-1" }));
    mocks.auth.mockResolvedValue({ user: { id: "customer-2" } });
    expect(await placeOrder(input)).toEqual({ ok: false, error: "order_access" });
    expect(mocks.getProvider).not.toHaveBeenCalled();
    expect(mocks.pricing).not.toHaveBeenCalled();
  });

  it("rejects a guest retry with the wrong email", async () => {
    mocks.findOrder.mockResolvedValue(pendingOrder());
    expect(await placeOrder({ ...input, email: "other@example.test" })).toEqual({ ok: false, error: "order_access" });
    expect(mocks.getProvider).not.toHaveBeenCalled();
  });

  it("resumes the original guest order snapshot rather than trusting retried client totals", async () => {
    mocks.findOrder.mockResolvedValue(pendingOrder({ stripePaymentIntentId: "pi_existing" }));
    const result = await placeOrder({ ...input, totalCents: 1, subtotalCents: 1, provider: "paypal" });
    expect(result).toMatchObject({ ok: true, orderNumber: "NS-2026-00042", provider: "stripe", totalCents: 3499, clientSecret: "pi_existing_secret" });
    expect(mocks.pricing).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("rejects a changed quote before any order or provider payment is created", async () => {
    mocks.pricing.mockResolvedValue({ quote: { token: "c".repeat(64) } });
    mocks.quoteMatches.mockReturnValue(false);
    expect(await placeOrder(input)).toEqual({ ok: false, error: "quote_changed" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.createIntent).not.toHaveBeenCalled();
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });
});
