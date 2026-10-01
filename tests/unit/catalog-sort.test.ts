import { describe, expect, it } from "vitest";
import { applySort, DEFAULT_SORT, resolveSortKey, SORT_ALIASES, SORT_KEYS } from "@/lib/catalog-sort";
import type { CatalogProduct } from "@/lib/catalog";
import { catalog } from "@/lib/copy/catalog";

/** /trgovina sort contract (§5): the `?razvrsti=` slug, correctly spelt, with the retired spellings kept (QA L10). */

const card = (slug: string, title: string, priceCents: number, createdAt: string) =>
  ({ slug, title, priceCents, createdAt: new Date(createdAt) }) as CatalogProduct;

const products = [
  card("trakci", "Belilni trakci za zobe", 3499, "2026-09-01T00:00:00Z"),
  card("voda", "Ustna voda", 1999, "2026-09-02T00:00:00Z"),
  card("paket", "Paket popolna rutina", 4999, "2026-09-03T00:00:00Z"),
  card("serum", "Čistilni serum", 2499, "2026-09-04T00:00:00Z"),
];
const order = (sorted: CatalogProduct[]) => sorted.map((product) => product.slug);

describe("resolveSortKey", () => {
  it("offers exactly the options the copy file names, with correctly spelt price slugs", () => {
    expect(SORT_KEYS).toEqual(Object.keys(catalog.sort.options));
    expect(SORT_KEYS).toContain("cena-narascajoce");
    expect(SORT_KEYS).toContain("cena-padajoce");
    expect(SORT_KEYS).not.toContain("cena-vzpadno");
    expect(SORT_KEYS).not.toContain("cena-padajco");
  });

  it("resolves every current slug to itself", () => {
    for (const key of SORT_KEYS) expect(resolveSortKey(key)).toBe(key);
  });

  it("keeps a shared link with a retired slug working", () => {
    expect(resolveSortKey("cena-vzpadno")).toBe("cena-narascajoce");
    expect(resolveSortKey("cena-padajco")).toBe("cena-padajoce");
    for (const target of Object.values(SORT_ALIASES)) expect(SORT_KEYS).toContain(target);
  });

  it("falls back to the default for an unknown, empty or absent value and reads the first of repeated ones", () => {
    expect(resolveSortKey("nekaj")).toBe(DEFAULT_SORT);
    expect(resolveSortKey("")).toBe(DEFAULT_SORT);
    expect(resolveSortKey(undefined)).toBe(DEFAULT_SORT);
    expect(resolveSortKey(null)).toBe(DEFAULT_SORT);
    expect(resolveSortKey(["cena-padajoce", "naziv-az"])).toBe("cena-padajoce");
    expect(DEFAULT_SORT).toBe("priporoceno");
  });

  it("never resolves an inherited object name to a sort", () => {
    for (const name of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
      expect(resolveSortKey(name)).toBe(DEFAULT_SORT);
    }
  });
});

describe("applySort", () => {
  it("keeps the merchandising order for the recommended sort and never mutates its input", () => {
    const input = [...products];
    expect(order(applySort(input, "priporoceno"))).toEqual(["trakci", "voda", "paket", "serum"]);
    applySort(input, "cena-padajoce");
    expect(order(input)).toEqual(["trakci", "voda", "paket", "serum"]);
  });

  it("sorts by price, newest and the Slovenian alphabet", () => {
    expect(order(applySort(products, "cena-narascajoce"))).toEqual(["voda", "serum", "trakci", "paket"]);
    expect(order(applySort(products, "cena-padajoce"))).toEqual(["paket", "trakci", "serum", "voda"]);
    expect(order(applySort(products, "najnovejse"))).toEqual(["serum", "paket", "voda", "trakci"]);
    // Č sorts after C and before D in Slovenian, so "Čistilni" follows "Belilni"
    expect(order(applySort(products, "naziv-az"))).toEqual(["trakci", "serum", "paket", "voda"]);
    expect(order(applySort(products, "naziv-za"))).toEqual(["voda", "paket", "serum", "trakci"]);
  });
});
