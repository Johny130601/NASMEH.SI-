import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./lib/security/headers";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Four review images at 2 MB each, plus multipart form overhead.
    serverActions: { bodySizeLimit: "10mb" },
  },
  // pdfkit loads AFM font data relative to the package — keep it unbundled
  serverExternalPackages: ["pdfkit"],
  // pdfkit loads AFM font data from disk at runtime — trace it into standalone
  outputFileTracingIncludes: {
    "*": ["./node_modules/pdfkit/js/data/**/*"],
  },
  // The persistent media volumes are read at request time through their routes
  // (AGENTS §2 Media). File tracing follows the path.join(process.cwd(), …)
  // reads and would copy whatever sits there at build time — private review and
  // ticket photos included — into .next/standalone, where start-standalone.cjs
  // then refuses to start. The Docker context excludes them already; a build on
  // any other Linux host must not ship them either (QA 2026-09-29 fix pass).
  // Next 15.5 matches these globs against backslash paths on Windows, where they
  // never apply: build there with the three directories empty, as the Docker
  // context is.
  outputFileTracingExcludes: {
    "*": ["./review-uploads/**/*", "./support-uploads/**/*", "./catalog-uploads/**/*"],
  },
  // Static security headers on every response (pages and API); the CSP with
  // its per-request nonce is added by the middleware (lib/security/headers.ts).
  async headers() {
    return [
      { source: "/(.*)", headers: STATIC_SECURITY_HEADERS.map(({ key, value }) => ({ key, value })) },
      // Self-hosted fonts never change under their names: cache them for a year
      // (Next caches only its hashed chunks that way; public/ files get max-age=0).
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // Committed placeholder artwork until the real media (gate D2) arrives
      // through the media library, which serves its files immutable itself.
      { source: "/uploads/placeholder-:file", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
    ];
  },
};

export default nextConfig;
