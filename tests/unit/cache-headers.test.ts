import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { STATIC_SECURITY_HEADERS } from "../../lib/security/headers";

// Phase 9 step 2: static assets outside Next's hashed chunks get an explicit cache policy.
describe("next.config headers()", () => {
  it("keeps the static security headers on every path and caches fonts immutably", async () => {
    const rules = await nextConfig.headers!();
    const every = rules.find((rule) => rule.source === "/(.*)");
    expect(every?.headers).toEqual(STATIC_SECURITY_HEADERS.map(({ key, value }) => ({ key, value })));
    const fonts = rules.find((rule) => rule.source === "/fonts/:path*");
    expect(fonts?.headers).toEqual([{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]);
  });

  it("caches the committed placeholder artwork for a day and nothing else under /uploads", async () => {
    const rules = await nextConfig.headers!();
    const uploads = rules.filter((rule) => rule.source.startsWith("/uploads"));
    expect(uploads).toEqual([
      { source: "/uploads/placeholder-:file", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
    ]);
  });
});
