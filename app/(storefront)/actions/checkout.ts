"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { clientAddress } from "@/lib/client-address";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile, isTestMode } from "@/lib/turnstile";
import { placeOrder, type PlaceOrderResult } from "@/lib/orders/create";
import { getCartLines } from "@/lib/cart/server";
import { signWebhookPayload, testEventId } from "@/lib/payments/webhook-verify";
import { captureOrderCart, grantOrderAccess, hasOrderAccess } from "@/lib/orders/access";
import { clearPurchasedCart, createPurchaserAccount } from "@/lib/orders/post-purchase";

/** Kontakt step (§8.4): account detection hint — "imate račun? prijavite se".
 *  NOTE: spec-mandated feature, but an enumeration oracle by nature — guarded
 *  by a fixed-window per-IP rate limit (lib/rate-limit.ts, single-container
 *  in-memory). Turnstile-elevated protection lands with D5 / pre-launch
 *  hardening (Phase 9). Response shape is uniform regardless of outcome. */
export async function checkEmailExistsAction(input: {
  email: string;
}): Promise<{ exists: boolean }> {
  const ip = clientAddress(await headers());
  const { allowed } = checkRateLimit(`email-check:${ip}`, 10, 60_000);
  if (!allowed) return { exists: false };

  const parsed = z.email().safeParse(input.email?.trim().toLowerCase());
  if (!parsed.success) return { exists: false };
  const user = await db.user.findUnique({
    where: { email: parsed.data },
    select: { id: true },
  });
  return { exists: user !== null };
}

/** Abandoned-checkout capture (§8.4): email + cart snapshot + recovery token. */
export async function captureCheckoutEmailAction(input: {
  email: string;
  checkoutKey: string;
}): Promise<{ ok: boolean }> {
  const email = z.email().safeParse(input.email?.trim().toLowerCase());
  const key = z.string().trim().min(8).max(64).safeParse(input.checkoutKey);
  if (!email.success || !key.success) return { ok: false };

  try {
    const session = await auth();
    const lines = await getCartLines(session?.user?.id ?? null);
    await db.abandonedCheckout.upsert({
      where: { recoveryToken: key.data },
      update: { email: email.data, cartSnapshot: lines },
      create: {
        email: email.data,
        cartSnapshot: lines,
        recoveryToken: key.data,
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("[captureCheckoutEmailAction] failed:", error instanceof Error ? error.name : "unknown");
    return { ok: false };
  }
}

/** Pregled submit: Turnstile + idempotent order creation. */
export async function placeOrderAction(
  input: unknown,
): Promise<PlaceOrderResult> {
  const token =
    typeof input === "object" && input !== null && "turnstileToken" in input
      ? String((input as { turnstileToken?: unknown }).turnstileToken ?? "")
      : "";
  const human = await verifyTurnstile(token);
  if (!human) return { ok: false, error: "bot_check" };
  const { checkoutFormSchema } = await import("@/lib/orders/checkout-schema");
  const parsed = checkoutFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_form" };
  const expectedCart = await captureOrderCart();
  const result = await placeOrder(parsed.data);
  if (result.ok) {
    if (!await grantOrderAccess(result.orderNumber, parsed.data.checkoutKey, { allowCartClear: result.created === true, expectedCart })) return { ok: false, error: "order_access" };
  }
  return result;
}

export type TestPayOutcome = "success" | "sca_fail" | "failure";

/**
 * TEST DRIVER (e2e only): simulates the PSP by POSTing a properly signed
 * event to the REAL webhook route — the full verify→transition path runs.
 */
export async function testDriverPayAction(input: {
  orderNumber: string;
  outcome: TestPayOutcome;
}): Promise<{ ok: boolean; status?: string; error?: string }> {
  if (!isTestMode()) return { ok: false, error: "unavailable" };
  const parsed = z.object({
    orderNumber: z.string().min(1).max(80),
    outcome: z.enum(["success", "sca_fail", "failure"]),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const order = await db.order.findUnique({
    where: { number: parsed.data.orderNumber },
  });
  if (!order || order.status !== "PENDING" || order.paymentProvider !== "test") {
    return { ok: false, error: "order_state" };
  }
  if (!(await hasOrderAccess(order, await auth()))) return { ok: false, error: "order_access" };

  const provider = order.paypalOrderId ? "paypal" : "stripe";
  const intentId =
    order.stripePaymentIntentId ??
    order.paypalOrderId ??
    `test_pi_${order.number}`;
  const succeeded = input.outcome === "success";
  const type =
    provider === "paypal"
      ? succeeded
        ? "PAYMENT.CAPTURE.COMPLETED"
        : "PAYMENT.CAPTURE.DENIED"
      : succeeded
        ? "payment_intent.succeeded"
        : "payment_intent.payment_failed";

  const eventId = testEventId();
  const body =
    provider === "paypal"
      ? JSON.stringify({ id: eventId, event_type: type, resource: { id: intentId } })
      : JSON.stringify({ id: eventId, type, data: { object: { id: intentId } } });
  const secret =
    provider === "paypal"
      ? (process.env.PAYPAL_WEBHOOK_SECRET ?? "")
      : (process.env.STRIPE_WEBHOOK_SECRET ?? "");

  const host = (await headers()).get("host") ?? "127.0.0.1:3000";
  const response = await fetch(`http://${host}/api/webhooks/${provider}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [provider === "paypal" ? "x-webhook-signature" : "stripe-signature"]:
        signWebhookPayload(body, secret),
    },
    body,
  });

  if (!response.ok) return { ok: false, error: "webhook_failed" };
  const data = (await response.json()) as {
    result?: { outcome?: string; orderNumber?: string };
  };
  const outcome = data.result?.outcome;
  if (outcome === "paid") return { ok: true, status: "paid" };
  if (outcome === "stockout") return { ok: false, status: "stockout" };
  return { ok: false, status: "failed" };
}

/** Post-purchase account creation (§8.1): password → CUSTOMER user, order linked. */
export async function createAccountAfterPurchaseAction(input: {
  orderNumber: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  return createPurchaserAccount(input);
}

/** Clears the cart after a PAID order (confirmation page mount). */
export async function clearCartAfterPurchaseAction(input: { orderNumber: string }): Promise<{ ok: boolean; cleared?: boolean }> {
  return clearPurchasedCart(input);
}

// Guest order lookup (§11.3) lives in actions/tracking.ts since Phase 6 step 3:
// challenge-guarded, rate-limited, with the carrier link and delivery estimate.
