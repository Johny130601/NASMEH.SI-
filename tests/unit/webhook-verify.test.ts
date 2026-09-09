import { describe, expect, it } from "vitest";
import {
  buildSignedTestEvent,
  signWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/payments/webhook-verify";

const SECRET = "whsec_test_secret_32_chars_xxxxx";
const NOW = Math.floor(Date.now() / 1000);

describe("webhook signature verify (HMAC, timing-safe)", () => {
  it("accepts a valid signature", () => {
    const body = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" });
    const signature = signWebhookPayload(body, SECRET, NOW);
    expect(verifyWebhookSignature(body, signature, SECRET, NOW)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const signature = signWebhookPayload(body, SECRET, NOW);
    expect(
      verifyWebhookSignature(JSON.stringify({ id: "evt_2" }), signature, SECRET, NOW),
    ).toBe(false);
  });

  it("rejects wrong secret / missing header / garbage", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const signature = signWebhookPayload(body, SECRET, NOW);
    expect(verifyWebhookSignature(body, signature, "other-secret", NOW)).toBe(false);
    expect(verifyWebhookSignature(body, null, SECRET, NOW)).toBe(false);
    expect(verifyWebhookSignature(body, "t=abc,v1=zz", SECRET, NOW)).toBe(false);
    expect(verifyWebhookSignature(body, "", SECRET, NOW)).toBe(false);
  });

  it("rejects signatures outside the tolerance window", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const old = NOW - 3600;
    const signature = signWebhookPayload(body, SECRET, old);
    expect(verifyWebhookSignature(body, signature, SECRET, NOW)).toBe(false);
  });

  it("buildSignedTestEvent produces a verifiable envelope", () => {
    const { body, signature } = buildSignedTestEvent(
      { id: "evt_9", type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } },
      SECRET,
    );
    expect(verifyWebhookSignature(body, signature, SECRET, NOW)).toBe(true);
  });
});
