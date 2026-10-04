import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { parseSearchQuery, rankSearchResults, searchQuerySchema, searchWords, type SearchEntry } from "@/lib/search";
import { clampSearchQuery, SEARCH_MAX_CHARS, SEARCH_MIN_CHARS } from "@/lib/search-limits";
import { productSearchText } from "@/lib/catalog";
import { search } from "@/lib/copy/search";
import { searchHints, znakForm } from "@/lib/copy/search-hints";

describe("searchQuerySchema / parseSearchQuery (AGENTS §8.2)", () => {
  it("trims whitespace", () => {
    expect(parseSearchQuery("  trak  ")).toBe("trak");
  });

  it("accepts normal queries", () => {
    expect(parseSearchQuery("belilni trakci")).toBe("belilni trakci");
    expect(parseSearchQuery("a")).toBe("a");
  });

  it("returns '' for null/undefined/empty", () => {
    expect(parseSearchQuery(null)).toBe("");
    expect(parseSearchQuery(undefined)).toBe("");
    expect(parseSearchQuery("   ")).toBe("");
  });

  it("cuts over-length input to its first 80 characters instead of dropping it (QA 2026-10-03 T1-06)", () => {
    expect(SEARCH_MAX_CHARS).toBe(80);
    expect(parseSearchQuery("x".repeat(81))).toBe("x".repeat(80));
    expect(searchQuerySchema.safeParse("x".repeat(500))).toEqual({ success: true, data: "x".repeat(80) });
    expect(searchQuerySchema.safeParse("x".repeat(80))).toEqual({ success: true, data: "x".repeat(80) });
    // the cut never ends on a space, and never splits a character outside the BMP
    expect(parseSearchQuery(`${"a".repeat(79)} trakci`)).toBe("a".repeat(79));
    expect(Array.from(clampSearchQuery("😀".repeat(100)))).toHaveLength(80);
    expect(clampSearchQuery("😀".repeat(100))).toBe("😀".repeat(80));
  });
});

describe("the too-short hint (QA 2026-10-03 T1-06)", () => {
  it("names the minimum length the page and the overlay search from, in Slovenian agreement", () => {
    expect(SEARCH_MIN_CHARS).toBe(2);
    expect(searchHints.minChars(SEARCH_MIN_CHARS)).toBe("Vnesite vsaj 2 znaka.");
    expect(searchHints.maxChars(80)).toBe("Iskanje upošteva prvih 80 znakov.");
    expect([1, 2, 3, 4, 5, 101, 102].map(znakForm)).toEqual(["znak", "znaka", "znaki", "znaki", "znakov", "znak", "znaka"]);
  });

  it("a one-character query is kept for the form, but below the length that searches", () => {
    for (const query of ["a", "Č", "%", " a "]) {
      const parsed = parseSearchQuery(query);
      expect(parsed.length, query).toBeGreaterThan(0);
      expect(parsed.length, query).toBeLessThan(SEARCH_MIN_CHARS);
    }
  });
});

describe("searchWords", () => {
  it("folds case and Slovenian diacritics and keeps at most six words", () => {
    expect(searchWords("  ČIŠČENJE   Žličke ")).toEqual(["ciscenje", "zlicke"]);
    expect(searchWords("a b c d e f g h")).toHaveLength(6);
    expect(searchWords("   ")).toEqual([]);
  });
});

/**
 * Relevance (QA M8 / L7, T1-01): the seeded catalog shape — every product
 * cross-sells the serum and carries JSON keys in its metafields. A search
 * matches only what a shopper reads, and a title match ranks first.
 */
function entry(slug: string, product: Parameters<typeof productSearchText>[0]): SearchEntry<string> {
  return { card: slug, text: productSearchText(product) };
}

const base = { accordions: null, faq: null, education: null };
const catalogue: Array<SearchEntry<string>> = [
  entry("belilni-trakci-za-zobe", {
    ...base,
    title: "Belilni trakci za zobe (14 uporab)",
    description: "<p>Naš vodilni izdelek: trakci brez peroksida.</p>",
    customFields: { intro: "Nežna rutina.", bullets: ["30 minut na dan"], crossSell: ["serum-korektor-barve-zob"], unitPrice: { quantity: 14, unit: "uporabo" } },
  }),
  entry("ustna-voda-globinsko-ciscenje", {
    ...base,
    title: "Ustna voda za globinsko čiščenje",
    description: "Za vsakodnevno nego po ščetkanju.",
    customFields: { crossSell: ["serum-korektor-barve-zob", "belilni-trakci-za-zobe"] },
  }),
  entry("serum-korektor-barve-zob", {
    ...base,
    title: "Serum korektor barve zob",
    description: "Vijolični pigmenti za začasno optično korekcijo.",
    customFields: { crossSell: ["belilni-trakci-za-zobe"] },
  }),
  entry("paket-popolna-rutina", {
    ...base,
    title: "Paket popolna rutina",
    description: "Belilni trakci, ustna voda in serum korektor v enem paketu.",
    customFields: { uspChips: ["Prihranek pri kompletu"] },
    accordions: { howItWorks: "<p>Uporabljajte <strong>vsak dan</strong>.</p>" },
    faq: [{ q: "Kako dolgo traja paket?", a: "Približno mesec dni." }],
    education: [{ heading: "Rutina v treh korakih", body: "Najprej trakci, nato ustna voda." }],
  }),
];

describe("rankSearchResults", () => {
  it("puts the product whose title matches first, and never matches a cross-sell slug", () => {
    // "serum" is in every cross-sell list, but only the serum and the bundle's description say it
    expect(rankSearchResults("serum", catalogue)).toEqual(["serum-korektor-barve-zob", "paket-popolna-rutina"]);
  });

  it("ignores JSON keys and handles in the metafields", () => {
    expect(rankSearchResults("crossSell", catalogue)).toEqual([]);
    expect(rankSearchResults("unitPrice", catalogue)).toEqual([]);
    expect(rankSearchResults("korektor-barve", catalogue)).toEqual([]);
  });

  it("does not return the whole catalog for a word only some products carry", () => {
    expect(rankSearchResults("trak", catalogue)).toEqual(["belilni-trakci-za-zobe", "paket-popolna-rutina"]);
  });

  it("matches accent-insensitively, ANDs the words and keeps the catalog order within a rank", () => {
    expect(rankSearchResults("ciscenje", catalogue)).toEqual(["ustna-voda-globinsko-ciscenje"]);
    expect(rankSearchResults("ustna voda", catalogue)).toEqual(["ustna-voda-globinsko-ciscenje", "paket-popolna-rutina"]);
    expect(rankSearchResults("ustna peroksida", catalogue)).toEqual([]);
  });

  it("finds the merchandising, accordion, FAQ and education text a shopper reads", () => {
    expect(rankSearchResults("nezna", catalogue)).toEqual(["belilni-trakci-za-zobe"]);
    expect(rankSearchResults("prihranek", catalogue)).toEqual(["paket-popolna-rutina"]);
    expect(rankSearchResults("vsak dan", catalogue)).toEqual(["paket-popolna-rutina"]);
    expect(rankSearchResults("mesec", catalogue)).toEqual(["paket-popolna-rutina"]);
    expect(rankSearchResults("korakih", catalogue)).toEqual(["paket-popolna-rutina"]);
  });

  it("never matches markup inside the HTML fields", () => {
    expect(rankSearchResults("strong", catalogue)).toEqual([]);
    expect(rankSearchResults("<p>", catalogue)).toEqual([]);
  });

  it("returns nothing for an empty query and honours the limit", () => {
    expect(rankSearchResults("   ", catalogue)).toEqual([]);
    expect(rankSearchResults("serum", catalogue, 1)).toEqual(["serum-korektor-barve-zob"]);
  });
});

describe("result count copy (QA T1-18)", () => {
  it("agrees izdelek with the number", () => {
    expect([1, 2, 3, 4, 5, 11, 21, 101, 0].map(search.resultsCount)).toEqual([
      "1 izdelek", "2 izdelka", "3 izdelki", "4 izdelki", "5 izdelkov", "11 izdelkov", "21 izdelkov", "101 izdelek", "0 izdelkov",
    ]);
  });
});
