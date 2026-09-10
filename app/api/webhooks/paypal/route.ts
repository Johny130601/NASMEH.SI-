import { z } from "zod";
import { NextResponse } from "next/server";
import { isTestMode } from "@/lib/turnstile";
import { db } from "@/lib/db";
import { capturePayPalOrder, paypalRequest } from "@/lib/payments/paypal";
import { verifyPayPalWebhook } from "@/lib/payments/paypal-verify";
import { markOrderPaid, markPaymentFailed, markRefunded } from "@/lib/orders/transitions";

export const dynamic = "force-dynamic";
const eventSchema = z.object({
  id: z.string().min(1).max(255), event_type: z.string().min(1),
  resource: z.object({
    id: z.string().min(1),
    amount: z.object({ value: z.string().regex(/^\d+\.\d{2}$/), currency_code: z.string().length(3) }).optional(),
    supplementary_data: z.object({ related_ids: z.object({ order_id: z.string().optional(), capture_id: z.string().optional() }) }).optional(),
    links: z.array(z.object({ rel: z.string(), href: z.url() })).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  const body = await request.text();
  try {
    if (!await verifyPayPalWebhook(body, request.headers)) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "verification_unavailable" }, { status: 503 });
  }
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return NextResponse.json({ error: "invalid_payload" }, { status: 400 }); }
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const event = parsed.data;
  if (event.event_type === "CHECKOUT.ORDER.APPROVED" && !isTestMode()) {
    const order = await db.order.findFirst({ where: { paymentProvider: "paypal", paypalOrderId: event.resource?.id ?? "" } });
    if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 409 });
    if (order.status === "PENDING" && order.paypalOrderId) {
      try { await capturePayPalOrder(order.paypalOrderId); }
      catch { return NextResponse.json({ error: "capture_retry_required" }, { status: 503 }); }
    }
  }
  // Approval is not captured money. It must never mark a local order paid.
  if (!["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DECLINED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED"].includes(event.event_type)) return NextResponse.json({ received: true, result: { outcome: "ignored" } });
  let orderId = event.resource?.supplementary_data?.related_ids.order_id ?? (isTestMode() ? event.resource?.id : undefined);
  if (!orderId && event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
    // Refund events may link the capture rather than contain the Orders API ID.
    const up = event.resource?.links?.find(link => link.rel === "up");
    let captureId = event.resource?.supplementary_data?.related_ids.capture_id;
    if (!captureId && up) {
      const url = new URL(up.href);
      if (url.protocol === "https:" && ["api.paypal.com", "api.sandbox.paypal.com", "api-m.paypal.com", "api-m.sandbox.paypal.com"].includes(url.hostname)) {
        captureId = url.pathname.match(/^\/v2\/payments\/captures\/([A-Za-z0-9-]+)$/)?.[1];
      }
    }
    if (captureId && /^[A-Za-z0-9-]{1,100}$/.test(captureId)) {
      try {
        const capture = z.object({ supplementary_data: z.object({ related_ids: z.object({ order_id: z.string() }) }) })
          .parse(await paypalRequest(`/v2/payments/captures/${captureId}`));
        orderId = capture.supplementary_data.related_ids.order_id;
      } catch { return NextResponse.json({ error: "refund_lookup_retry_required" }, { status: 503 }); }
    }
  }
  const amount = event.resource?.amount;
  const amountCents = amount ? Number(amount.value.replace(".", "")) : undefined;
  const needsAmount = !["PAYMENT.CAPTURE.DECLINED", "PAYMENT.CAPTURE.DENIED"].includes(event.event_type);
  if (!orderId || (amount && !Number.isSafeInteger(amountCents)) ||
      (!isTestMode() && needsAmount && !amount)) return NextResponse.json({ error: "invalid_resource" }, { status: 400 });
  const details = amount && amountCents !== undefined ? { amountCents, currency: amount.currency_code } : undefined;
  if (event.event_type === "PAYMENT.CAPTURE.REFUNDED" && event.resource?.id) {
    // An operator refund (Phase 7) already applied this money movement locally;
    // PayPal reports refund amounts per event, not cumulatively, so skip it.
    const known = await db.refund.findFirst({ where: { providerRefundId: event.resource.id }, select: { id: true } });
    if (known) return NextResponse.json({ received: true, result: { outcome: "already_processed" } });
  }
  try {
    const result = event.event_type === "PAYMENT.CAPTURE.COMPLETED"
      ? await markOrderPaid("paypal", event.id, orderId, details)
      : event.event_type === "PAYMENT.CAPTURE.REFUNDED"
        ? await markRefunded("paypal", event.id, orderId, details)
        : await markPaymentFailed("paypal", event.id, orderId);
    return NextResponse.json({ received: true, result }, { status: ["not_found", "payment_mismatch"].includes(result.outcome) ? 409 : 200 });
  } catch {
    console.error("PayPal webhook transition failed", event.id);
    return NextResponse.json({ error: "retry_required" }, { status: 500 });
  }
}
