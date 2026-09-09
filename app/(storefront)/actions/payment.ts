"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { buildCheckoutPricing, type CheckoutQuote } from "@/lib/orders/quote";
import { hasOrderAccess } from "@/lib/orders/access";
import { capturePayPalOrder } from "@/lib/payments/paypal";
import { ensureOrderPayment, type PlaceOrderResult } from "@/lib/orders/create";

export async function quoteCheckoutAction(input: unknown): Promise<{ ok: true; quote: CheckoutQuote } | { ok: false }> {
  try { return { ok: true, quote: (await buildCheckoutPricing(input)).quote }; }
  catch { return { ok: false }; }
}

export async function capturePayPalAction(input: unknown): Promise<{ ok: boolean }> {
  const parsed = z.object({ orderNumber: z.string().min(1).max(100) }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const order = await db.order.findUnique({ where: { number: parsed.data.orderNumber } });
  if (!order || !await hasOrderAccess(order, await auth()) || order.paymentProvider !== "paypal" || !order.paypalOrderId) return { ok: false };
  if (order.status !== "PENDING") return { ok: order.paidAt !== null && !order.refundRequired };
  try { await capturePayPalOrder(order.paypalOrderId); return { ok: true }; }
  catch { return { ok: false }; }
}

export async function resumeOrderPaymentAction(input: unknown): Promise<PlaceOrderResult> {
  const parsed = z.object({ orderNumber: z.string().min(1).max(100) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_form" };
  const order = await db.order.findUnique({ where: { number: parsed.data.orderNumber } });
  if (!order || !await hasOrderAccess(order, await auth())) return { ok: false, error: "order_access" };
  return ensureOrderPayment(order);
}
