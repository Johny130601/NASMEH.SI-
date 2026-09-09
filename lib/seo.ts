import type { Metadata } from "next";
import { common } from "@/lib/copy";

const DEFAULT_OG_IMAGE = "/og-default.svg";

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
}

export interface SeoInput {
  title: string;
  description?: string;
  path?: string; // "" or "/slug" → canonical
  noindex?: boolean;
  image?: string;
}

/** Per-page metadata: canonical, OG, Twitter, noindex (spec §3.3). */
export function buildMetadata({
  title,
  description,
  path = "",
  noindex,
  image,
}: SeoInput): Metadata {
  const url = `${siteUrl()}${path}`;
  const ogImage = image ?? DEFAULT_OG_IMAGE;
  return {
    title,
    description,
    alternates: { canonical: url },
    ...(noindex
      ? { robots: { index: false, follow: false } }
      : {}),
    openGraph: {
      title,
      description,
      url,
      siteName: common.siteName,
      locale: "sl_SI",
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 628 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}
