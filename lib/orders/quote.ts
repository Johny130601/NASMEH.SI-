import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getCartLines } from "@/lib/cart/server";
import { hydrateCartLines } from "@/lib/cart/hydrate";
import { priceCartForDisplay } from "@/lib/promo/cart-pricing";
import type { CouponRejection, CouponType } from "@/lib/promo/coupons";
import { getShippingSettings, getVatRatePercent } from "@/lib/settings";
import { assertNoSoldOutLines } from "./sold-out";

export const quoteInputSchema = z.object({
  email: z.string().trim().max(254).pipe(z.union([z.email(), z.literal("")])).transform(value => value.toLowerCase()),
  country: z.string().length(2), shippingMethodId: z.string().min(1).max(40),
});

export interface CheckoutQuote {
  lines: Array<{ variantId: string; sku: string; title: string; quantity: number; lineTotalCents: number; componentsDigest?: string }>;
  subtotalCents: number; discountCents: number; shippingCents: number; totalCents: number;
  /**
   * Delivery is free because of the order (the threshold or a free-shipping
   * code), whichever method is picked — not merely because the picked method
   * costs 0 €. The wizard then labels every method free (QA C2-F10).
   */
  freeShippingReached: boolean;
  vatCents: number; vatRatePercent: number; couponCode: string | null;
  /** The applied code's type: the terms sentence differs for a free-shipping code (QA T6-10). */
  couponType: CouponType | null;
  couponRejection: CouponRejection | null;
  shippingMethodId: string; country: string; email: string; token: string;
}

/**
 * Why a quote could not be built; the wizard turns each into a hint instead of a dead end (QA M11).
 * `sold_out`: a line sold out while it sat in the cart; the wizard names it and links to the cart.
 */
export type QuoteFailure = "invalid_email" | "empty_cart" | "sold_out" | "invalid_shipping_method" | "failed";

export function quoteFailureReason(error: unknown): QuoteFailure {
  // Only a refused e-mail marks the e-mail field; a refused method or country (none serves it) is a delivery problem.
  if (error instanceof z.ZodError) {
    return error.issues.some(issue => issue.path[0] === "email") ? "invalid_email" : "invalid_shipping_method";
  }
  const message = error instanceof Error ? error.message : "";
  return message === "empty_cart" || message === "sold_out" || message === "invalid_shipping_method" ? message : "failed";
}

export function signQuote(quote: Omit<CheckoutQuote, "token">, secret: string): string {
  const canonical = { ...quote, lines: [...quote.lines].sort((a, b) => a.variantId.localeCompare(b.variantId)) };
  return createHmac("sha256", secret).update(JSON.stringify(canonical)).digest("hex");
}

export function quoteMatches(token: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
}

/** Shared server pricing for the visible quote and the persisted order. */
export async function buildCheckoutPricing(raw: unknown) {
  const input = quoteInputSchema.parse(raw);
  const session = await auth();
  const hydrated = await hydrateCartLines(await getCartLines(session?.user?.id ?? null));
  if (!hydrated.length) throw new Error("empty_cart");
  // A line that sold out in the cart stops the checkout here, named, not at "Oddaj naročilo".
  assertNoSoldOutLines(hydrated);
  const [shipping, vat] = await Promise.all([getShippingSettings(), getVatRatePercent()]);
  const method = shipping.methods.find(value => value.id === input.shippingMethodId && value.countries.includes(input.country));
  if (!method) throw new Error("invalid_shipping_method");
  const settings = { vatRatePercent: vat, freeShippingThresholdCents: shipping.freeThresholdCents, shippingCostCents: method.priceCents };
  const display = await priceCartForDisplay(hydrated, settings, input.email);
  const priced = display.priced;
  const coupon = "appliedCoupon" in priced ? priced.appliedCoupon : null;
  const data: Omit<CheckoutQuote, "token"> = {
    lines: priced.lines.map(line => {
      const components = hydrated.find(value => value.variantId === line.variantId)?.bundleComponents;
      return {
        variantId: line.variantId, sku: line.sku, title: line.title, quantity: line.quantity, lineTotalCents: line.lineTotalCents,
        ...(line.isBundle ? { componentsDigest: createHash("sha256").update(JSON.stringify(
          (components ?? []).map(({ variantId, title, quantity }) => ({ variantId, title, quantity }))
            .sort((a, b) => a.variantId.localeCompare(b.variantId)),
        )).digest("hex") } : {}),
      };
    }).sort((a, b) => a.variantId.localeCompare(b.variantId)),
    subtotalCents: priced.subtotalCents, discountCents: coupon?.discountCents ?? 0,
    shippingCents: priced.shippingCents, freeShippingReached: priced.freeShipping.reached,
    totalCents: priced.totalCents, vatCents: priced.vatCents,
    vatRatePercent: settings.vatRatePercent, couponCode: coupon?.code ?? null, couponType: coupon?.type ?? display.couponType,
    couponRejection: display.rejection,
    shippingMethodId: method.id, country: input.country, email: input.email,
  };
  return { session, hydrated, method, settings, priced, coupon, display, quote: { ...data, token: signQuote(data, getEnv().AUTH_SECRET) } };
}
