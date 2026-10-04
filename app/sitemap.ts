import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { productHasSellableUnits } from "@/lib/bundle/availability";
import { PURCHASABLE_PRODUCT_WHERE } from "@/lib/cart/visibility";
import { getCatalogCollections } from "@/lib/catalog";
import { siteUrl } from "@/lib/seo";
import { getMaintenance } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Retired slugs redirect (Phase 6 step 2); never listed even if a row survives. */
const RETIRED_SLUGS = ["pomoc", "o-nas", "razisli", "dostava", "paketi"];

/**
 * Public, indexable routes that are not CMS pages. Everything marked noindex
 * (cart, checkout, account, search, contact, tracking, confirmation and token
 * routes) stays out on purpose; robots.txt disallows the same families.
 */
const INDEXABLE_ROUTES = ["/prijava-nezelenega-ucinka"];

/**
 * Auto sitemap (§3.3, backlog B1): homepage, the catalog page, its indexable
 * collection views, every product the catalog lists — purchasable (ACTIVE, no
 * hidden deal SKU, no withdrawn bundle: lib/cart/visibility) and visible in the
 * catalog; sold-out NOTIFY products stay published, a sold-out HIDE product
 * leaves, a bundle counted by its components' stock — the indexable static
 * routes and the published content pages.
 *
 * A collection is listed at exactly the canonical /trgovina gives it
 * (`/trgovina?kolekcija=<slug>`), and only when /trgovina renders it as a
 * collection: one of the tabs `getCatalogCollections` returns (it lists a
 * product someone can buy) and not marked noindex (QA 2026-10-03).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  // The middleware matcher skips file-like paths, so the maintenance gate (§3.6)
  // is applied here: a locked store listed every ACTIVE product URL to anyone.
  // An unreadable Setting degrades to the public map, like robots.txt does.
  const maintenance = await getMaintenance().catch(() => ({ enabled: false }));
  if (maintenance.enabled) {
    return [{ url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
  }
  const [products, pages, collections] = await Promise.all([
    db.product.findMany({
      where: { ...PURCHASABLE_PRODUCT_WHERE, visibleInCatalog: true },
      select: {
        slug: true,
        updatedAt: true,
        soldOutBehavior: true,
        variants: { select: { stock: true, allowBackorder: true } },
        bundle: { select: { items: { select: { quantity: true, variant: { select: { stock: true, allowBackorder: true } } } } } },
      },
      orderBy: { createdAt: "asc" },
    }).then((rows) => rows.filter(productHasSellableUnits)),
    db.contentPage.findMany({
      where: { published: true, slug: { notIn: RETIRED_SLUGS } },
      select: { slug: true, updatedAt: true },
    }),
    getCatalogCollections().then((rows) => rows.filter((collection) => !collection.noindex)),
  ]);
  const now = new Date();
  const catalogModified = products.reduce(
    (latest, product) => (product.updatedAt > latest ? product.updatedAt : latest),
    new Date(0),
  );

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    {
      url: `${base}/trgovina`,
      lastModified: products.length ? catalogModified : now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...collections.map((collection) => ({
      url: `${base}/trgovina?kolekcija=${encodeURIComponent(collection.slug)}`,
      lastModified: products.length ? catalogModified : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: `${base}/izdelek/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...INDEXABLE_ROUTES.map((path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
    ...pages.map((page) => ({
      url: `${base}/${page.slug}`,
      lastModified: page.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
