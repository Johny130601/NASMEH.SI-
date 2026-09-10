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

export interface RefundInput {
  intentId: string;
  amountCents: number;
  currency: string;
  /** Stable per Refund row: a retried call never moves the money twice. */
  idempotencyKey: string;
}

export interface PaymentProvider {
  name: PaymentIntentHandle["provider"];
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentHandle>;
  retrieveIntent(intentId: string): Promise<PaymentIntentHandle>;
  /** Operator refund (§14.7); resolves with the provider's refund id. */
  refund?(input: RefundInput): Promise<{ refundId: string }>;
  /** Cancels an uncaptured intent when an unpaid order is cancelled. */
  voidIntent?(intentId: string): Promise<void>;
}
