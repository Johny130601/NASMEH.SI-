import { priceCart, type PricedCart, type PromoSettings } from "./index";
import {
  priceCartWithCoupon,
  type CouponPricedCart,
  type CouponRejection,
} from "./coupons";
import { resolveCouponInput } from "./resolve";
import { readKodaCode } from "@/lib/koda";
import type { HydratedLine } from "@/lib/cart/hydrate";

export interface CartPricingDisplay {
  priced: PricedCart | CouponPricedCart;
  rejection: CouponRejection | null;
  code: string | null;
}

/**
 * Server-side display pricing for cart/checkout (§7.2/§8.2): reads the koda
 * cookie, resolves + evaluates against the CURRENT cart (recomputed on every
 * read). A rejected code NEVER breaks the page — it falls back to
 * undiscounted pricing and reports the rejection for the error state.
 */
export async function priceCartForDisplay(
  hydrated: HydratedLine[],
  settings: PromoSettings,
  email: string,
): Promise<CartPricingDisplay> {
  const code = await readKodaCode();
  if (!code) {
    return {
      priced: priceCart(hydrated, settings, new Date()),
      rejection: null,
      code: null,
    };
  }

  const coupon = await resolveCouponInput(code, email);
  const result = priceCartWithCoupon(
    hydrated,
    settings,
    coupon,
    { email, hasCodeAlready: false },
    new Date(),
  );

  if ("appliedCoupon" in result) {
    return { priced: result, rejection: null, code };
  }
  return {
    priced: priceCart(hydrated, settings, new Date()),
    rejection: result.rejection,
    code,
  };
}
