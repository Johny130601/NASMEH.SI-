import { Prisma, type Order } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { clearKodaCode } from "@/lib/koda";
import { siteUrl } from "@/lib/seo";
import { getLegalLinks } from "@/lib/settings";
import { marketingVersion, recordConsent } from "@/lib/consent-log";
import { getPaymentProvider } from "@/lib/payments";
import { capturePayPalOrder } from "@/lib/payments/paypal";
import type { PaymentIntentHandle } from "@/lib/payments/types";
import { priceCartWithCoupon } from "@/lib/promo/coupons";
import { resolveCouponInput } from "@/lib/promo/resolve";
import { checkoutFormSchema } from "./checkout-schema";
import { buildCheckoutPricing, quoteMatches } from "./quote";
import { collectInventoryRequirements } from "./inventory";
import { nextOrderNumber } from "./numbers";
import { resolveLegalAcceptance } from "./legal-acceptance";
import { requestCheckoutSubscription, scheduleCheckoutSubscriptionMail } from "./checkout-subscription";

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; provider: PaymentIntentHandle["provider"]; clientSecret?: string;
      approvalUrl?: string; intentId?: string; paymentUnavailable?: boolean; paymentStatus?: string; providerState?: string; created?: boolean; totalCents: number }
  | { ok: false; error: string };

/** Order first, PSP second. Stable provider idempotency keys recover timeouts. */
export async function ensureOrderPayment(order: Order): Promise<PlaceOrderResult> {
  const providerName = order.paymentProvider;
  if (providerName !== "stripe" && providerName !== "paypal" && providerName !== "test") return { ok: false, error: "provider_unavailable" };
  if (order.status !== "PENDING") {
    return { ok: true, orderNumber: order.number, provider: providerName, totalCents: order.totalCents, paymentStatus: order.status };
  }
  const provider = getPaymentProvider(providerName);
  if (!provider) return { ok: false, error: "provider_unavailable" };
  try {
    const currentId = providerName === "paypal" ? order.paypalOrderId : order.stripePaymentIntentId;
    const handle = currentId
      ? await provider.retrieveIntent(currentId)
      : await provider.createIntent({ orderNumber: order.number, totalCents: order.totalCents, email: order.email,
          returnUrl: `${siteUrl()}/potrditev/${encodeURIComponent(order.number)}` });
    if (!currentId) {
      // No external request occurs inside this write. A webhook arriving before
      // association gets a retryable response and leaves no processed marker.
      await db.order.update({ where: { id: order.id }, data: providerName === "paypal"
        ? { paypalOrderId: handle.intentId } : { stripePaymentIntentId: handle.intentId } });
    }
    if (providerName !== "test" && (handle.amountCents !== order.totalCents || handle.currency?.toUpperCase() !== order.currency.toUpperCase())) {
      return { ok: true, orderNumber: order.number, provider: providerName, totalCents: order.totalCents, paymentUnavailable: true };
    }
    if (providerName === "paypal" && handle.status === "APPROVED") await capturePayPalOrder(handle.intentId);
    if ((providerName === "stripe" && ["succeeded", "processing"].includes(handle.status ?? "")) || (providerName === "paypal" && ["APPROVED", "COMPLETED"].includes(handle.status ?? ""))) {
      return { ok: true, orderNumber: order.number, provider: providerName, totalCents: order.totalCents, paymentStatus: "AWAITING_WEBHOOK", providerState: handle.status };
    }
    if (handle.status === "canceled" || handle.status === "VOIDED") {
      return { ok: true, orderNumber: order.number, provider: providerName, totalCents: order.totalCents, paymentStatus: "PAYMENT_CANCELLED", providerState: handle.status };
    }
    if (providerName === "stripe" && !handle.clientSecret) {
      return { ok: true, orderNumber: order.number, provider: providerName, totalCents: order.totalCents, paymentUnavailable: true };
    }
    return { ok: true, orderNumber: order.number, provider: providerName, totalCents: order.totalCents,
      clientSecret: handle.clientSecret, approvalUrl: handle.approvalUrl, intentId: handle.intentId, providerState: handle.status };
  } catch {
    console.error("Payment setup requires retry", order.number, providerName);
    return { ok: true, orderNumber: order.number, provider: providerName, totalCents: order.totalCents, paymentUnavailable: true };
  }
}

export async function placeOrder(rawInput: unknown): Promise<PlaceOrderResult> {
  const parsed = checkoutFormSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "invalid_form" };
  const input = parsed.data;
  const session = await auth();
  const resume = async (existing: Order): Promise<PlaceOrderResult> => {
    if (existing.email !== input.email.toLowerCase() || existing.userId !== (session?.user?.id ?? null)) return { ok: false, error: "order_access" };
    return ensureOrderPayment(existing);
  };
  const existing = await db.order.findUnique({ where: { checkoutKey: input.checkoutKey } });
  if (existing) return resume(existing);
  if (!getPaymentProvider(input.provider)) return { ok: false, error: "provider_unavailable" };

  try {
    const { hydrated, priced, coupon, quote, method, settings, display } = await buildCheckoutPricing(input);
    if (!quoteMatches(input.quoteToken, quote.token)) return { ok: false, error: "quote_changed" };
    const items = priced.lines.map(line => ({
      variantId: line.variantId, title: line.title, sku: line.sku, unitPriceCents: line.unitPriceCents,
      vatRatePercent: settings.vatRatePercent, quantity: line.quantity,
      properties: line.isBundle ? { bundleComponents: (hydrated.find(value => value.variantId === line.variantId)?.bundleComponents ?? [])
        .map(value => ({ variantId: value.variantId, title: value.title, quantity: value.quantity })) } : undefined,
    }));
    const required = collectInventoryRequirements(items);
    if (required.invalidSnapshot) return { ok: false, error: "stock:bundle" };
    const stock = await db.variant.findMany({ where: { id: { in: required.deductions.map(line => line.variantId) } }, select: { id: true, stock: true, title: true, allowBackorder: true } });
    for (const line of required.deductions) {
      const variant = stock.find(value => value.id === line.variantId);
      if (!variant || (!variant.allowBackorder && variant.stock < line.quantity)) return { ok: false, error: `stock:${variant?.title ?? line.variantId}` };
    }

    const legalLinks = await getLegalLinks();
    const { order, subscription } = await db.$transaction(async tx => {
      // Serialize each code's usage reservation and re-evaluate under its lock.
      let couponId: string | undefined;
      if (coupon) {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Coupon" WHERE "code" = ${coupon.code} FOR UPDATE`);
        couponId = rows[0]?.id;
        const latest = await resolveCouponInput(coupon.code, input.email, tx);
        const evaluated = priceCartWithCoupon(hydrated, settings, latest, { email: input.email, hasCodeAlready: false }, new Date());
        if (!couponId || !("appliedCoupon" in evaluated) || !evaluated.appliedCoupon || evaluated.totalCents !== quote.totalCents || evaluated.shippingCents !== quote.shippingCents || evaluated.discountCents !== quote.discountCents) {
          throw new Error("quote_changed");
        }
      }
      const number = await nextOrderNumber(tx);
      // The terms and withdrawal pages the review-step links pointed at, as published at this moment (Phase 9 step 4).
      const placedAt = new Date();
      const legalAcceptance = await resolveLegalAcceptance(tx, legalLinks, placedAt);
      const created = await tx.order.create({ data: {
        number, checkoutKey: input.checkoutKey, status: "PENDING", userId: session?.user?.id ?? null,
        email: input.email.toLowerCase(), phone: input.phone || null,
        subtotalCents: quote.subtotalCents, discountCents: quote.discountCents, shippingCents: quote.shippingCents,
        shippingMethod: method.label, totalCents: quote.totalCents, vatCents: quote.vatCents, vatRatePercent: settings.vatRatePercent,
        shippingAddress: { fullName: input.fullName, street: input.street, streetNumber: input.streetNumber, city: input.city, postalCode: input.postalCode, country: input.country },
        paymentProvider: input.provider, marketingOptIn: input.marketingOptIn,
        couponCode: coupon?.code ?? null,
        ...(coupon ? { couponSnapshot: { code: coupon.code, type: coupon.type, percentOff: coupon.percentOff, amountOffCents: coupon.amountOffCents, discountCents: quote.discountCents } } : {}),
        legalAcceptance,
        timeline: [{ at: placedAt.toISOString(), event: "created", detail: `provider:${input.provider}` }],
        items: { create: items },
      } });
      if (couponId) {
        await tx.couponRedemption.create({ data: { couponId, email: input.email.toLowerCase(), orderId: created.id } });
        await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
      }
      // Order.marketingOptIn records the request only; a ticked box enters the newsletter double opt-in.
      // An unticked box is logged as "not-given" so it never reads as a withdrawal of an earlier consent.
      const subscription = input.marketingOptIn ? await requestCheckoutSubscription(tx, input.email) : null;
      await recordConsent(tx, {
        userId: session?.user?.id ?? null, kind: "marketing-checkout", version: marketingVersion("marketing-checkout"),
        choices: {
          marketing: input.marketingOptIn, action: subscription?.status ?? "not-given", orderNumber: number,
          ...(subscription ? { subscriberId: subscription.subscriberId } : {}),
        },
      });
      return { order: created, subscription };
    });
    if (display.code) await clearKodaCode();
    // Committed: the verification mail goes out after the response, so SMTP never holds or decides the order result.
    scheduleCheckoutSubscriptionMail(order.email, subscription);
    const result = await ensureOrderPayment(order);
    return result.ok ? { ...result, created: true } : result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await db.order.findUnique({ where: { checkoutKey: input.checkoutKey } });
      if (duplicate) return resume(duplicate);
    }
    const message = error instanceof Error ? error.message : "";
    if (["quote_changed", "empty_cart", "invalid_shipping_method"].includes(message)) return { ok: false, error: message };
    console.error("Order creation failed");
    return { ok: false, error: "order_failed" };
  }
}
