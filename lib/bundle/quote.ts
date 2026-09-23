import { priceCart, type PromoSettings } from "@/lib/promo";
import {
  priceCartWithCoupon,
  type CouponContext,
  type CouponInput,
  type CouponLine,
  type CouponRejection,
} from "@/lib/promo/coupons";

/**
 * Bundle-builder pricing — PURE (AGENTS §5.3/§8.4): typed data in, quotes out,
 * `now` injected, zero I/O.
 *
 * The module must never state a figure the cart would then contradict, so it
 * does not do arithmetic of its own: it asks the SAME engine the cart, the
 * checkout quote and order creation ask (`priceCartWithCoupon`, falling back
 * to `priceCart` exactly as `priceCartForDisplay` does when the coupon is
 * rejected), once per selectable combination, over the WHOLE prospective cart
 * — the shopper's existing lines included, because that is what the coupon,
 * the free-shipping threshold and the total are computed from.
 *
 * The client then renders a lookup, never a calculation (AGENTS §8.3).
 */

export interface BundleQuote {
  /** Index into the offer row. */
  offerIndex: number;
  /** Bitmask of the selected add-ons, bit i = add-on i. */
  addOnMask: number;
  /** Base units the cart holds once this selection is committed. */
  units: number;
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  /**
   * Floored share of the subtotal the discount really takes. Derived from the
   * engine's own cents — never from the coupon's `percentOff`, which describes
   * a base that excludes bundle and already-reduced lines and so would not
   * reconcile with the figure beside it.
   */
  discountPercent: number;
  shippingCents: number;
  freeShipping: boolean;
  totalCents: number;
  vatCents: number;
  /** Goods total of the builder's own lines, for the "Vaš paket" recap. */
  bundleSubtotalCents: number;
  /** Why no discount line renders for this combination, if there is none. */
  rejection: CouponRejection | null;
}

export interface BundleQuoteInput {
  /** The base variant as one unit; quantity is set per offer. */
  base: CouponLine;
  /** Add-on candidates, each as one unit. */
  addOns: CouponLine[];
  /**
   * Units of each add-on the cart already holds, in the same order. A
   * candidate the shopper did not tick but already owns still sits in the
   * cart, and a ticked one is raised to at least one — both are priced, or
   * the total would not be the total.
   */
  addOnExisting: number[];
  /** Everything already in the cart that this module does not own. */
  otherLines: CouponLine[];
  /** Base units already in the cart (the product page may have added some). */
  existingBaseQuantity: number;
  /** Units each offer commits to, ascending. */
  offerUnits: number[];
  settings: PromoSettings;
  coupon: CouponInput | null;
  ctx: CouponContext;
  now: Date;
}

/** Key for the lookup the client holds. */
export function quoteKey(offerIndex: number, addOnMask: number): string {
  return `${offerIndex}:${addOnMask}`;
}

/**
 * Units the cart ends up with. `ensureCartLines` raises a line to at least the
 * quantity asked for and never lowers it, so an offer below what the shopper
 * already holds changes nothing — and the quote has to say so rather than
 * price a smaller cart than the one that will be charged.
 */
export function committedUnits(offerUnits: number, existing: number): number {
  return Math.max(offerUnits, existing);
}

function percentOf(discountCents: number, subtotalCents: number): number {
  if (discountCents <= 0 || subtotalCents <= 0) return 0;
  // Floored, so the stated share is never more than the cents taken (§8.23).
  return Math.floor((discountCents * 100) / subtotalCents);
}

/** One combination, priced by the engine. */
export function quoteCombination(
  input: BundleQuoteInput,
  offerIndex: number,
  addOnMask: number,
): BundleQuote {
  const { base, addOns, otherLines, settings, coupon, ctx, now } = input;
  const units = committedUnits(input.offerUnits[offerIndex] ?? 1, input.existingBaseQuantity);

  const bundleLines: CouponLine[] = [{ ...base, quantity: units }];
  // Lines this module owns but the shopper did not tick: still in the cart,
  // still priced, just not part of what the bundle recap counts.
  const untickedLines: CouponLine[] = [];
  addOns.forEach((addOn, index) => {
    const existing = input.addOnExisting[index] ?? 0;
    if ((addOnMask & (1 << index)) !== 0) {
      bundleLines.push({ ...addOn, quantity: Math.max(existing, 1) });
    } else if (existing > 0) {
      untickedLines.push({ ...addOn, quantity: existing });
    }
  });
  const lines = [...bundleLines, ...untickedLines, ...otherLines];

  const withCoupon = priceCartWithCoupon(lines, settings, coupon, ctx, now);
  const applied = "appliedCoupon" in withCoupon ? withCoupon : null;
  // A rejected coupon never breaks the page: it falls back to plain pricing,
  // the same way lib/promo/cart-pricing.ts does for the cart.
  const priced = applied ?? priceCart(lines, settings, now);
  const discountCents = applied?.discountCents ?? 0;

  return {
    offerIndex,
    addOnMask,
    units,
    itemCount: priced.itemCount,
    subtotalCents: priced.subtotalCents,
    discountCents,
    discountPercent: percentOf(discountCents, priced.subtotalCents),
    shippingCents: priced.shippingCents,
    freeShipping: priced.freeShipping.reached,
    totalCents: priced.totalCents,
    vatCents: priced.vatCents,
    bundleSubtotalCents: bundleLines.reduce(
      (sum, line) => sum + line.priceCents * line.quantity,
      0,
    ),
    rejection: applied ? null : "rejection" in withCoupon ? withCoupon.rejection : null,
  };
}

/**
 * Every combination the offer row and the add-on row can produce:
 * `offers × 2^addOns`. The add-on count is what the catalogue actually
 * resolved, never a fixed three.
 */
export function buildQuoteTable(input: BundleQuoteInput): Record<string, BundleQuote> {
  const table: Record<string, BundleQuote> = {};
  const masks = 1 << input.addOns.length;
  for (let offerIndex = 0; offerIndex < input.offerUnits.length; offerIndex += 1) {
    for (let mask = 0; mask < masks; mask += 1) {
      table[quoteKey(offerIndex, mask)] = quoteCombination(input, offerIndex, mask);
    }
  }
  return table;
}

/**
 * The offer that earns the "best choice" badge: the one whose own quote (with
 * no add-ons) hands back the most, counting the delivery it saves. A computed
 * rank, not a position in the grid — an operator may reprice at any time, and
 * a superlative that is no longer true is a banned practice (§8.23).
 *
 * Null when the offers do not separate, so no badge is shown rather than an
 * arbitrary one.
 */
export function bestOfferIndex(
  table: Record<string, BundleQuote>,
  offerCount: number,
): number | null {
  let bestIndex: number | null = null;
  let bestValue = 0;
  let tied = false;
  for (let index = 0; index < offerCount; index += 1) {
    const quote = table[quoteKey(index, 0)];
    if (!quote) continue;
    // Per unit, so a bigger pack does not win on size alone.
    const perUnit = (quote.discountCents + (quote.freeShipping ? 0 : -quote.shippingCents)) / quote.units;
    if (bestIndex === null || perUnit > bestValue) {
      bestIndex = index;
      bestValue = perUnit;
      tied = false;
    } else if (perUnit === bestValue) {
      tied = true;
    }
  }
  return tied || bestValue <= 0 ? null : bestIndex;
}
