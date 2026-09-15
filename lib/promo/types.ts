/** lib/promo types — PURE pricing core (AGENTS §5.3). No I/O, `now` injected. */

export interface BundleComponentInput {
  variantId: string;
  title: string;
  quantity: number;
  priceCents: number;
}

export interface CartLineInput {
  variantId: string;
  sku: string;
  title: string;
  quantity: number;
  priceCents: number;
  compareAtPriceCents: number | null;
  /**
   * The storefront shows this line as reduced: a history-backed Omnibus
   * reduction (`getPriceReductions` in lib/omnibus) exists for the variant.
   * Computed by the async layer that builds the lines; the coupon terms
   * exclude exactly these lines, never a bare compare-at.
   */
  reduced: boolean;
  vatRatePercent: number;
  maxCartQuantity: number;
  isBundle: boolean;
  bundleComponents?: BundleComponentInput[];
}

export interface PromoSettings {
  vatRatePercent: number;
  freeShippingThresholdCents: number;
  shippingCostCents: number;
}

export interface PricedLine {
  variantId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  compareAtPriceCents: number | null;
  lineTotalCents: number;
  isBundle: boolean;
  bundleComponents: BundleComponentInput[];
}

export interface FreeShippingState {
  reached: boolean;
  remainingCents: number;
  progressPercent: number;
}

export interface PricedCart {
  lines: PricedLine[];
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  vatCents: number;
  freeShipping: FreeShippingState;
}
