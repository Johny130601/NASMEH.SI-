import type { Prisma, ProductStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseBadges } from "@/lib/catalog";
import { likeEscaped } from "./like";

/** Catalog administration (§14.2, §14.3, §14.6): schemas, JSON parsers and queries. */

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const BADGE_STYLES = ["outline", "solid", "grey", "warning", "promo"] as const;
export const SOLD_OUT_BEHAVIOURS = ["NOTIFY", "HIDE"] as const;
export const MEDIA_KINDS = ["GALLERY", "CARD", "HERO"] as const;

export const slugSchema = z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const skuSchema = z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9-]*$/);
const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);

export const productBasicsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: slugSchema,
  status: z.enum(PRODUCT_STATUSES),
  description: z.string().max(5000),
  seoTitle: optionalText(200),
  seoDescription: optionalText(320),
  visibleInCatalog: z.boolean(),
  visibleInSearch: z.boolean(),
  hiddenDeal: z.boolean(),
  klarnaEligible: z.boolean(),
  soldOutBehavior: z.enum(SOLD_OUT_BEHAVIOURS),
});
export type ProductBasics = z.input<typeof productBasicsSchema>;

export const badgesSchema = z.array(z.object({ label: z.string().trim().min(1).max(30), style: z.enum(BADGE_STYLES) })).max(4);

export const merchandisingSchema = z.object({
  uspChips: z.array(z.string().trim().min(1).max(40)).max(3),
  intro: z.string().trim().max(600),
  bullets: z.array(z.string().trim().min(1).max(120)).max(6),
  unitPrice: z.object({ quantity: z.number().int().positive().max(10_000), unit: z.string().trim().min(1).max(30) }).nullable(),
  crossSell: z.array(slugSchema).max(6),
  /** Free-form metafields (the HiSmile pattern) kept alongside the structured keys. */
  extraJson: z.string().max(20_000),
});
export type Merchandising = z.input<typeof merchandisingSchema>;

export const accordionsSchema = z.object({
  howItWorks: z.string().max(8000),
  inci: z.string().max(8000),
  guarantee: z.string().max(8000),
  tested: z.string().max(8000),
});
export const faqSchema = z.array(z.object({ q: z.string().trim().min(1).max(200), a: z.string().trim().min(1).max(1000) })).max(12);
export const educationSchema = z.array(z.object({ heading: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(1500) })).max(6);

export const productContentSchema = z.object({
  badges: badgesSchema,
  merchandising: merchandisingSchema,
  accordions: accordionsSchema,
  faq: faqSchema,
  education: educationSchema,
});
export type ProductContent = z.input<typeof productContentSchema>;

export const variantSchema = z.object({
  title: z.string().trim().max(120),
  sku: skuSchema,
  priceCents: z.number().int().min(0).max(10_000_000),
  compareAtPriceCents: z.number().int().min(0).max(10_000_000).nullable(),
  costCents: z.number().int().min(0).max(10_000_000).nullable(),
  barcode: optionalText(40),
  weightGrams: z.number().int().min(0).max(100_000).nullable(),
  // A backordered variant's stock may stand below zero; the save writes stock only when the
  // operator changed the figure, and a new figure must be ≥ 0 (QA 2026-10-03 T5-02).
  stock: z.number().int().min(-1_000_000).max(1_000_000),
  maxCartQuantity: z.number().int().min(1).max(20),
  allowBackorder: z.boolean(),
  backorderNote: optionalText(160),
}).refine((value) => value.compareAtPriceCents === null || value.compareAtPriceCents > value.priceCents, {
  message: "compareAt", path: ["compareAtPriceCents"],
});
export type VariantInput = z.input<typeof variantSchema>;

export const collectionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: slugSchema,
  seoTitle: optionalText(200),
  seoDescription: optionalText(320),
  noindex: z.boolean(),
  hideBannerText: z.boolean(),
});
export type CollectionInput = z.input<typeof collectionSchema>;

export const bundleSchema = z.object({
  productId: z.string().min(1).max(64),
  priceCents: z.number().int().min(0).max(10_000_000),
  active: z.boolean(),
  items: z.array(z.object({ variantId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(10) })).min(1).max(10),
});
export type BundleInput = z.input<typeof bundleSchema>;

export const lowStockSchema = z.object({ lowStockThreshold: z.number().int().min(0).max(1000) });

/** Editor fields a failed product save can name (QA T6-11); the keys match the editor's labels in lib/copy/admin.ts. */
export const PRODUCT_FIELD_KEYS = [
  "title", "slug", "description", "seoTitle", "seoDescription",
  "badges", "uspChips", "intro", "bullets", "unitPrice", "crossSell", "extraJson",
  "howItWorks", "inci", "guarantee", "tested", "faq", "education",
] as const;
export type ProductFieldKey = (typeof PRODUCT_FIELD_KEYS)[number];

/** Fields of the "Nov izdelek" form a refused create names (QA v-a); the keys match its inputs' names. */
export const PRODUCT_CREATE_FIELDS = ["title", "slug", "sku", "priceCents"] as const;
export type ProductCreateField = (typeof PRODUCT_CREATE_FIELDS)[number];

/** The first editor field a validation issue path names (e.g. ["content", "merchandising", "uspChips", 0] → "uspChips"). */
export function productIssueField(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): ProductFieldKey | null {
  for (const issue of issues) {
    const key = issue.path.find((segment): segment is ProductFieldKey => typeof segment === "string" && (PRODUCT_FIELD_KEYS as readonly string[]).includes(segment));
    if (key) return key;
  }
  return null;
}

/** Product stock state for the admin list (QA T6-14): sold out and low read as words, not only as a colour. */
export function productStockLevel(variants: Array<{ stock: number; allowBackorder: boolean }>, threshold: number): "out" | "low" | null {
  const tracked = variants.filter((variant) => !variant.allowBackorder);
  if (tracked.length === 0) return null;
  if (tracked.length === variants.length && tracked.every((variant) => variant.stock <= 0)) return "out";
  return tracked.some((variant) => variant.stock <= threshold) ? "low" : null;
}

// ---------- JSON ↔ editor ----------

const STRUCTURED_KEYS = new Set(["uspChips", "intro", "bullets", "unitPrice", "crossSell"]);

export function parseMerchandising(json: unknown): Merchandising {
  const record = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  const strings = (value: unknown, max: number) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").slice(0, max) : [];
  const unit = record.unitPrice as { quantity?: unknown; unit?: unknown } | undefined;
  const extra = Object.fromEntries(Object.entries(record).filter(([key]) => !STRUCTURED_KEYS.has(key)));
  return {
    uspChips: strings(record.uspChips, 3),
    intro: typeof record.intro === "string" ? record.intro : "",
    bullets: strings(record.bullets, 6),
    unitPrice: unit && typeof unit.quantity === "number" && typeof unit.unit === "string" ? { quantity: unit.quantity, unit: unit.unit } : null,
    crossSell: strings(record.crossSell, 6),
    extraJson: Object.keys(extra).length ? JSON.stringify(extra, null, 2) : "",
  };
}

/** Structured keys win; the free-form JSON must be an object and may not shadow them. */
export function buildCustomFields(input: z.output<typeof merchandisingSchema>): { ok: true; value: Prisma.InputJsonObject } | { ok: false } {
  let extra: Record<string, unknown> = {};
  if (input.extraJson.trim()) {
    try {
      const parsed: unknown = JSON.parse(input.extraJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
      extra = Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([key]) => !STRUCTURED_KEYS.has(key)));
    } catch {
      return { ok: false };
    }
  }
  return {
    ok: true,
    value: {
      ...(extra as Prisma.InputJsonObject),
      uspChips: input.uspChips,
      intro: input.intro,
      bullets: input.bullets,
      ...(input.unitPrice ? { unitPrice: input.unitPrice } : {}),
      crossSell: input.crossSell,
    },
  };
}

export function parseAccordions(json: unknown): z.input<typeof accordionsSchema> {
  const record = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  const text = (key: string) => (typeof record[key] === "string" ? record[key] as string : "");
  return { howItWorks: text("howItWorks"), inci: text("inci"), guarantee: text("guarantee"), tested: text("tested") };
}

export function parseFaq(json: unknown): z.input<typeof faqSchema> {
  return Array.isArray(json)
    ? json.filter((entry): entry is { q: string; a: string } => !!entry && typeof entry === "object" && typeof (entry as { q?: unknown }).q === "string" && typeof (entry as { a?: unknown }).a === "string")
      .map((entry) => ({ q: entry.q, a: entry.a })).slice(0, 12)
    : [];
}

export function parseEducation(json: unknown): z.input<typeof educationSchema> {
  return Array.isArray(json)
    ? json.filter((entry): entry is { heading: string; body: string } => !!entry && typeof entry === "object" && typeof (entry as { heading?: unknown }).heading === "string" && typeof (entry as { body?: unknown }).body === "string")
      .map((entry) => ({ heading: entry.heading, body: entry.body })).slice(0, 6)
    : [];
}

export function parseBadgesForEditor(json: unknown): z.input<typeof badgesSchema> {
  return parseBadges(json).map((badge) => ({ label: badge.label, style: badge.style }));
}

/** Listing rule shared by catalog, search and sitemap: HIDE removes fully sold-out products. */
export function productIsListed(product: {
  status: ProductStatus;
  visibleInCatalog: boolean;
  soldOutBehavior: "NOTIFY" | "HIDE";
  variants: Array<{ stock: number; allowBackorder: boolean }>;
}): boolean {
  if (product.status !== "ACTIVE" || !product.visibleInCatalog) return false;
  if (product.soldOutBehavior === "HIDE") return product.variants.some((variant) => variant.stock > 0 || variant.allowBackorder);
  return true;
}

// ---------- queries ----------

export interface ProductFilters { q: string; status: ProductStatus | null }

export function parseProductFilters(query: Record<string, string | string[] | undefined>): ProductFilters {
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value ?? "").trim();
  const status = single(query.status).toUpperCase();
  return { q: single(query.q).slice(0, 120), status: (PRODUCT_STATUSES as readonly string[]).includes(status) ? status as ProductStatus : null };
}

export const PRODUCT_LIST_LIMIT = 500;

export async function listProducts(filters: ProductFilters) {
  return db.product.findMany({
    take: PRODUCT_LIST_LIMIT,
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q ? { OR: [{ title: { contains: likeEscaped(filters.q), mode: "insensitive" } }, { slug: { contains: likeEscaped(filters.q), mode: "insensitive" } }, { variants: { some: { sku: { contains: likeEscaped(filters.q), mode: "insensitive" } } } }] } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, title: true, slug: true, status: true, visibleInCatalog: true, hiddenDeal: true, soldOutBehavior: true, updatedAt: true, badges: true,
      variants: { select: { sku: true, priceCents: true, stock: true, allowBackorder: true }, orderBy: { priceCents: "asc" } },
      bundle: { select: { id: true } },
      media: { where: { kind: "CARD" }, orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } },
      _count: { select: { backInStock: true } },
    },
  });
}

export async function loadProductEditor(id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: {
      variants: {
        orderBy: { createdAt: "asc" },
        include: { priceHistory: { orderBy: { createdAt: "desc" }, take: 8 }, _count: { select: { orderItems: true, bundleItems: true, priceHistory: true } } },
      },
      media: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
      collections: { select: { collectionId: true, position: true } },
      bundle: { select: { id: true, priceCents: true, active: true } },
    },
  });
  if (!product) return null;
  const [collections, subscribers, activeProducts] = await Promise.all([
    db.collection.findMany({ select: { id: true, title: true, slug: true }, orderBy: { title: "asc" } }),
    db.backInStockSubscription.groupBy({ by: ["status"], where: { productId: id }, _count: { _all: true } }),
    db.product.findMany({ where: { status: "ACTIVE", id: { not: id } }, select: { slug: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  const notified = await db.backInStockSubscription.count({ where: { productId: id, status: "CONFIRMED", notifiedAt: { not: null } } });
  const counts = { PENDING: 0, CONFIRMED: 0, UNSUBSCRIBED: 0 };
  for (const group of subscribers) counts[group.status] = group._count._all;
  return {
    ...product,
    collections: collections.map((collection) => ({ ...collection, member: product.collections.some((entry) => entry.collectionId === collection.id) })),
    subscribers: { ...counts, notified, armable: counts.CONFIRMED - notified },
    crossSellOptions: activeProducts,
  };
}

export async function listCollections() {
  return db.collection.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, slug: true, noindex: true, bannerImage: true, updatedAt: true, _count: { select: { products: true } } },
  });
}

export async function loadCollection(id: string) {
  const collection = await db.collection.findUnique({
    where: { id },
    include: { products: { orderBy: { position: "asc" }, include: { product: { select: { id: true, title: true, slug: true, status: true } } } } },
  });
  if (!collection) return null;
  const memberIds = new Set(collection.products.map((entry) => entry.productId));
  const candidates = await db.product.findMany({
    where: { id: { notIn: [...memberIds] }, status: { in: ["ACTIVE", "DRAFT"] } },
    select: { id: true, title: true, slug: true }, orderBy: { title: "asc" },
  });
  return { ...collection, candidates };
}

export async function listBundles() {
  return db.product.findMany({
    where: { bundle: { isNot: null } },
    select: { id: true, title: true, slug: true, status: true, bundle: { select: { priceCents: true, active: true, items: { select: { quantity: true, variant: { select: { sku: true, priceCents: true } } } } } } },
    orderBy: { title: "asc" },
  });
}

/** Products that can become bundles: no bundle yet; plus the components a bundle may contain. */
export async function bundleOptions(productId?: string) {
  const [products, variants] = await Promise.all([
    db.product.findMany({ where: { bundle: null }, select: { id: true, title: true, slug: true, status: true }, orderBy: { title: "asc" } }),
    db.variant.findMany({
      where: { product: { bundle: null, ...(productId ? { id: { not: productId } } : {}) } },
      select: { id: true, sku: true, title: true, priceCents: true, product: { select: { title: true } } },
      orderBy: [{ product: { title: "asc" } }, { sku: "asc" }],
    }),
  ]);
  return { products, variants };
}

export async function loadBundle(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true, title: true, slug: true, status: true,
      variants: { select: { id: true, sku: true, priceCents: true, maxCartQuantity: true, stock: true }, orderBy: { createdAt: "asc" } },
      bundle: { include: { items: { include: { variant: { select: { id: true, sku: true, title: true, priceCents: true, product: { select: { title: true } } } } }, orderBy: { id: "asc" } } } },
    },
  });
  if (!product) return null;
  return { ...product, options: await bundleOptions(productId) };
}
