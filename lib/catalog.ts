import { db } from "@/lib/db";
import { getPriceReductions } from "@/lib/omnibus";
import { getLowStockThreshold } from "@/lib/settings";
import { bundleSavings, type BundleSavings, type PriceReduction } from "@/lib/pricing";
import { PURCHASABLE_PRODUCT_WHERE } from "@/lib/cart/visibility";
import { isSoldOut, productHasSellableUnits, sellableStock } from "@/lib/bundle/availability";
import { catalog as copy } from "@/lib/copy/catalog";

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
  /** Units the shopper can buy: a bundle's is what its components can fill (lib/bundle/availability). */
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
   * prices against the price on this card (`priceCents`), only when the bundle
   * costs less and no Art. 6a reduction is announced for it. Not an Art. 6a
   * reduction — the card renders it as a value line, never as a strikethrough.
   */
  bundleSavings: BundleSavings | null;
  /**
   * A fixed bundle's components (title and quantity, stored order) for the cards that list them.
   * Empty for a plain product — and for a bundle with a component the catalog may not name (a
   * draft or a hidden deal SKU): the list is all or nothing, never a partial "V paketu" claim, and
   * a hidden product's name leaks through no card (cart.spec visibility, 2026-10-10 run 1).
   */
  bundleComponents: BundleComponentTitle[];
  createdAt: Date;
}

/** One component of a fixed bundle as a card lists it. */
export interface BundleComponentTitle {
  title: string;
  quantity: number;
}

export interface Badge {
  label: string;
  style: "outline" | "solid" | "grey" | "warning" | "promo";
}

/** A collection as /trgovina renders it (§14.3): tab, banner, SEO fields. */
export interface CatalogCollection {
  slug: string;
  title: string;
  bannerImage: string | null;
  bannerImageMobile: string | null;
  hideBannerText: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  noindex: boolean;
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

/**
 * Admin badges a card or PDP may show. A badge that merely says "sold out" is
 * dropped: the computed sold-out pill states that when it is true, and an
 * admin badge left on a restocked product would state it when it is not
 * (UCPD Annex I point 7 — AGENTS §8.23).
 */
export function displayBadges(badges: Badge[]): Badge[] {
  const soldOutLabel = copy.card.soldOut.trim().toLocaleLowerCase("sl");
  return badges.filter((badge) => badge.label.trim().toLocaleLowerCase("sl") !== soldOutLabel);
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

/**
 * The bundle's value line input, or null when it saves nothing (or is no
 * bundle). Measured against `priceCents` — the variant price the shopper is
 * shown and charged, never `Bundle.priceCents`: a figure computed from a price
 * nobody pays is a false price advantage (UCPD Art. 6(1)(d)). An announced
 * Art. 6a reduction suppresses the line: the strikethrough and its 30-day line
 * are the mandated display and two percentages on one card invite a misreading.
 */
export function bundleSavingsFor(
  bundle: { items: Array<{ quantity: number; variant: { priceCents: number } }> } | null,
  priceCents: number,
  reduction: PriceReduction | null = null,
): BundleSavings | null {
  if (!bundle || bundle.items.length === 0 || reduction) return null;
  const savings = bundleSavings(
    bundle.items.map((item) => item.variant.priceCents * item.quantity),
    priceCents,
  );
  return savings.savingsCents > 0 ? savings : null;
}

const BASIC_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

/**
 * Operator HTML as plain text: tags out, block boundaries as spaces, basic
 * entities decoded, whitespace collapsed. For meta descriptions, JSON-LD and
 * the search index — never for rendering (that is `sanitizeContentHtml`).
 */
export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
      if (body[0] === "#") {
        const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return BASIC_ENTITIES[body.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** A meta description from the rich description: plain text, cut at a word under `max` characters. */
export function descriptionSummary(html: string, max = 160): string {
  const text = plainTextFromHtml(html);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** The human-readable product text a shopper could search for (lib/search): title apart, the rest joined. */
export interface ProductSearchText {
  title: string;
  body: string;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/**
 * Text a shopper might type, and nothing else: the title, the description,
 * the merchandising text inside `customFields` (intro, bullets, USP chips)
 * and the accordion, FAQ and education copy. Slugs, JSON keys, cross-sell
 * handles and free-form metafields are left out — a search for "serum" must
 * not match every product that cross-sells the serum (QA L7).
 */
export function productSearchText(product: {
  title: string;
  description: string;
  customFields: unknown;
  accordions: unknown;
  faq: unknown;
  education: unknown;
}): ProductSearchText {
  const fields = product.customFields && typeof product.customFields === "object" && !Array.isArray(product.customFields)
    ? (product.customFields as Record<string, unknown>)
    : {};
  const accordions = product.accordions && typeof product.accordions === "object" && !Array.isArray(product.accordions)
    ? Object.values(product.accordions as Record<string, unknown>).filter((value): value is string => typeof value === "string")
    : [];
  const faq = Array.isArray(product.faq)
    ? product.faq.flatMap((entry) => (entry && typeof entry === "object" ? strings([(entry as { q?: unknown }).q, (entry as { a?: unknown }).a]) : []))
    : [];
  const education = Array.isArray(product.education)
    ? product.education.flatMap((entry) => (entry && typeof entry === "object" ? strings([(entry as { heading?: unknown }).heading, (entry as { body?: unknown }).body]) : []))
    : [];
  const body = [
    plainTextFromHtml(product.description),
    typeof fields.intro === "string" ? fields.intro : "",
    ...strings(fields.bullets),
    ...strings(fields.uspChips),
    ...accordions.map(plainTextFromHtml),
    ...faq,
    ...education,
  ]
    .filter(Boolean)
    .join(" ");
  return { title: product.title, body };
}

/**
 * Whether a claim the product page shows carries the "^" marker that the
 * guarantee accordion's title resolves (QA T1-14): the title, the description,
 * the customFields text and the accordion, FAQ and education copy. The
 * guarantee accordion's own body is the resolution, not a claim, so it does
 * not count.
 */
export function hasCaretClaim(product: Parameters<typeof productSearchText>[0]): boolean {
  const accordions = product.accordions && typeof product.accordions === "object" && !Array.isArray(product.accordions)
    ? Object.fromEntries(Object.entries(product.accordions as Record<string, unknown>).filter(([key]) => key !== "guarantee"))
    : product.accordions;
  const text = productSearchText({ ...product, accordions });
  return text.title.includes("^") || text.body.includes("^");
}

type ProductRow = Awaited<ReturnType<typeof fetchProducts>>[number];

/** The component lines a card may print: every component, or none when one of them is not listable itself. */
export function listableBundleComponents(
  bundle: { items: Array<{ quantity: number; variant: { product: { title: string; status: string; hiddenDeal: boolean } } }> } | null,
): BundleComponentTitle[] {
  if (!bundle || bundle.items.length === 0) return [];
  if (bundle.items.some((item) => item.variant.product.status !== "ACTIVE" || item.variant.product.hiddenDeal)) return [];
  return bundle.items.map((item) => ({ title: item.variant.product.title, quantity: item.quantity }));
}

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
      // a bundle's availability is its components' (lib/bundle/availability)
      bundle: {
        select: {
          id: true,
          priceCents: true,
          active: true,
          // the component product's title names the line on a wide or home bundle card (a variant title names a size or flavour)
          items: { orderBy: { id: "asc" as const }, select: { quantity: true, variant: { select: { priceCents: true, stock: true, allowBackorder: true, product: { select: { title: true, status: true, hiddenDeal: true } } } } } },
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
  const availability = sellableStock(variant, product.bundle);
  const soldOut = isSoldOut(availability);
  const reduction = reductions.get(variant.id) ?? null;
  return {
    slug: product.slug,
    title: product.title,
    variantId: variant.id,
    sku: variant.sku,
    priceCents: variant.priceCents,
    reduction,
    stock: availability.stock,
    soldOut,
    lowStock: soldOut ? null : lowStockUnits(availability.stock, lowStockThreshold),
    backorderNote: availability.stock <= 0 && availability.allowBackorder ? variant.backorderNote : null,
    maxCartQuantity: variant.maxCartQuantity,
    imageUrl: card?.url ?? null,
    imageAlt: card?.alt ?? product.title,
    hoverImageUrl: gallery?.url ?? null,
    badges: displayBadges(parseBadges(product.badges)),
    variantCount: product.variants.length,
    rating:
      rating && rating.count > 0
        ? { average: rating.average, count: rating.count }
        : null,
    unitPrice: parseUnitPrice(product.customFields),
    isBundle: product.bundle !== null,
    bundleSavings: bundleSavingsFor(product.bundle, variant.priceCents, reduction),
    bundleComponents: listableBundleComponents(product.bundle),
    createdAt: product.createdAt,
  };
}

/** Which visibility flag the list honours (§14.2): the catalog's or the search's. */
export type CatalogSurface = "catalog" | "search";

/** The rows a public surface may list, with the card inputs batched (one history query, one ratings query). */
async function loadListedProducts(options?: { collectionSlug?: string; surface?: CatalogSurface }) {
  const where = {
    ...PURCHASABLE_PRODUCT_WHERE,
    ...(options?.surface === "search" ? { visibleInSearch: true } : { visibleInCatalog: true }),
    ...(options?.collectionSlug
      ? { collections: { some: { collection: { slug: options.collectionSlug } } } }
      : {}),
  };
  const rows = (await fetchProducts(where, { createdAt: "asc" }))
    // HIDE (§14.2): a fully sold-out product without backorders leaves the lists.
    .filter(productHasSellableUnits);
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
  return rows.flatMap((row) => {
    const card = toCatalogProduct(row, ratings, reductions, lowStockThreshold);
    return card ? [{ row, card }] : [];
  });
}

/** Catalog products for /trgovina (sorted in JS — tiny catalog by design). */
export async function getCatalogProducts(options?: {
  collectionSlug?: string;
}): Promise<CatalogProduct[]> {
  let products = (await loadListedProducts({ collectionSlug: options?.collectionSlug })).map((entry) => entry.card);

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

/** Every searchable product with its card and the text the search matches against (lib/search). */
export async function getSearchCatalog(): Promise<Array<{ card: CatalogProduct; text: ProductSearchText }>> {
  const entries = await loadListedProducts({ surface: "search" });
  return entries.map(({ row, card }) => ({ card, text: productSearchText(row) }));
}

/**
 * The collections /trgovina offers as tabs: those with at least one product
 * the catalog lists, oldest first (the seed's merchandising order). A
 * collection whose products are all drafts, hidden or gone has no tab.
 */
export async function getCatalogCollections(): Promise<CatalogCollection[]> {
  const rows = await db.collection.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      slug: true,
      title: true,
      bannerImage: true,
      bannerImageMobile: true,
      hideBannerText: true,
      seoTitle: true,
      seoDescription: true,
      noindex: true,
      products: {
        where: { product: { ...PURCHASABLE_PRODUCT_WHERE, visibleInCatalog: true } },
        select: {
          product: {
            select: {
              soldOutBehavior: true,
              variants: { select: { stock: true, allowBackorder: true } },
              bundle: { select: { items: { select: { quantity: true, variant: { select: { stock: true, allowBackorder: true } } } } } },
            },
          },
        },
      },
    },
  });
  return rows
    .filter((row) => row.products.some((entry) => productHasSellableUnits(entry.product)))
    .map((row) => ({
      slug: row.slug,
      title: row.title,
      bannerImage: row.bannerImage,
      bannerImageMobile: row.bannerImageMobile,
      hideBannerText: row.hideBannerText,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      noindex: row.noindex,
    }));
}
