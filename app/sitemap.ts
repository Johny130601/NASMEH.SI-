import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/seo";

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
 * Auto sitemap (§3.3, backlog B1): homepage, the catalog page, every ACTIVE
 * product that is visible in the catalog (sold-out products stay published),
 * the indexable static routes and the published content pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, pages] = await Promise.all([
    db.product.findMany({
      where: { status: "ACTIVE", visibleInCatalog: true },
      select: { slug: true, updatedAt: true, soldOutBehavior: true, variants: { select: { stock: true, allowBackorder: true } } },
      orderBy: { createdAt: "asc" },
    }).then((rows) => rows.filter((row) => row.soldOutBehavior !== "HIDE" || row.variants.some((variant) => variant.stock > 0 || variant.allowBackorder))),
    db.contentPage.findMany({
      where: { published: true, slug: { notIn: RETIRED_SLUGS } },
      select: { slug: true, updatedAt: true },
    }),
  ]);
  const base = siteUrl();
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
