import { db } from "@/lib/db";
import type { CartLine } from "./codec";
import type { CartLineInput } from "@/lib/promo";
import { variantIsPurchasable } from "./visibility";
import { withReducedFlags } from "@/lib/promo/reductions";

export interface HydratedLine extends CartLineInput {
  productSlug: string;
  imageUrl: string | null;
  imageAlt: string;
  product: { productId: string; collectionSlugs: string[] };
  crossSellSlugs: string[];
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
    return [
      {
        variantId: variant.id,
        sku: variant.sku,
        title: variant.product.title,
        quantity: line.quantity,
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
