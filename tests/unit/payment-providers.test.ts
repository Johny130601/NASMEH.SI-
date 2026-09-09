import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStripeProvider } from "@/lib/payments/stripe";
import { capturePayPalOrder, createPayPalProvider, paypalApiOrigin, paypalRequest } from "@/lib/payments/paypal";
import { verifyPayPalWebhook } from "@/lib/payments/paypal-verify";
import { signWebhookPayload } from "@/lib/payments/webhook-verify";

const stripe = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn() }));
const transitions = vi.hoisted(() => ({ markOrderPaid: vi.fn(), markPaymentFailed: vi.fn(), markRefunded: vi.fn() }));
vi.mock("stripe", () => ({ default: class { paymentIntents = stripe; } }));
vi.mock("@/lib/orders/transitions", () => transitions);
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get() { throw new Error("A payment adapter must not mutate local order state"); } }),
}));

const input = {
  orderNumber: "NS-2026-00042", totalCents: 3499, email: "provider@example.test",
  returnUrl: "https://nasmeh.example/potrditev/NS-2026-00042",
};
const fetchMock = vi.fn<typeof fetch>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function queueRequest(data: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(json({ access_token: "sandbox-access-token" }));
  fetchMock.mockResolvedValueOnce(json(data, status));
}

function apiCall(index: number) {
  const [url, init] = fetchMock.mock.calls[index];
  return { url: String(url), init: init!, headers: new Headers(init?.headers) };
}

function webhookHeaders(overrides: Record<string, string> = {}) {
  return new Headers({
    "paypal-transmission-id": "transmission-42",
    "paypal-transmission-time": "2026-09-09T12:00:00Z",
    "paypal-transmission-sig": "real-provider-signature",
    "paypal-cert-url": "https://api.paypal.com/v1/notifications/certs/CERT-42",
    "paypal-auth-algo": "SHA256withRSA",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  stripe.create.mockReset();
  stripe.retrieve.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit_only");
  vi.stubEnv("STRIPE_KLARNA_ENABLED", "false");
  vi.stubEnv("PAYPAL_CLIENT_ID", "paypal-unit-client");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "paypal-unit-secret");
  vi.stubEnv("PAYPAL_ENVIRONMENT", "sandbox");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "webhook-unit-id");
  vi.stubEnv("PAYPAL_WEBHOOK_SECRET", "whsec_synthetic_unit_only");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NASMEH_E2E", undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Stripe payment adapter", () => {
  it("returns unavailable without credentials", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", undefined);
    expect(createStripeProvider()).toBeNull();
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it("uses one stable order idempotency key and mutually exclusive payment-method configuration", async () => {
    stripe.create.mockResolvedValue({ id: "pi_42", client_secret: "pi_42_secret", status: "requires_payment_method", amount: 3499, currency: "eur" });
    const provider = createStripeProvider()!;
    const first = await provider.createIntent(input);
    await provider.createIntent(input);
    expect(first).toEqual({ provider: "stripe", intentId: "pi_42", clientSecret: "pi_42_secret", status: "requires_payment_method", amountCents: 3499, currency: "eur" });
    const [params, request] = stripe.create.mock.calls[0];
    expect(params).toMatchObject({ amount: 3499, currency: "eur", receipt_email: input.email, metadata: { orderNumber: input.orderNumber }, payment_method_types: ["card"] });
    expect(params).not.toHaveProperty("automatic_payment_methods");
    expect(request.idempotencyKey).toBeTruthy();
    expect(stripe.create.mock.calls[1][1].idempotencyKey).toBe(request.idempotencyKey);
    await provider.createIntent({ ...input, orderNumber: "NS-2026-00043" });
    expect(stripe.create.mock.calls[2][1].idempotencyKey).not.toBe(request.idempotencyKey);
  });

  it("enables Klarna only when configured", async () => {
    vi.stubEnv("STRIPE_KLARNA_ENABLED", "true");
    stripe.create.mockResolvedValue({ id: "pi_klarna", client_secret: null, status: "requires_payment_method", amount: 3499, currency: "eur" });
    const result = await createStripeProvider()!.createIntent(input);
    expect(stripe.create.mock.calls[0][0].payment_method_types).toEqual(["card", "klarna"]);
    expect(stripe.create.mock.calls[0][0]).not.toHaveProperty("automatic_payment_methods");
    expect(result.clientSecret).toBeUndefined();
  });

  it("recovers an existing payment handle without creating another intent", async () => {
    stripe.retrieve.mockResolvedValue({ id: "pi_existing", client_secret: "existing_secret", status: "requires_action", amount: 2389, currency: "eur" });
    await expect(createStripeProvider()!.retrieveIntent("pi_existing")).resolves.toEqual({
      provider: "stripe", intentId: "pi_existing", clientSecret: "existing_secret", status: "requires_action", amountCents: 2389, currency: "eur",
    });
    expect(stripe.retrieve).toHaveBeenCalledWith("pi_existing");
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it("propagates provider failures for the order retry path", async () => {
    stripe.create.mockRejectedValue(new Error("Stripe unavailable"));
    stripe.retrieve.mockRejectedValue(new Error("Stripe timeout"));
    await expect(createStripeProvider()!.createIntent(input)).rejects.toThrow("Stripe unavailable");
    await expect(createStripeProvider()!.retrieveIntent("pi_42")).rejects.toThrow("Stripe timeout");
  });
});

describe("PayPal payment adapter", () => {
  it("requires both credentials and defaults to sandbox; live switches the API origin", async () => {
    vi.stubEnv("PAYPAL_CLIENT_SECRET", undefined);
    expect(createPayPalProvider()).toBeNull();
    await expect(paypalRequest("/test")).rejects.toThrow("not configured");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "paypal-unit-secret");
    vi.stubEnv("PAYPAL_ENVIRONMENT", undefined);
    expect(paypalApiOrigin()).toBe("https://api-m.sandbox.paypal.com");
    vi.stubEnv("PAYPAL_ENVIRONMENT", "live");
    queueRequest({ id: "PP-LIVE", status: "CREATED", purchase_units: [{ amount: { value: "34.99", currency_code: "EUR" } }] });
    await createPayPalProvider()!.createIntent(input);
    expect(apiCall(0).url).toBe("https://api-m.paypal.com/v1/oauth2/token");
    expect(apiCall(1).url).toBe("https://api-m.paypal.com/v2/checkout/orders");
  });

  it("creates a EUR order with stable request keys and recovery links", async () => {
    const response = { id: "PP-42", status: "CREATED", purchase_units: [{ amount: { value: "34.99", currency_code: "EUR" } }], links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=PP-42" }] };
    queueRequest(response); queueRequest(response); queueRequest(response);
    const provider = createPayPalProvider()!;
    const handle = await provider.createIntent(input);
    await provider.createIntent(input);
    await provider.createIntent({ ...input, orderNumber: "NS-2026-00043" });
    expect(handle).toEqual({ provider: "paypal", intentId: "PP-42", status: "CREATED", approvalUrl: response.links[0].href, amountCents: 3499, currency: "EUR" });
    const first = apiCall(1);
    expect(first.headers.get("paypal-request-id")).toBeTruthy();
    expect(first.headers.get("paypal-request-id")).toBe(apiCall(3).headers.get("paypal-request-id"));
    expect(first.headers.get("paypal-request-id")).not.toBe(apiCall(5).headers.get("paypal-request-id"));
    expect(first.headers.get("authorization")).toBe("Bearer sandbox-access-token");
    expect(first.headers.get("prefer")).toBe("return=representation");
    expect(JSON.parse(String(first.init.body))).toMatchObject({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: input.orderNumber, custom_id: input.orderNumber, amount: { currency_code: "EUR", value: "34.99" } }],
      payment_source: { paypal: { experience_context: { user_action: "PAY_NOW", return_url: input.returnUrl, cancel_url: input.returnUrl } } },
    });
    expect(apiCall(0).headers.get("authorization")).toBe(`Basic ${Buffer.from("paypal-unit-client:paypal-unit-secret").toString("base64")}`);
  });

  it("retrieves the existing order and accepts a provider payer-action recovery URL", async () => {
    queueRequest({ id: "PP-42", status: "PAYER_ACTION_REQUIRED", purchase_units: [{ amount: { value: "23.89", currency_code: "EUR" } }], links: [{ rel: "payer-action", href: "https://www.paypal.com/checkoutnow?token=PP-42" }] });
    await expect(createPayPalProvider()!.retrieveIntent("PP-42")).resolves.toMatchObject({ provider: "paypal", intentId: "PP-42", status: "PAYER_ACTION_REQUIRED", approvalUrl: "https://www.paypal.com/checkoutnow?token=PP-42", amountCents: 2389, currency: "EUR" });
    expect(apiCall(1).url.endsWith("/v2/checkout/orders/PP-42")).toBe(true);
    expect(apiCall(1).init.method).not.toBe("POST");
  });

  it("exposes provider amounts and currencies unchanged so recovery can reject mismatches", async () => {
    stripe.retrieve.mockResolvedValue({ id: "pi_wrong", status: "requires_action", amount: 1, currency: "usd" });
    await expect(createStripeProvider()!.retrieveIntent("pi_wrong")).resolves.toMatchObject({ amountCents: 1, currency: "usd" });
    queueRequest({ id: "PP-WRONG", status: "CREATED", purchase_units: [{ amount: { value: "0.01", currency_code: "USD" } }] });
    await expect(createPayPalProvider()!.retrieveIntent("PP-WRONG")).resolves.toMatchObject({ amountCents: 1, currency: "USD" });
  });

  it("does not invent a PayPal amount when the response omits or splits purchase units", async () => {
    for (const purchase_units of [undefined, [], [
      { amount: { value: "10.00", currency_code: "EUR" } },
      { amount: { value: "24.99", currency_code: "EUR" } },
    ]]) {
      queueRequest({ id: "PP-42", status: "CREATED", purchase_units });
      const handle = await createPayPalProvider()!.retrieveIntent("PP-42");
      expect(handle.amountCents).toBeUndefined();
      expect(handle.currency).toBeUndefined();
    }
  });

  it.each(["34.9", "34,99", "-0.01", "1e2", "NaN"])("rejects malformed PayPal money %s", async value => {
    queueRequest({ id: "PP-42", status: "CREATED", purchase_units: [{ amount: { value, currency_code: "EUR" } }] });
    await expect(createPayPalProvider()!.retrieveIntent("PP-42")).rejects.toThrow();
  });

  it.each(["https://evil.example/checkout", "http://www.paypal.com/checkout", "https://www.paypal.com.evil.example/checkout"])("rejects unsafe approval URL %s", async (href) => {
    queueRequest({ id: "PP-42", status: "CREATED", links: [{ rel: "approve", href }] });
    await expect(createPayPalProvider()!.createIntent(input)).rejects.toThrow("Invalid PayPal approval URL");
  });

  it("captures APPROVED orders idempotently without marking local state paid", async () => {
    for (let index = 0; index < 2; index++) {
      queueRequest({ id: "PP-42", status: "APPROVED" });
      queueRequest({ id: "PP-42", status: "COMPLETED" });
    }
    await capturePayPalOrder("PP-42");
    await capturePayPalOrder("PP-42");
    expect(apiCall(3).url.endsWith("/v2/checkout/orders/PP-42/capture")).toBe(true);
    expect(apiCall(3).init.method).toBe("POST");
    expect(apiCall(3).headers.get("paypal-request-id")).toBe(apiCall(7).headers.get("paypal-request-id"));
    expect(transitions.markOrderPaid).not.toHaveBeenCalled();
    expect(transitions.markPaymentFailed).not.toHaveBeenCalled();
    expect(transitions.markRefunded).not.toHaveBeenCalled();
  });

  it.each(["CREATED", "PAYER_ACTION_REQUIRED", "VOIDED"])("does not capture %s orders", async (status) => {
    queueRequest({ id: "PP-42", status });
    await expect(capturePayPalOrder("PP-42")).rejects.toThrow("not approved");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not recapture COMPLETED orders or accept malformed IDs", async () => {
    queueRequest({ id: "PP-42", status: "COMPLETED" });
    await expect(capturePayPalOrder("PP-42")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(capturePayPalOrder("../orders/other")).rejects.toThrow("Invalid PayPal order ID");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires capture completion rather than treating an HTTP success as payment success", async () => {
    queueRequest({ id: "PP-42", status: "APPROVED" });
    queueRequest({ id: "PP-42", status: "PENDING" });
    await expect(capturePayPalOrder("PP-42")).rejects.toThrow("capture not completed");
  });

  it("bounds token/API requests and propagates timeout and HTTP failures", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    queueRequest({ id: "PP-42", status: "CREATED" });
    await createPayPalProvider()!.createIntent(input);
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(apiCall(0).init.signal).toBeInstanceOf(AbortSignal);
    expect(apiCall(1).init.signal).toBeInstanceOf(AbortSignal);
    expect(apiCall(0).init.cache).toBe("no-store");
    expect(apiCall(1).init.cache).toBe("no-store");
    fetchMock.mockRejectedValueOnce(new DOMException("Request timed out", "TimeoutError"));
    await expect(paypalRequest("/test")).rejects.toMatchObject({ name: "TimeoutError" });
    fetchMock.mockResolvedValueOnce(json({}, 401));
    await expect(paypalRequest("/test")).rejects.toThrow("authentication failed (401)");
    queueRequest({}, 503);
    await expect(paypalRequest("/test")).rejects.toThrow("request failed (503)");
  });

  it("rejects invalid token and order responses", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: "" }));
    await expect(paypalRequest("/test")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    queueRequest({ id: "PP-42" });
    await expect(createPayPalProvider()!.retrieveIntent("PP-42")).rejects.toThrow();
  });
});

describe("PayPal webhook postback verification", () => {
  const body = '{ "id": "EV-42", "amount":1.00, "label":"\\u010d", "large":12345678901234567890 }';

  it("rejects synthetic HMAC in production without calling the provider", async () => {
    const signature = signWebhookPayload(body, "whsec_synthetic_unit_only");
    await expect(verifyPayPalWebhook(body, new Headers({ "x-webhook-signature": signature }))).resolves.toBe(false);
    await expect(verifyPayPalWebhook(body, new Headers({ "paypal-transmission-sig": signature }))).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the synthetic driver limited to test mode and detects tampering", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const headers = new Headers({ "x-webhook-signature": signWebhookPayload(body, "whsec_synthetic_unit_only") });
    await expect(verifyPayPalWebhook(body, headers)).resolves.toBe(true);
    await expect(verifyPayPalWebhook(body + " ", headers)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves raw event JSON while submitting all official signature fields", async () => {
    queueRequest({ verification_status: "SUCCESS" });
    await expect(verifyPayPalWebhook(body, webhookHeaders())).resolves.toBe(true);
    const call = apiCall(1);
    expect(call.url.endsWith("/v1/notifications/verify-webhook-signature")).toBe(true);
    expect(call.init.method).toBe("POST");
    expect(String(call.init.body).endsWith(`,"webhook_event":${body}}`)).toBe(true);
    expect(JSON.parse(String(call.init.body))).toMatchObject({
      transmission_id: "transmission-42", transmission_time: "2026-09-09T12:00:00Z",
      transmission_sig: "real-provider-signature", auth_algo: "SHA256withRSA", webhook_id: "webhook-unit-id",
    });
  });

  it("does not bypass real verification when test traffic contains transmission headers", async () => {
    vi.stubEnv("NODE_ENV", "test");
    queueRequest({ verification_status: "FAILURE" });
    const headers = webhookHeaders({ "x-webhook-signature": signWebhookPayload(body, "whsec_synthetic_unit_only") });
    await expect(verifyPayPalWebhook(body, headers)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["http://api.paypal.com/cert", "https://evil.example/cert", "https://api.paypal.com.evil.example/cert", "not-a-url"])("rejects certificate URL %s before any network call", async (cert) => {
    await expect(verifyPayPalWebhook(body, webhookHeaders({ "paypal-cert-url": cert }))).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed on absent configuration, missing fields and oversized headers", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", undefined);
    await expect(verifyPayPalWebhook(body, webhookHeaders())).resolves.toBe(false);
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "webhook-unit-id");
    const missing = webhookHeaders(); missing.delete("paypal-transmission-id");
    await expect(verifyPayPalWebhook(body, missing)).resolves.toBe(false);
    await expect(verifyPayPalWebhook(body, webhookHeaders({ "paypal-transmission-sig": "x".repeat(4097) }))).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts only SUCCESS and propagates provider failure for a webhook retry", async () => {
    queueRequest({ verification_status: "FAILURE" });
    await expect(verifyPayPalWebhook(body, webhookHeaders())).resolves.toBe(false);
    queueRequest({ verification_status: "PENDING" });
    await expect(verifyPayPalWebhook(body, webhookHeaders())).resolves.toBe(false);
    queueRequest({}, 503);
    await expect(verifyPayPalWebhook(body, webhookHeaders())).rejects.toThrow("request failed (503)");
  });
});
