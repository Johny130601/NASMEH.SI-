import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Auto sitemap (§3.3): homepage + published content pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await db.contentPage.findMany({
    where: { published: true, slug: { notIn: ["pomoc", "o-nas", "razisli", "dostava", "paketi"] } },
    select: { slug: true, updatedAt: true },
  });
  const base = siteUrl();

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...pages.map((page) => ({
      url: `${base}/${page.slug}`,
      lastModified: page.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
