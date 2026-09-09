import type { NextConfig } from "next";

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
};

export default nextConfig;
