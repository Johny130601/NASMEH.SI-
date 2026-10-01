/**
 * Availability of a sellable variant with its bundle's components counted.
 *
 * PURE (AGENTS §8.4): typed rows in, a stock figure out, no I/O. A fixed
 * bundle's own `Variant.stock` is never decremented — order creation deducts
 * the components (lib/orders/inventory.ts) — so the components decide whether
 * a bundle can be filled. Every surface that states availability (the cards,
 * the product page and its JSON-LD, the sitemap's HIDE rule, the add-to-cart
 * action) reads it from here, so it states what order creation will enforce.
 */

export interface StockedVariant {
  stock: number;
  allowBackorder: boolean;
}

export interface StockedComponent {
  quantity: number;
  variant: StockedVariant;
}

/**
 * Bundles the components can fill: the fewest `floor(stock / quantity)` over
 * the components that do not allow backorders. Null when no component limits
 * the count (every one is backorderable, or there are none).
 */
export function bundleUnitsFromComponents(items: StockedComponent[]): number | null {
  let units: number | null = null;
  for (const item of items) {
    if (item.variant.allowBackorder) continue;
    const perBundle = Number.isFinite(item.quantity) && item.quantity > 0 ? Math.floor(item.quantity) : 1;
    const stock = Number.isFinite(item.variant.stock) ? item.variant.stock : 0;
    const fill = Math.max(0, Math.floor(stock / perBundle));
    units = units === null ? fill : Math.min(units, fill);
  }
  return units;
}

/**
 * The stock a shopper can really buy. A plain product sells from its own
 * row. A fixed bundle sells the fewest bundles its components can fill, never
 * more than its own row says; and it can only be backordered when no
 * component limits it, because a backorder the components cannot honour is
 * refused at order creation.
 */
export function sellableStock(
  variant: StockedVariant,
  bundle: { items: StockedComponent[] } | null | undefined,
): StockedVariant {
  if (!bundle) return { stock: variant.stock, allowBackorder: variant.allowBackorder };
  const units = bundleUnitsFromComponents(bundle.items);
  if (units === null) return { stock: variant.stock, allowBackorder: variant.allowBackorder };
  return { stock: Math.min(variant.stock, units), allowBackorder: false };
}

/** Sold out for display and for the cart: nothing to sell and no backorders. */
export function isSoldOut(availability: StockedVariant): boolean {
  return availability.stock <= 0 && !availability.allowBackorder;
}

/**
 * Units one add may put in the cart: the per-line cap, and no more than the
 * stock can fill unless backorders are allowed. The write clamps to it.
 */
export function addableUnits(availability: StockedVariant, maxCartQuantity: number): number {
  if (availability.allowBackorder) return maxCartQuantity;
  return Math.max(0, Math.min(maxCartQuantity, availability.stock));
}

/**
 * HIDE (§14.2): a fully sold-out product without backorders leaves the lists
 * and the sitemap; NOTIFY keeps it with "Obvestite me". A bundle's stock is
 * its components'.
 */
export function productHasSellableUnits(product: {
  soldOutBehavior: "NOTIFY" | "HIDE";
  variants: StockedVariant[];
  bundle?: { items: StockedComponent[] } | null;
}): boolean {
  if (product.soldOutBehavior !== "HIDE") return true;
  return product.variants.some((variant) => !isSoldOut(sellableStock(variant, product.bundle)));
}
