import { db } from "@/lib/db";

/** Shared catalog product shape for cards across all surfaces. */
export interface CatalogProduct {
  slug: string;
  title: string;
  variantId: string;
  sku: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  /** Sold out for display: no stock and no backorder allowed (§14.2). */
  soldOut: boolean;
  backorderNote: string | null;
  maxCartQuantity: number;
  imageUrl: string | null;
  imageAlt: string;
  badges: Badge[];
  variantCount: number;
  rating: { average: number; count: number } | null;
  unitPrice: { quantity: number; unit: string } | null;
  isBundle: boolean;
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

type ProductRow = Awaited<ReturnType<typeof fetchProducts>>[number];

async function fetchProducts(where: object, orderBy: object) {
  return db.product.findMany({
    where,
    orderBy,
    include: {
      variants: { orderBy: { priceCents: "asc" } },
      media: {
        where: { kind: "CARD" },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      bundle: { select: { id: true } },
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
): CatalogProduct | null {
  const variant = product.variants[0];
  if (!variant) return null;
  const rating = ratings.get(product.id);
  return {
    slug: product.slug,
    title: product.title,
    variantId: variant.id,
    sku: variant.sku,
    priceCents: variant.priceCents,
    compareAtPriceCents: variant.compareAtPriceCents,
    stock: variant.stock,
    soldOut: variant.stock <= 0 && !variant.allowBackorder,
    backorderNote: variant.stock <= 0 && variant.allowBackorder ? variant.backorderNote : null,
    maxCartQuantity: variant.maxCartQuantity,
    imageUrl: product.media[0]?.url ?? null,
    imageAlt: product.media[0]?.alt ?? product.title,
    badges: parseBadges(product.badges),
    variantCount: product.variants.length,
    rating:
      rating && rating.count > 0
        ? { average: rating.average, count: rating.count }
        : null,
    unitPrice: parseUnitPrice(product.customFields),
    isBundle: product.bundle !== null,
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
  const ratings = await fetchRatings(rows.map((row) => row.id));

  let products = rows
    // HIDE (§14.2): a fully sold-out product without backorders leaves the lists.
    .filter((row) => row.soldOutBehavior !== "HIDE" || row.variants.some((variant) => variant.stock > 0 || variant.allowBackorder))
    .map((row) => toCatalogProduct(row, ratings))
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
