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
  // Static security headers on every response (pages and API); the CSP with
  // its per-request nonce is added by the middleware (lib/security/headers.ts).
  async headers() {
    return [{ source: "/(.*)", headers: STATIC_SECURITY_HEADERS.map(({ key, value }) => ({ key, value })) }];
  },
};

export default nextConfig;
