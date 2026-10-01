import { db } from "@/lib/db";
import type { CartLine } from "./codec";
import type { CartLineInput } from "@/lib/promo";
import { variantIsPurchasable } from "./visibility";
import { addableUnits, isSoldOut, sellableStock, type StockedComponent, type StockedVariant } from "@/lib/bundle/availability";
import { withReducedFlags } from "@/lib/promo/reductions";

export interface HydratedLine extends CartLineInput {
  productSlug: string;
  imageUrl: string | null;
  imageAlt: string;
  product: { productId: string; collectionSlugs: string[] };
  crossSellSlugs: string[];
  /**
   * The most units this line can hold: the per-line cap, and the stock unless
   * backorders are allowed. The cart stepper and its notice use it.
   */
  quantityCap: number;
  /**
   * Nothing of the line can be sold now (a bundle: its components), and no
   * backorders. The line keeps its quantity so order creation still names the
   * stock-out, but the cart flags it, its stepper cannot raise it and the
   * checkout stops at the start instead of at "Oddaj naročilo".
   */
  soldOut: boolean;
}

/**
 * The cap a stored line is read back under (QA C2-F16). Quantities come from a
 * signed cookie or the DB cart, and either may hold more than the line may
 * have now — the cap was lowered, the stock fell, or the cookie was re-signed
 * with a known secret — so every read re-applies `maxCartQuantity` and the
 * stock the components can fill. A sold-out line (nothing addable) keeps its
 * quantity under the per-line cap, so order creation names the stock-out
 * instead of the cart quietly shrinking it. A malformed stock figure never
 * limits the line.
 */
export function lineQuantityCap(
  maxCartQuantity: number,
  variant: StockedVariant,
  bundle: { items: StockedComponent[] } | null | undefined,
): number {
  const perLine = Number.isFinite(maxCartQuantity) && maxCartQuantity > 0 ? Math.floor(maxCartQuantity) : 1;
  if (!Number.isFinite(variant.stock)) return perLine;
  const addable = addableUnits(sellableStock(variant, bundle), perLine);
  return Number.isFinite(addable) && addable > 0 ? addable : perLine;
}

/**
 * Server-side line hydration (AGENTS §5.2): cookie/DB lines (ids+qty only)
 * become full display+pricing rows from the DATABASE — prices never come
 * from the client. Each line carries `reduced` (the history-backed Omnibus
 * reduction the storefront shows, one batched query) so the coupon terms
 * exclude the same lines on the cart, the checkout quote and order creation.
 */
export async function hydrateCartLines(lines: CartLine[]): Promise<HydratedLine[]> {
  if (lines.length === 0) return [];

  const variants = await db.variant.findMany({
    where: { id: { in: lines.map((line) => line.variantId) } },
    include: {
      product: {
        include: {
          media: {
            where: { kind: "CARD" },
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
          bundle: { include: { items: { include: { variant: true } } } },
          collections: { include: { collection: { select: { slug: true } } } },
        },
      },
    },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  const built = lines.flatMap((line): Array<Omit<HydratedLine, "reduced">> => {
    const variant = byId.get(line.variantId);
    // drop lines that are no longer purchasable (deleted, drafted, deal SKU)
    if (!variant || !variantIsPurchasable(variant.product)) return [];
    const bundle = variant.product.bundle;
    const quantityCap = lineQuantityCap(variant.maxCartQuantity, variant, bundle);
    return [
      {
        variantId: variant.id,
        sku: variant.sku,
        title: variant.product.title,
        quantity: Math.min(line.quantity, quantityCap),
        quantityCap,
        soldOut: isSoldOut(sellableStock(variant, bundle)),
        priceCents: variant.priceCents,
        compareAtPriceCents: variant.compareAtPriceCents,
        vatRatePercent: 22,
        maxCartQuantity: variant.maxCartQuantity,
        isBundle: bundle !== null,
        bundleComponents: bundle
          ? bundle.items.map((item) => ({
              variantId: item.variant.id,
              title: item.variant.title,
              quantity: item.quantity,
              priceCents: item.variant.priceCents,
            }))
          : [],
        productSlug: variant.product.slug,
        imageUrl: variant.product.media[0]?.url ?? null,
        imageAlt: variant.product.media[0]?.alt ?? variant.product.title,
        product: {
          productId: variant.product.id,
          collectionSlugs: variant.product.collections.map(
            (entry) => entry.collection.slug,
          ),
        },
        crossSellSlugs: (() => {
          const cf = variant.product.customFields as
            | { crossSell?: unknown }
            | null;
          return Array.isArray(cf?.crossSell)
            ? (cf!.crossSell as unknown[]).filter(
                (slug): slug is string => typeof slug === "string",
              )
            : [];
        })(),
      },
    ];
  });
  return withReducedFlags(built);
}
