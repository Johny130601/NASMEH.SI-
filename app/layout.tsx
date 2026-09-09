import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { siteUrl } from "@/lib/seo";
import { common } from "@/lib/copy";

export async function generateMetadata(): Promise<Metadata> {
  // DB may be unreachable during image builds (no DATABASE_URL) — degrade
  // to metadata without the GSC verification tag.
  let googleVerification: string | null = null;
  try {
    googleVerification = await getSetting<string>(SETTING_KEYS.googleVerification);
  } catch {
    googleVerification = null;
  }

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: common.siteName,
      template: `%s | ${common.siteName}`,
    },
    description: common.siteTagline,
    openGraph: {
      siteName: common.siteName,
      locale: "sl_SI",
      type: "website",
      images: [{ url: "/og-default.svg", width: 1200, height: 628 }],
    },
    twitter: { card: "summary_large_image" },
    ...(googleVerification
      ? { verification: { google: googleVerification } }
      : {}),
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sl">
      <body>{children}</body>
    </html>
  );
}
