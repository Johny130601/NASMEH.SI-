import Stripe from "stripe";
import type { PaymentIntentInput, PaymentIntentHandle, PaymentProvider } from "./types";

/**
 * Stripe implementation (§8.3): PaymentIntent for the Payment Element —
 * cards with SCA/3DS2, Apple/Google Pay via payment request;
 * Klarna behind STRIPE_KLARNA_ENABLED (SI coverage unconfirmed — D5).
 */
export function createStripeProvider(): PaymentProvider | null {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;

  const stripe = new Stripe(secret);
  const klarnaEnabled = process.env.STRIPE_KLARNA_ENABLED === "true";

  return {
    name: "stripe",
    async createIntent(input: PaymentIntentInput): Promise<PaymentIntentHandle> {
      const intent = await stripe.paymentIntents.create({
        amount: input.totalCents,
        currency: "eur",
        receipt_email: input.email,
        metadata: { orderNumber: input.orderNumber },
        payment_method_types: klarnaEnabled ? ["card", "klarna"] : ["card"],
      }, { idempotencyKey: `nasmeh-payment-${input.orderNumber}` });
      return {
        provider: "stripe",
        intentId: intent.id,
        clientSecret: intent.client_secret ?? undefined,
        status: intent.status,
        amountCents: intent.amount, currency: intent.currency,
      };
    },
    async retrieveIntent(intentId: string): Promise<PaymentIntentHandle> {
      const intent = await stripe.paymentIntents.retrieve(intentId);
      return { provider: "stripe", intentId: intent.id, clientSecret: intent.client_secret ?? undefined, status: intent.status, amountCents: intent.amount, currency: intent.currency };
    },
  };
}
