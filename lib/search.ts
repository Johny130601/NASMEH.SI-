import { z } from "zod";
import { db } from "@/lib/db";

/** /api/search + /iskanje input contract (AGENTS §8.2). */
export const searchQuerySchema = z.string().trim().min(1).max(80);

/** Parse a raw ?q value; returns "" for anything unusable (never throws). */
export function parseSearchQuery(raw: string | null | undefined): string {
  const parsed = searchQuerySchema.safeParse(raw ?? "");
  return parsed.success ? parsed.data : "";
}

export interface SearchResult {
  slug: string;
  title: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  imageUrl: string | null;
  imageAlt: string;
  stock: number;
  soldOut: boolean;
  variantId: string;
  sku: string;
}

/**
 * Site search (§3.1): Postgres ILIKE over title/description/customFields,
 * words AND-ed. Wildcard metacharacters in the query are escaped.
 * Shared by /api/search (instant) and /iskanje (SSR results page).
 */
export async function searchProducts(
  query: string,
  limit = 24,
): Promise<SearchResult[]> {
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (words.length === 0) return [];

  const escaped = words.map((word) => word.replace(/[%_\\]/g, "\\$&"));
  const whereClause = escaped
    .map(
      (_word, index) =>
        `(p."title" ILIKE '%' || $${index + 1} || '%' ESCAPE '\\'
          OR p."description" ILIKE '%' || $${index + 1} || '%' ESCAPE '\\'
          OR p."customFields"::text ILIKE '%' || $${index + 1} || '%' ESCAPE '\\')`,
    )
    .join(" AND ");

  const rows = await db.$queryRawUnsafe<
    Array<{
      slug: string;
      title: string;
      priceCents: number | null;
      compareAtPriceCents: number | null;
      stock: number | null;
      allowBackorder: boolean | null;
      imageUrl: string | null;
      imageAlt: string | null;
      variantId: string | null;
      sku: string | null;
    }>
  >(
    `SELECT p."slug", p."title",
            v."priceCents", v."compareAtPriceCents", v."stock", v."allowBackorder",
            v."id" AS "variantId", v."sku",
            m."url" AS "imageUrl", m."alt" AS "imageAlt"
     FROM "Product" p
     LEFT JOIN LATERAL (
       SELECT * FROM "Variant" sv
       WHERE sv."productId" = p."id"
       ORDER BY sv."priceCents" ASC
       LIMIT 1
     ) v ON true
     LEFT JOIN LATERAL (
       SELECT * FROM "MediaImage" sm
       WHERE sm."productId" = p."id" AND sm."kind" = 'CARD'
       ORDER BY sm."sortOrder" ASC
       LIMIT 1
     ) m ON true
     WHERE p."status" = 'ACTIVE' AND p."visibleInSearch" = true
       AND (p."soldOutBehavior" <> 'HIDE' OR EXISTS (
         SELECT 1 FROM "Variant" hv WHERE hv."productId" = p."id" AND (hv."stock" > 0 OR hv."allowBackorder")))
       AND ${whereClause}
     ORDER BY p."createdAt" ASC
     LIMIT ${Math.min(Math.max(limit, 1), 50)}`,
    ...escaped,
  );

  return rows
    .filter((row) => row.priceCents !== null)
    .map((row) => ({
      slug: row.slug,
      title: row.title,
      priceCents: row.priceCents!,
      compareAtPriceCents: row.compareAtPriceCents,
      imageUrl: row.imageUrl,
      imageAlt: row.imageAlt ?? row.title,
      stock: row.stock ?? 0,
      soldOut: (row.stock ?? 0) <= 0 && !row.allowBackorder,
      variantId: row.variantId ?? "",
      sku: row.sku ?? row.slug,
    }));
}
