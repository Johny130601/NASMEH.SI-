import { createHash } from "node:crypto";
import { z } from "zod";
import type { PaymentIntentInput, PaymentIntentHandle, PaymentProvider } from "./types";

const tokenSchema = z.object({ access_token: z.string().min(1) });
const orderSchema = z.object({
  id: z.string().min(1), status: z.string(),
  links: z.array(z.object({ rel: z.string(), href: z.url() })).default([]),
  purchase_units: z.array(z.object({ amount: z.object({ value: z.string().regex(/^\d+\.\d{2}$/), currency_code: z.string() }) })).optional(),
});

export function paypalApiOrigin(): string {
  return process.env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export async function paypalRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal not configured");
  const tokenResponse = await fetch(`${paypalApiOrigin()}/v1/oauth2/token`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}` },
    body: "grant_type=client_credentials",
  });
  if (!tokenResponse.ok) throw new Error(`PayPal authentication failed (${tokenResponse.status})`);
  const token = tokenSchema.parse(await tokenResponse.json());
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${token.access_token}`);
  const response = await fetch(`${paypalApiOrigin()}${path}`, {
    ...options, headers, cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`PayPal request failed (${response.status})`);
  return response.json();
}

function handleOrder(data: unknown): PaymentIntentHandle {
  const order = orderSchema.parse(data);
  const approvalUrl = order.links.find(link => link.rel === "approve" || link.rel === "payer-action")?.href;
  if (approvalUrl) {
    const url = new URL(approvalUrl);
    if (url.protocol !== "https:" || !["www.paypal.com", "www.sandbox.paypal.com"].includes(url.hostname)) {
      throw new Error("Invalid PayPal approval URL");
    }
  }
  const units = order.purchase_units;
  return { provider: "paypal", intentId: order.id, approvalUrl, status: order.status,
    ...(units?.length === 1 ? { amountCents: Number(units[0].amount.value.replace(".", "")), currency: units[0].amount.currency_code } : {}) };
}

/** Capture requests never transition local state; verified webhooks do. */
export async function capturePayPalOrder(intentId: string): Promise<void> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(intentId)) throw new Error("Invalid PayPal order ID");
  const existing = orderSchema.parse(await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(intentId)}`));
  if (existing.status === "COMPLETED") return;
  if (existing.status !== "APPROVED") throw new Error("PayPal order is not approved");
  const data = orderSchema.parse(await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(intentId)}/capture`, {
    method: "POST", body: "{}",
    headers: { "PayPal-Request-Id": createHash("sha256").update(`capture:${intentId}`).digest("hex").slice(0, 32) },
  }));
  if (data.status !== "COMPLETED") throw new Error("PayPal capture not completed");
}

export function createPayPalProvider(): PaymentProvider | null {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return null;
  return {
    name: "paypal",
    async createIntent(input: PaymentIntentInput): Promise<PaymentIntentHandle> {
      return handleOrder(await paypalRequest("/v2/checkout/orders", {
        method: "POST",
        headers: { "PayPal-Request-Id": createHash("sha256").update(`create:${input.orderNumber}`).digest("hex").slice(0, 32), Prefer: "return=representation" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ reference_id: input.orderNumber, custom_id: input.orderNumber, amount: { currency_code: "EUR", value: (input.totalCents / 100).toFixed(2) } }],
          payment_source: { paypal: { experience_context: { user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: input.returnUrl, cancel_url: input.returnUrl } } },
        }),
      }));
    },
    async retrieveIntent(intentId) {
      return handleOrder(await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(intentId)}`));
    },
  };
}
