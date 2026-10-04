import { describe, expect, it } from "vitest";
import { buildMetadata } from "@/lib/seo";

/**
 * QA 2026-10-03: a product page is og:type "product". Next's openGraph.type
 * has no such value (an unknown type throws while the head renders), so the
 * tag goes out through `other` and the page's openGraph block carries no type.
 */
describe("buildMetadata og:type", () => {
  it("marks a product page as a product, through `other`", () => {
    const metadata = buildMetadata({ title: "Belilni trakci", path: "/izdelek/belilni-trakci-za-zobe" });
    expect(metadata.other).toEqual({ "og:type": "product" });
    expect(metadata.openGraph).not.toHaveProperty("type");
    // the rest of the Open Graph block is unchanged
    expect(metadata.openGraph).toMatchObject({ title: "Belilni trakci", locale: "sl_SI", url: expect.stringMatching(/\/izdelek\/belilni-trakci-za-zobe$/) });
  });

  it("keeps every other page a website", () => {
    for (const path of ["", "/trgovina", "/trgovina?kolekcija=paketi", "/pogoji-poslovanja", "/izdelek", "/izdelek/a/b", "/sestavi-paket?izdelek=x"]) {
      const metadata = buildMetadata({ title: "Stran", path });
      expect(metadata.openGraph, path).toMatchObject({ type: "website" });
      expect(metadata.other, path).toBeUndefined();
    }
  });
});
