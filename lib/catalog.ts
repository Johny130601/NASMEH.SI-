import { db } from "@/lib/db";
import { getPriceReductions } from "@/lib/omnibus";
import { getLowStockThreshold } from "@/lib/settings";
import { bundleSavings, type BundleSavings, type PriceReduction } from "@/lib/pricing";

/** Shared catalog product shape for cards across all surfaces. */
export interface CatalogProduct {
  slug: string;
  title: string;
  variantId: string;
  sku: string;
  priceCents: number;
  /**
   * Omnibus-backed reduction from `getPriceReductions` — the only source of a
   * card's strikethrough and "−X %" pill; null renders the plain price. The
   * raw compare-at is deliberately not on the card shape.
   */
  reduction: PriceReduction | null;
  stock: number;
  /** Sold out for display: no stock and no backorder allowed (§14.2). */
  soldOut: boolean;
  /**
   * Real remaining units when the variant sells from a low stock (1…threshold,
   * the admin's §14.2 setting); null otherwise. The card and the PDP show it
   * as "Samo še N kosov na zalogi" — never a made-up scarcity figure.
   */
  lowStock: number | null;
  backorderNote: string | null;
  maxCartQuantity: number;
  imageUrl: string | null;
  imageAlt: string;
  /** First gallery image, cross-faded in on hover when it differs from the card image. */
  hoverImageUrl: string | null;
  badges: Badge[];
  variantCount: number;
  rating: { average: number; count: number } | null;
  unitPrice: { quantity: number; unit: string } | null;
  isBundle: boolean;
  /**
   * Fixed-bundle value math (§6.6, §9.2): the components' genuine current
   * prices against the bundle price, only when the bundle costs less. Not an
   * Art. 6a reduction — the card renders it as a value line, never as a
   * strikethrough.
   */
  bundleSavings: BundleSavings | null;
  createdAt: Date;
}

export interface Badge {
  label: string;
  style: "outline" | "solid" | "grey" | "warning" | "promo";
}

const BADGE_STYLES = new Set(["outline", "solid", "grey", "warning", "promo"]);

export function parseBadges(json: unknown): Badge[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      "label" in entry &&
      typeof (entry as { label: unknown }).label === "string"
    ) {
      const style = (entry as { style?: unknown }).style;
      return [
        {
          label: (entry as { label: string }).label,
          style: BADGE_STYLES.has(style as string)
            ? (style as Badge["style"])
            : "solid",
        },
      ];
    }
    return [];
  });
}

function parseUnitPrice(json: unknown): CatalogProduct["unitPrice"] {
  if (!json || typeof json !== "object" || !("unitPrice" in json)) return null;
  const up = (json as { unitPrice?: unknown }).unitPrice;
  if (
    up &&
    typeof up === "object" &&
    typeof (up as { quantity?: unknown }).quantity === "number" &&
    typeof (up as { unit?: unknown }).unit === "string"
  ) {
    return up as { quantity: number; unit: string };
  }
  return null;
}

/**
 * The real count a low-stock line may state: the stock itself while it is
 * 1…threshold, otherwise null (out of stock has its own state, a healthy
 * stock says nothing). A threshold of 0 switches the line off.
 */
export function lowStockUnits(stock: number, threshold: number): number | null {
  if (!Number.isFinite(stock) || !Number.isFinite(threshold)) return null;
  return stock > 0 && threshold > 0 && stock <= threshold ? stock : null;
}

/** The bundle's value line input, or null when it saves nothing (or is no bundle). */
export function bundleSavingsFor(
  bundle: { priceCents: number; items: Array<{ quantity: number; variant: { priceCents: number } }> } | null,
): BundleSavings | null {
  if (!bundle || bundle.items.length === 0) return null;
  const savings = bundleSavings(
    bundle.items.map((item) => item.variant.priceCents * item.quantity),
    bundle.priceCents,
  );
  return savings.savingsCents > 0 ? savings : null;
}

type ProductRow = Awaited<ReturnType<typeof fetchProducts>>[number];

async function fetchProducts(where: object, orderBy: object) {
  return db.product.findMany({
    where,
    orderBy,
    include: {
      variants: { orderBy: { priceCents: "asc" } },
      // card image + the first gallery image (hover cross-fade), a few rows per product
      media: {
        where: { kind: { in: ["CARD", "GALLERY"] } },
        orderBy: { sortOrder: "asc" },
      },
      bundle: {
        select: {
          id: true,
          priceCents: true,
          items: { select: { quantity: true, variant: { select: { priceCents: true } } } },
        },
      },
    },
  });
}

async function fetchRatings(productIds: string[]) {
  const rows = await db.review.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, status: "PUBLISHED" },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return new Map(
    rows.map((row) => [
      row.productId,
      { average: row._avg.rating ?? 0, count: row._count.rating },
    ]),
  );
}

export function toCatalogProduct(
  product: ProductRow,
  ratings: Map<string, { average: number; count: number }>,
  reductions: Map<string, PriceReduction>,
  lowStockThreshold: number,
): CatalogProduct | null {
  const variant = product.variants[0];
  if (!variant) return null;
  const rating = ratings.get(product.id);
  const card = product.media.find((image) => image.kind === "CARD") ?? null;
  // the first gallery view that is not the card image itself
  const gallery = product.media.find((image) => image.kind === "GALLERY" && image.url !== card?.url) ?? null;
  const soldOut = variant.stock <= 0 && !variant.allowBackorder;
  return {
    slug: product.slug,
    title: product.title,
    variantId: variant.id,
    sku: variant.sku,
    priceCents: variant.priceCents,
    reduction: reductions.get(variant.id) ?? null,
    stock: variant.stock,
    soldOut,
    lowStock: soldOut ? null : lowStockUnits(variant.stock, lowStockThreshold),
    backorderNote: variant.stock <= 0 && variant.allowBackorder ? variant.backorderNote : null,
    maxCartQuantity: variant.maxCartQuantity,
    imageUrl: card?.url ?? null,
    imageAlt: card?.alt ?? product.title,
    hoverImageUrl: gallery?.url ?? null,
    badges: parseBadges(product.badges),
    variantCount: product.variants.length,
    rating:
      rating && rating.count > 0
        ? { average: rating.average, count: rating.count }
        : null,
    unitPrice: parseUnitPrice(product.customFields),
    isBundle: product.bundle !== null,
    bundleSavings: bundleSavingsFor(product.bundle),
    createdAt: product.createdAt,
  };
}

/** Catalog products for /trgovina (sorted in JS — tiny catalog by design). */
export async function getCatalogProducts(options?: {
  collectionSlug?: string;
}): Promise<CatalogProduct[]> {
  const where = {
    status: "ACTIVE" as const,
    visibleInCatalog: true,
    ...(options?.collectionSlug
      ? { collections: { some: { collection: { slug: options.collectionSlug } } } }
      : {}),
  };
  const rows = await fetchProducts(where, { createdAt: "asc" });
  const [ratings, reductions, lowStockThreshold] = await Promise.all([
    fetchRatings(rows.map((row) => row.id)),
    // card variant = cheapest (variants are ordered by price) — one batched history query
    getPriceReductions(
      rows.flatMap((row) =>
        row.variants[0]
          ? [{ variantId: row.variants[0].id, priceCents: row.variants[0].priceCents, compareAtPriceCents: row.variants[0].compareAtPriceCents }]
          : [],
      ),
    ),
    getLowStockThreshold(),
  ]);

  let products = rows
    // HIDE (§14.2): a fully sold-out product without backorders leaves the lists.
    .filter((row) => row.soldOutBehavior !== "HIDE" || row.variants.some((variant) => variant.stock > 0 || variant.allowBackorder))
    .map((row) => toCatalogProduct(row, ratings, reductions, lowStockThreshold))
    .filter((row): row is CatalogProduct => row !== null);

  if (options?.collectionSlug) {
    // manual merchandising order = CollectionProduct position
    const order = await db.collectionProduct.findMany({
      where: { collection: { slug: options.collectionSlug } },
      orderBy: { position: "asc" },
      select: { product: { select: { slug: true } }, position: true },
    });
    const rank = new Map(order.map((row) => [row.product.slug, row.position]));
    products = [...products].sort(
      (a, b) => (rank.get(a.slug) ?? 99) - (rank.get(b.slug) ?? 99),
    );
  }

  return products;
}
