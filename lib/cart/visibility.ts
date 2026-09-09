/**
 * Purchasability rule (AGENTS §5.2): only ACTIVE, non-deal products may be
 * added to carts/orders. Prevents buying draft/archived products or hidden
 * deal SKUs by guessing a variant cuid.
 */
export function variantIsPurchasable(product: {
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  hiddenDeal: boolean;
}): boolean {
  return product.status === "ACTIVE" && !product.hiddenDeal;
}
