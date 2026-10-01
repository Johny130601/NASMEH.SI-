import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getProvider: vi.fn(), retrieveIntent: vi.fn() }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: mocks.getProvider }));

import {
  lastPaymentAttemptFailed, paymentSubmittedPath, pendingOrderView, providerPaymentSettling,
} from "@/lib/orders/confirmation-view";
import { pendingOrderViewFromQuery, resolvePendingOrderView } from "@/lib/orders/confirmation-query";

/**
 * QA 2026-09-30: "Dokončaj plačilo" opened an unpaid order under "Čakamo na
 * potrditev plačila". A PENDING order now leads with the payment unless a
 * payment was just submitted (our own marker, or Stripe's successful return).
 */

describe("pendingOrderView", () => {
  it("leads with the payment on a plain visit — the pay-now links, a failed attempt, an untouched order", () => {
    expect(pendingOrderView({})).toBe("pay");
    expect(pendingOrderViewFromQuery({})).toBe("pay");
    expect(pendingOrderViewFromQuery(undefined)).toBe("pay");
  });

  it("waits for the webhook after our own navigation from a submitted payment", () => {
    expect(pendingOrderViewFromQuery({ placilo: "oddano" })).toBe("awaiting");
    expect(pendingOrderViewFromQuery({ placilo: ["oddano", "x"] })).toBe("awaiting");
    expect(pendingOrderViewFromQuery({ placilo: "kar-koli" })).toBe("pay");
  });

  it("reads Stripe's return: a settling payment waits, a failed one asks again", () => {
    expect(pendingOrderViewFromQuery({ redirect_status: "succeeded", payment_intent: "pi_1" })).toBe("awaiting");
    expect(pendingOrderViewFromQuery({ redirect_status: "processing" })).toBe("awaiting");
    expect(pendingOrderViewFromQuery({ redirect_status: "failed", placilo: "oddano" })).toBe("pay");
    expect(pendingOrderViewFromQuery({ redirect_status: "requires_payment_method" })).toBe("pay");
  });

  it("an explicit pay-now link wins over any other hint", () => {
    expect(pendingOrderViewFromQuery({ placaj: "1", placilo: "oddano" })).toBe("pay");
    expect(pendingOrderViewFromQuery({ placaj: "", redirect_status: "succeeded" })).toBe("pay");
  });

  it("reads a malformed hint as absent, which is the pay face", () => {
    expect(pendingOrderViewFromQuery({ placilo: "x".repeat(200) })).toBe("pay");
    expect(pendingOrderViewFromQuery({ placilo: 42 })).toBe("pay");
    expect(pendingOrderViewFromQuery("placilo=oddano")).toBe("pay");
  });
});

describe("paymentSubmittedPath", () => {
  it("is the confirmation page with the submitted marker, the number encoded", () => {
    expect(paymentSubmittedPath("NS-2026-00042")).toBe("/potrditev/NS-2026-00042?placilo=oddano");
    expect(paymentSubmittedPath("NS 1/2")).toBe("/potrditev/NS%201%2F2?placilo=oddano");
    expect(pendingOrderViewFromQuery(Object.fromEntries(new URL(paymentSubmittedPath("NS-1"), "https://x.test").searchParams))).toBe("awaiting");
  });
});

const created = { at: "2026-09-30T10:00:00.000Z", event: "created", detail: "provider:stripe" };
const failed = { at: "2026-09-30T10:01:00.000Z", event: "payment_failed", detail: "stripe" };

describe("lastPaymentAttemptFailed", () => {
  it("is true only when the latest payment event is a failed attempt", () => {
    expect(lastPaymentAttemptFailed([created])).toBe(false);
    expect(lastPaymentAttemptFailed([created, failed])).toBe(true);
    expect(lastPaymentAttemptFailed([created, failed, { at: "x", event: "paid" }])).toBe(false);
  });

  it("skips annotations that say nothing about the payment", () => {
    expect(lastPaymentAttemptFailed([created, failed, { at: "x", event: "anonymised" }])).toBe(true);
  });

  it("reads a missing or malformed timeline as no failure", () => {
    expect(lastPaymentAttemptFailed(null)).toBe(false);
    expect(lastPaymentAttemptFailed({ event: "payment_failed" })).toBe(false);
    expect(lastPaymentAttemptFailed([null, 3, "payment_failed", { event: 1 }])).toBe(false);
  });
});

describe("providerPaymentSettling", () => {
  it("is the set ensureOrderPayment answers with AWAITING_WEBHOOK", () => {
    expect(providerPaymentSettling("stripe", "succeeded")).toBe(true);
    expect(providerPaymentSettling("stripe", "processing")).toBe(true);
    expect(providerPaymentSettling("stripe", "requires_payment_method")).toBe(false);
    expect(providerPaymentSettling("paypal", "APPROVED")).toBe(true);
    expect(providerPaymentSettling("paypal", "COMPLETED")).toBe(true);
    expect(providerPaymentSettling("paypal", "PAYER_ACTION_REQUIRED")).toBe(false);
    expect(providerPaymentSettling("test", "succeeded")).toBe(false);
    expect(providerPaymentSettling("stripe", undefined)).toBe(false);
    expect(providerPaymentSettling("constructor", "succeeded")).toBe(false);
  });
});

/**
 * Review of QA 2026-09-30: the marker and Stripe return outlive the attempt in
 * the address bar, so a submitted payment that failed afterwards kept the
 * waiting face. The order is checked; the provider settles a failure recorded
 * before a retry that is still settling.
 */
describe("resolvePendingOrderView", () => {
  const order = (timeline: unknown[], overrides: Record<string, unknown> = {}) => ({
    timeline, paymentProvider: "stripe", stripePaymentIntentId: "pi_1", paypalOrderId: null, ...overrides,
  }) as unknown as Parameters<typeof resolvePendingOrderView>[0];

  beforeEach(() => {
    mocks.getProvider.mockReset().mockReturnValue({ retrieveIntent: mocks.retrieveIntent });
    mocks.retrieveIntent.mockReset();
  });

  it("keeps the hint without asking the provider when no attempt has failed", async () => {
    await expect(resolvePendingOrderView(order([created]), "awaiting")).resolves.toBe("awaiting");
    expect(mocks.retrieveIntent).not.toHaveBeenCalled();
  });

  it("never asks the provider for a visit that came to pay", async () => {
    await expect(resolvePendingOrderView(order([created, failed]), "pay")).resolves.toBe("pay");
    expect(mocks.getProvider).not.toHaveBeenCalled();
  });

  it("leads with the payment when the submitted attempt has failed since", async () => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "stripe", intentId: "pi_1", status: "requires_payment_method" });
    await expect(resolvePendingOrderView(order([created, failed]), "awaiting")).resolves.toBe("pay");
    expect(mocks.getProvider).toHaveBeenCalledWith("stripe");
    expect(mocks.retrieveIntent).toHaveBeenCalledWith("pi_1");
  });

  it("keeps waiting for a retry that is settling after an earlier declined attempt", async () => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "stripe", intentId: "pi_1", status: "succeeded" });
    await expect(resolvePendingOrderView(order([created, failed]), "awaiting")).resolves.toBe("awaiting");
    mocks.retrieveIntent.mockResolvedValue({ provider: "stripe", intentId: "pi_1", status: "processing" });
    await expect(resolvePendingOrderView(order([created, failed]), "awaiting")).resolves.toBe("awaiting");
  });

  it("asks PayPal by its order id", async () => {
    const paypal = order([created, failed], { paymentProvider: "paypal", stripePaymentIntentId: null, paypalOrderId: "PP-1" });
    mocks.retrieveIntent.mockResolvedValue({ provider: "paypal", intentId: "PP-1", status: "COMPLETED" });
    await expect(resolvePendingOrderView(paypal, "awaiting")).resolves.toBe("awaiting");
    expect(mocks.retrieveIntent).toHaveBeenCalledWith("PP-1");
    mocks.retrieveIntent.mockResolvedValue({ provider: "paypal", intentId: "PP-1", status: "CREATED" });
    await expect(resolvePendingOrderView(paypal, "awaiting")).resolves.toBe("pay");
  });

  it("the e2e test driver reports no settling state, so its failed attempt leads with the payment", async () => {
    mocks.retrieveIntent.mockResolvedValue({ provider: "test", intentId: "test_pi_1" });
    await expect(resolvePendingOrderView(order([created, failed], { paymentProvider: "test" }), "awaiting")).resolves.toBe("pay");
  });

  it("leaves the hint when the provider cannot answer — the waiting face polls and corrects itself", async () => {
    mocks.retrieveIntent.mockRejectedValue(new Error("network"));
    await expect(resolvePendingOrderView(order([created, failed]), "awaiting")).resolves.toBe("awaiting");
    mocks.getProvider.mockReturnValue(null);
    await expect(resolvePendingOrderView(order([created, failed]), "awaiting")).resolves.toBe("awaiting");
    await expect(resolvePendingOrderView(order([created, failed], { stripePaymentIntentId: null }), "awaiting")).resolves.toBe("awaiting");
    await expect(resolvePendingOrderView(order([created, failed], { paymentProvider: "unknown" }), "awaiting")).resolves.toBe("awaiting");
  });
});
