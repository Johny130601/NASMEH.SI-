import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getCartLines } from "@/lib/cart/server";
import { hydrateCartLines } from "@/lib/cart/hydrate";
import { priceCartForDisplay } from "@/lib/promo/cart-pricing";
import type { CouponRejection } from "@/lib/promo/coupons";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { shippingMethodSchema } from "./checkout-schema";

export const quoteInputSchema = z.object({
  email: z.union([z.email(), z.literal("")]).transform(value => value.toLowerCase()),
  country: z.string().length(2), shippingMethodId: z.string().min(1).max(40),
});

export interface CheckoutQuote {
  lines: Array<{ variantId: string; sku: string; title: string; quantity: number; lineTotalCents: number; componentsDigest?: string }>;
  subtotalCents: number; discountCents: number; shippingCents: number; totalCents: number;
  vatCents: number; vatRatePercent: number; couponCode: string | null;
  couponRejection: CouponRejection | null;
  shippingMethodId: string; country: string; email: string; token: string;
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
  const [threshold, vat, rawMethods] = await Promise.all([
    getSetting<number>(SETTING_KEYS.freeShippingThresholdCents),
    getSetting<number>(SETTING_KEYS.vatRatePercent),
    getSetting<unknown>("shipping.methods"),
  ]);
  const methods = z.array(shippingMethodSchema).parse(rawMethods ?? []);
  const method = methods.find(value => value.id === input.shippingMethodId && value.countries.includes(input.country));
  if (!method) throw new Error("invalid_shipping_method");
  const settings = { vatRatePercent: vat ?? 22, freeShippingThresholdCents: threshold ?? 4500, shippingCostCents: method.priceCents };
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
    shippingCents: priced.shippingCents, totalCents: priced.totalCents, vatCents: priced.vatCents,
    vatRatePercent: settings.vatRatePercent, couponCode: coupon?.code ?? null,
    couponRejection: display.rejection,
    shippingMethodId: method.id, country: input.country, email: input.email,
  };
  return { session, hydrated, method, settings, priced, coupon, display, quote: { ...data, token: signQuote(data, getEnv().AUTH_SECRET) } };
}
