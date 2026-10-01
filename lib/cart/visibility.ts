/**
 * Purchasability rule (AGENTS §5.2): only ACTIVE, non-deal products may be
 * added to carts/orders, and a fixed bundle only while its definition is
 * active (the admin's "Aktiven" switch, §14.6). Prevents buying draft or
 * archived products, hidden deal SKUs or a withdrawn bundle by guessing a
 * variant cuid.
 *
 * The same rule decides what the public surfaces show: nothing that cannot be
 * bought is listed (lib/catalog, lib/search, app/sitemap.ts) or answers on
 * /izdelek — a hidden deal SKU stays hidden until the Phase 8 ladder surfaces
 * it on purpose (GENERAL_PLAN Phase 7 §7), and an inactive bundle reads like a
 * draft product. No import: the cart codec and client code may use it.
 */
export interface PurchasableProduct {
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  hiddenDeal: boolean;
  /** The bundle definition of a fixed bundle; null for a plain product. */
  bundle: { active: boolean } | null;
}

export function variantIsPurchasable(product: PurchasableProduct): boolean {
  return product.status === "ACTIVE" && !product.hiddenDeal && (product.bundle?.active ?? true);
}

/**
 * The same rule as a Prisma `where` fragment for `Product` queries, so a list
 * never has to fetch what it would then drop. Spread it into the query's
 * `where`; it owns the `OR` key.
 */
export const PURCHASABLE_PRODUCT_WHERE = {
  status: "ACTIVE" as const,
  hiddenDeal: false,
  OR: [{ bundle: null }, { bundle: { active: true } }],
};
