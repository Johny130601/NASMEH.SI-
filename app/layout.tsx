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

/** The one Plus Jakarta Sans subset every page renders (app/globals.css). */
const FONT_FILES = ["/fonts/jakarta-sl.woff2"] as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sl">
      <head>
        {/* Preloading the font takes it off the critical chain (Phase 9 step 2);
            the file is served immutable (next.config.ts). Keep it: the 2026-09-19
            diagnosis showed dropping it buys nothing — the stylesheet references the
            face either way, so it stays on the measured path — while costing every
            first-time visitor a page view in the fallback, with no metrics overrides
            declared to match it. The mobile LCP is not the font's arrival. */}
        {FONT_FILES.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
