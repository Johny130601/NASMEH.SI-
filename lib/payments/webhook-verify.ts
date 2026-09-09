import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Webhook signature verification (AGENTS §5.5): stripe-compatible scheme
 * `t={ts},v1=HMAC_SHA256(secret, "{ts}.{body}")`, timing-safe, with a
 * tolerance window. Verified BEFORE parsing.
 * PayPal uses the same shared-secret scheme for now — swap to PayPal's
 * verify-webhook-signature API when D5 credentials land (documented).
 */

export const SIGNATURE_TOLERANCE_S = 300;

export function signWebhookPayload(
  body: string,
  secret: string,
  timestampS = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestampS}.${body}`)
    .digest("hex");
  return `t=${timestampS},v1=${signature}`;
}

export function verifyWebhookSignature(
  body: string,
  signatureHeader: string | null,
  secret: string,
  nowS = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader || !secret) return false;

  const parts = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key, rest.join("=")] as const;
    }),
  );
  const ts = parts.get("t");
  const v1 = parts.get("v1");
  if (!ts || !v1 || !/^\d+$/.test(ts)) return false;

  if (Math.abs(nowS - Number(ts)) > SIGNATURE_TOLERANCE_S) return false;

  const expected = createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");
  if (expected.length !== v1.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

/** e2e/test helper: build a signed event envelope like a PSP would send. */
export function buildSignedTestEvent(
  event: { id: string; type: string; data: { object: Record<string, unknown> } },
  secret: string,
): { body: string; signature: string } {
  const body = JSON.stringify(event);
  return { body, signature: signWebhookPayload(body, secret) };
}

export function testEventId(): string {
  return `evt_${randomBytes(12).toString("hex")}`;
}
