import { z } from "zod";
import { isTestMode } from "@/lib/turnstile";
import { paypalRequest } from "./paypal";
import { verifyWebhookSignature } from "./webhook-verify";

/** Official postback verification preserves the original event JSON bytes. */
export async function verifyPayPalWebhook(body: string, headers: Headers): Promise<boolean> {
  if (isTestMode() && headers.has("x-webhook-signature") && !headers.has("paypal-transmission-id")) {
    return verifyWebhookSignature(body, headers.get("x-webhook-signature"), process.env.PAYPAL_WEBHOOK_SECRET ?? "");
  }
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const fields = {
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_time: headers.get("paypal-transmission-time"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    cert_url: headers.get("paypal-cert-url"),
    auth_algo: headers.get("paypal-auth-algo"),
    webhook_id: webhookId,
  };
  if (Object.values(fields).some(value => !value || value.length > 4096)) return false;
  const certificate = z.url().safeParse(fields.cert_url);
  if (!certificate.success) return false;
  const url = new URL(certificate.data);
  if (url.protocol !== "https:" || !["api.paypal.com", "api.sandbox.paypal.com", "api-m.paypal.com", "api-m.sandbox.paypal.com"].includes(url.hostname)) return false;
  const response = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST", body: `${JSON.stringify(fields).slice(0, -1)},"webhook_event":${body}}`,
  });
  return z.object({ verification_status: z.string() }).parse(response).verification_status === "SUCCESS";
}
