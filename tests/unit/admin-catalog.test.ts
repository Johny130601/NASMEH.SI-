import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  buildCustomFields, collectionSchema, bundleSchema, lowStockSchema, parseAccordions, parseBadgesForEditor, parseEducation, parseFaq,
  parseMerchandising, parseProductFilters, productBasicsSchema, productIsListed, skuSchema, slugSchema, variantSchema,
} from "@/lib/admin/catalog";

const variant = {
  title: "", sku: "nas-trk-14", priceCents: 3499, compareAtPriceCents: null, costCents: null, barcode: "", weightGrams: null,
  stock: 3, maxCartQuantity: 5, allowBackorder: false, backorderNote: "",
};

describe("catalog schemas", () => {
  it("normalises slugs and SKUs", () => {
    expect(slugSchema.parse("  Belilni-Trakci ")).toBe("belilni-trakci");
    expect(slugSchema.safeParse("belilni trakci").success).toBe(false);
    expect(slugSchema.safeParse("-x").success).toBe(false);
    expect(skuSchema.parse(" nas-trk-14 ")).toBe("NAS-TRK-14");
    expect(skuSchema.safeParse("NAS TRK").success).toBe(false);
  });

  it("accepts a variant, blanks optional text to null and refuses compare-at prices at or below the price", () => {
    const parsed = variantSchema.parse(variant);
    expect(parsed).toMatchObject({ sku: "NAS-TRK-14", barcode: null, backorderNote: null, compareAtPriceCents: null });
    expect(variantSchema.parse({ ...variant, barcode: null, backorderNote: " rok 5 dni " }).backorderNote).toBe("rok 5 dni");
    expect(variantSchema.safeParse({ ...variant, compareAtPriceCents: 3499 }).success).toBe(false);
    expect(variantSchema.safeParse({ ...variant, compareAtPriceCents: 3999 }).success).toBe(true);
    expect(variantSchema.safeParse({ ...variant, stock: -1 }).success).toBe(false);
    expect(variantSchema.safeParse({ ...variant, maxCartQuantity: 0 }).success).toBe(false);
    expect(variantSchema.safeParse({ ...variant, priceCents: 12.5 }).success).toBe(false);
  });

  it("validates product basics, collections, bundles and the low-stock threshold", () => {
    const basics = {
      title: "Trakci", slug: "trakci", status: "ACTIVE", description: "", seoTitle: "", seoDescription: "",
      visibleInCatalog: true, visibleInSearch: true, hiddenDeal: false, klarnaEligible: true, soldOutBehavior: "HIDE",
    } as const;
    expect(productBasicsSchema.parse(basics)).toMatchObject({ seoTitle: null, soldOutBehavior: "HIDE" });
    expect(productBasicsSchema.safeParse({ ...basics, status: "LIVE" }).success).toBe(false);
    expect(collectionSchema.safeParse({ title: "Beljenje", slug: "beljenje", seoTitle: "", seoDescription: "", noindex: false, hideBannerText: true }).success).toBe(true);
    expect(collectionSchema.safeParse({ title: "", slug: "beljenje", seoTitle: "", seoDescription: "", noindex: false, hideBannerText: true }).success).toBe(false);
    expect(bundleSchema.safeParse({ productId: "p", priceCents: 4990, active: true, items: [] }).success).toBe(false);
    expect(bundleSchema.safeParse({ productId: "p", priceCents: 4990, active: true, items: [{ variantId: "v", quantity: 11 }] }).success).toBe(false);
    expect(bundleSchema.safeParse({ productId: "p", priceCents: 4990, active: true, items: [{ variantId: "v", quantity: 2 }] }).success).toBe(true);
    expect(lowStockSchema.safeParse({ lowStockThreshold: 1001 }).success).toBe(false);
    expect(lowStockSchema.safeParse({ lowStockThreshold: 0 }).success).toBe(true);
  });
});

describe("merchandising JSON round trip", () => {
  it("splits customFields into structured fields plus the free-form remainder", () => {
    const parsed = parseMerchandising({
      uspChips: ["Brez peroksida", 7, "Vegansko"], intro: "Uvod", bullets: ["a", "b"], unitPrice: { quantity: 14, unit: "na uporabo" },
      crossSell: ["serum"], meta: { supplier: "X" }, note: "n",
    });
    expect(parsed).toEqual({
      uspChips: ["Brez peroksida", "Vegansko"], intro: "Uvod", bullets: ["a", "b"], unitPrice: { quantity: 14, unit: "na uporabo" },
      crossSell: ["serum"], extraJson: JSON.stringify({ meta: { supplier: "X" }, note: "n" }, null, 2),
    });
    expect(parseMerchandising(null)).toEqual({ uspChips: [], intro: "", bullets: [], unitPrice: null, crossSell: [], extraJson: "" });
  });

  it("builds customFields with structured keys winning over the free-form JSON", () => {
    const built = buildCustomFields({
      uspChips: ["A"], intro: "Uvod", bullets: [], unitPrice: null, crossSell: [],
      extraJson: JSON.stringify({ intro: "shadowed", meta: { supplier: "X" } }),
    });
    expect(built).toEqual({ ok: true, value: { meta: { supplier: "X" }, uspChips: ["A"], intro: "Uvod", bullets: [], crossSell: [] } });
    expect(buildCustomFields({ uspChips: [], intro: "", bullets: [], unitPrice: { quantity: 2, unit: "kos" }, crossSell: [], extraJson: "" }))
      .toEqual({ ok: true, value: { uspChips: [], intro: "", bullets: [], unitPrice: { quantity: 2, unit: "kos" }, crossSell: [] } });
    for (const extraJson of ["not json", "[1,2]", "null", "\"x\""]) {
      expect(buildCustomFields({ uspChips: [], intro: "", bullets: [], unitPrice: null, crossSell: [], extraJson })).toEqual({ ok: false });
    }
  });

  it("tolerates malformed stored JSON for accordions, FAQ, education and badges", () => {
    expect(parseAccordions({ howItWorks: "<p>x</p>", inci: 3 })).toEqual({ howItWorks: "<p>x</p>", inci: "", guarantee: "", tested: "" });
    expect(parseAccordions("junk")).toEqual({ howItWorks: "", inci: "", guarantee: "", tested: "" });
    expect(parseFaq([{ q: "Q", a: "A" }, { q: 1 }, null, "x"])).toEqual([{ q: "Q", a: "A" }]);
    expect(parseFaq({})).toEqual([]);
    expect(parseEducation([{ heading: "H", body: "B", extra: true }, { heading: "only" }])).toEqual([{ heading: "H", body: "B" }]);
    expect(parseBadgesForEditor([{ label: "Novo", style: "solid" }, { label: "x" }])).toEqual([
      { label: "Novo", style: "solid" }, { label: "x", style: "solid" },
    ]);
  });
});

describe("listing rules and filters", () => {
  const base = { status: "ACTIVE" as const, visibleInCatalog: true, soldOutBehavior: "NOTIFY" as const, variants: [{ stock: 0, allowBackorder: false }] };

  it("keeps sold-out NOTIFY products listed and hides sold-out HIDE products unless a variant is stocked or backorderable", () => {
    expect(productIsListed(base)).toBe(true);
    expect(productIsListed({ ...base, soldOutBehavior: "HIDE" })).toBe(false);
    expect(productIsListed({ ...base, soldOutBehavior: "HIDE", variants: [{ stock: 0, allowBackorder: false }, { stock: 2, allowBackorder: false }] })).toBe(true);
    expect(productIsListed({ ...base, soldOutBehavior: "HIDE", variants: [{ stock: 0, allowBackorder: true }] })).toBe(true);
    expect(productIsListed({ ...base, status: "DRAFT", variants: [{ stock: 5, allowBackorder: false }] })).toBe(false);
    expect(productIsListed({ ...base, visibleInCatalog: false, variants: [{ stock: 5, allowBackorder: false }] })).toBe(false);
  });

  it("parses the product list filters defensively", () => {
    expect(parseProductFilters({ q: ["  trakci "], status: "active" })).toEqual({ q: "trakci", status: "ACTIVE" });
    expect(parseProductFilters({ status: "LIVE" })).toEqual({ q: "", status: null });
    expect(parseProductFilters({ q: "x".repeat(200) }).q).toHaveLength(120);
  });
});
