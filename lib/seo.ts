import type { Metadata } from "next";
import { common } from "@/lib/copy/common";

// A raster file: Facebook, X and LinkedIn do not render SVG share images (QA 2026-09-29, T1-16).
const DEFAULT_OG_IMAGE = "/og-default.png";

/**
 * Public origin of the store (canonicals, sitemap, mail links, coupon links),
 * read at request time from the host's `.env`. The key is assembled so the
 * build cannot inline it: one image serves staging and production with their
 * own NEXT_PUBLIC_SITE_URL (Phase 9 step 5). Server-only; client code never
 * needs the absolute origin.
 */
const SITE_URL_KEY = ["NEXT_PUBLIC", "SITE_URL"].join("_");

export function siteUrl(): string {
  return (process.env[SITE_URL_KEY] ?? "http://localhost:3000").replace(/\/$/, "");
}

export interface SeoDefaultsLike {
  titleTemplate: string;
  description: string;
  indexable: boolean;
}

/** Root-layout metadata from the `seo.defaults` Setting: title template, default description, site-wide noindex switch. */
export function rootMetadata(defaults: SeoDefaultsLike, googleVerification: string | null): Metadata {
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: common.siteName, template: defaults.titleTemplate },
    description: defaults.description || common.siteTagline,
    openGraph: {
      siteName: common.siteName,
      locale: "sl_SI",
      type: "website",
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 628 }],
    },
    twitter: { card: "summary_large_image" },
    ...(defaults.indexable ? {} : { robots: { index: false, follow: false } }),
    ...(googleVerification ? { verification: { google: googleVerification } } : {}),
  };
}

export interface SeoInput {
  title: string;
  description?: string;
  path?: string; // "" or "/slug" → canonical
  noindex?: boolean;
  image?: string;
}

/**
 * A product page's canonical path (one product per /izdelek/<slug>): its Open
 * Graph type is "product", every other page's "website" (QA 2026-10-03).
 * Next's `openGraph.type` has no "product" (an unknown type throws while the
 * head renders), so a product page's og:type goes out through `other` — Next
 * writes it as `<meta name="og:type">`, which Open Graph readers accept — and
 * its openGraph block carries no type of its own, nor the layout's "website".
 */
const PRODUCT_PATH = /^\/izdelek\/[^/?#]+$/;

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
  const product = PRODUCT_PATH.test(path);
  // A page without its own description must not override the root layout's default with
  // `undefined` (Next merges the key, and the page then has no meta description — QA T7-F7).
  const described = description ? { description } : {};
  const openGraph = {
    title,
    ...described,
    url,
    siteName: common.siteName,
    locale: "sl_SI",
    images: [{ url: ogImage, width: 1200, height: 628 }],
  };
  return {
    title,
    ...described,
    alternates: { canonical: url },
    ...(noindex
      ? { robots: { index: false, follow: false } }
      : {}),
    ...(product ? { other: { "og:type": "product" } } : {}),
    openGraph: product ? openGraph : { ...openGraph, type: "website" as const },
    twitter: {
      card: "summary_large_image",
      title,
      ...described,
      images: [ogImage],
    },
  };
}
