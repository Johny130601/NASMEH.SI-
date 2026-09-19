import Stripe from "stripe";
import { z } from "zod";
import { NextResponse } from "next/server";
import { isTestMode } from "@/lib/turnstile";
import { markOrderPaid, markPaymentCancelled, markPaymentFailed, markRefunded } from "@/lib/orders/transitions";

export const dynamic = "force-dynamic";
const eventSchema = z.object({
  id: z.string().min(1).max(255), type: z.string().min(1),
  data: z.object({ object: z.object({
    id: z.string().min(1), payment_intent: z.string().nullish(),
    currency: z.string().optional(), amount_received: z.number().int().nonnegative().optional(),
    amount_refunded: z.number().int().nonnegative().optional(),
  }) }),
});

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  let raw: unknown;
  try {
    raw = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_webhook_verification_only").webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const event = parsed.data;
  const object = event.data.object;
  let result: { outcome: string } = { outcome: "ignored" };
  try {
    if (event.type === "payment_intent.succeeded") {
      if (!isTestMode() && (object.amount_received === undefined || !object.currency)) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
      result = await markOrderPaid("stripe", event.id, object.id,
        object.amount_received !== undefined && object.currency ? { amountCents: object.amount_received, currency: object.currency } : undefined);
    } else if (event.type === "payment_intent.payment_failed") {
      result = await markPaymentFailed("stripe", event.id, object.id);
    } else if (event.type === "payment_intent.canceled") {
      result = await markPaymentCancelled("stripe", event.id, object.id);
    } else if (event.type === "charge.refunded") {
      if (!object.payment_intent || object.amount_refunded === undefined || !object.currency) return NextResponse.json({ error: "invalid_refund" }, { status: 400 });
      result = await markRefunded("stripe", event.id, object.payment_intent, { amountCents: object.amount_refunded, currency: object.currency, totalRefundedCents: object.amount_refunded });
    }
    return NextResponse.json({ received: true, result }, { status: ["not_found", "payment_mismatch", "refund_in_flight"].includes(result.outcome) ? 409 : 200 });
  } catch {
    console.error("Stripe webhook transition failed", event.id);
    return NextResponse.json({ error: "retry_required" }, { status: 500 });
  }
}
