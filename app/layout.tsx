import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { getGoogleVerification, getSeoDefaults } from "@/lib/settings";
import { rootMetadata } from "@/lib/seo";
import { DEFAULT_SEO_DEFAULTS } from "@/lib/settings-schemas";

export async function generateMetadata(): Promise<Metadata> {
  // DB may be unreachable during image builds (no DATABASE_URL) — degrade
  // to the default metadata without the GSC verification tag.
  try {
    const [defaults, googleVerification] = await Promise.all([getSeoDefaults(), getGoogleVerification()]);
    return rootMetadata(defaults, googleVerification || null);
  } catch {
    return rootMetadata(DEFAULT_SEO_DEFAULTS, null);
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sl">
      <body>{children}</body>
    </html>
  );
}
