import { describe, expect, it } from "vitest";
import { parseSearchQuery, searchQuerySchema } from "@/lib/search";

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

  it("rejects over-length input (max 80) → ''", () => {
    expect(parseSearchQuery("x".repeat(81))).toBe("");
    expect(searchQuerySchema.safeParse("x".repeat(81)).success).toBe(false);
    expect(searchQuerySchema.safeParse("x".repeat(80)).success).toBe(true);
  });
});
