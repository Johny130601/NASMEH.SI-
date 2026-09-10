import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ products: vi.fn(), pages: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { product: { findMany: mocks.products }, contentPage: { findMany: mocks.pages } } }));
vi.mock("@/lib/seo", () => ({ siteUrl: () => "https://nasmeh.example" }));

import sitemap from "@/app/sitemap";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.products.mockResolvedValue([
    { slug: "belilni-trakci-za-zobe", updatedAt: new Date("2026-09-01T00:00:00Z") },
    { slug: "belilni-trakci-potovalni-7", updatedAt: new Date("2026-09-05T00:00:00Z") },
  ]);
  mocks.pages.mockResolvedValue([{ slug: "pogoji-poslovanja", updatedAt: new Date("2026-08-01T00:00:00Z") }]);
});

describe("sitemap (backlog B1)", () => {
  it("lists the homepage, catalog, visible products, indexable routes and published pages", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toEqual([
      "https://nasmeh.example",
      "https://nasmeh.example/trgovina",
      "https://nasmeh.example/izdelek/belilni-trakci-za-zobe",
      "https://nasmeh.example/izdelek/belilni-trakci-potovalni-7",
      "https://nasmeh.example/prijava-nezelenega-ucinka",
      "https://nasmeh.example/pogoji-poslovanja",
    ]);
  });

  it("asks the database only for ACTIVE, catalog-visible products and published, non-retired pages", async () => {
    await sitemap();
    expect(mocks.products.mock.calls[0][0].where).toEqual({ status: "ACTIVE", visibleInCatalog: true });
    expect(mocks.pages.mock.calls[0][0].where).toEqual({
      published: true,
      slug: { notIn: ["pomoc", "o-nas", "razisli", "dostava", "paketi"] },
    });
  });

  it("never lists noindex route families and dates the catalog by its newest product", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    for (const path of ["/cart", "/checkout", "/racun", "/iskanje", "/kontakt", "/sledi", "/potrditev", "/odjava-zaloga", "/admin"]) {
      expect(urls.some((url) => url.includes(path)), path).toBe(false);
    }
    expect(entries.find((entry) => entry.url.endsWith("/trgovina"))?.lastModified).toEqual(new Date("2026-09-05T00:00:00Z"));
  });
});
