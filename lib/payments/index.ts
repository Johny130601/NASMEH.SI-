import { isTestMode } from "@/lib/turnstile";
import type { PaymentIntentInput, PaymentIntentHandle, PaymentProvider } from "./types";
import { createStripeProvider } from "./stripe";
import { createPayPalProvider } from "./paypal";

/**
 * Test driver (e2e only — NODE_ENV=test or NASMEH_E2E): simulates the PSP
 * without external calls. Outcomes are driven through the REAL webhook
 * route with REAL HMAC signatures, so the whole state machine is exercised.
 */
export function createTestProvider(): PaymentProvider | null {
  if (!isTestMode()) return null;
  return {
    name: "test",
    async createIntent(input: PaymentIntentInput): Promise<PaymentIntentHandle> {
      return {
        provider: "test",
        intentId: `test_pi_${input.orderNumber}`,
        clientSecret: `test_secret_${input.orderNumber}`,
      };
    },
    async retrieveIntent(intentId: string): Promise<PaymentIntentHandle> {
      return { provider: "test", intentId, clientSecret: `test_secret_${intentId}` };
    },
    // Operator refunds and voids succeed locally; the state machine is exercised for real.
    async refund(input) {
      return { refundId: `test_refund_${input.idempotencyKey}` };
    },
    async voidIntent() {},
  };
}

export function getPaymentProvider(
  name: "stripe" | "paypal" | "test",
): PaymentProvider | null {
  switch (name) {
    case "stripe":
      return createStripeProvider();
    case "paypal":
      return createPayPalProvider();
    case "test":
      return createTestProvider();
  }
}

/** Providers available in this environment (drives the Plačilo step UI). */
export function listAvailableProviders(): Array<"stripe" | "paypal" | "test"> {
  return (["stripe", "paypal", "test"] as const).filter(
    (name) => getPaymentProvider(name) !== null,
  );
}
