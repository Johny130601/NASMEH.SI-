import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { parseReviewFilters } from "@/lib/admin/reviews";

describe("review queue filters", () => {
  it("defaults to the pending queue without filters", () => {
    expect(parseReviewFilters({})).toEqual({ status: "PENDING", product: "", rating: null, withPhotos: false });
  });

  it("accepts the three statuses, a product slug, a rating 1–5 and the photo flag", () => {
    expect(parseReviewFilters({ status: "published", izdelek: "Serum-Korektor", ocena: "4", foto: "1" }))
      .toEqual({ status: "PUBLISHED", product: "serum-korektor", rating: 4, withPhotos: true });
    expect(parseReviewFilters({ status: ["REJECTED"], ocena: ["2"] })).toMatchObject({ status: "REJECTED", rating: 2 });
  });

  it("ignores unknown statuses, ratings outside 1–5 and other photo values", () => {
    expect(parseReviewFilters({ status: "DELETED", ocena: "6", foto: "yes" })).toEqual({ status: "PENDING", product: "", rating: null, withPhotos: false });
    expect(parseReviewFilters({ ocena: "0" }).rating).toBeNull();
    expect(parseReviewFilters({ izdelek: "x".repeat(100) }).product).toHaveLength(80);
  });
});
