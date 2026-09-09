import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/** robots.txt (§3.3): utility/cart/account routes disallowed. */
export default function robots(): MetadataRoute.Robots {
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
        "/admin",
        "/api",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
