/** Payment provider abstraction (D5: real sandboxes pending). */
export interface PaymentIntentInput {
  orderNumber: string;
  totalCents: number;
  email: string;
  returnUrl: string;
}

export interface PaymentIntentHandle {
  provider: "stripe" | "paypal" | "test";
  intentId: string;
  clientSecret?: string;
  approvalUrl?: string;
  status?: string;
  amountCents?: number;
  currency?: string;
}

export interface PaymentProvider {
  name: PaymentIntentHandle["provider"];
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentHandle>;
  retrieveIntent(intentId: string): Promise<PaymentIntentHandle>;
}
