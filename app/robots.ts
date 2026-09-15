import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";
import { getSeoDefaults } from "@/lib/settings";
import { DEFAULT_SEO_DEFAULTS } from "@/lib/settings-schemas";

export const dynamic = "force-dynamic";

/**
 * robots.txt (§3.3): utility/cart/account routes and the signed token links
 * (confirm, withdraw) disallowed; everything when `seo.defaults.indexable` is off.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // DB may be unreachable during image builds — degrade to the default rules.
  const defaults = await getSeoDefaults().catch(() => DEFAULT_SEO_DEFAULTS);
  if (!defaults.indexable) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/cart",
        "/checkout",
        "/racun",
        "/iskanje",
        "/potrdi",
        "/potrdi-zalogo",
        "/odjava-novice",
        "/odjava-zaloga",
        "/admin",
        "/api",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
