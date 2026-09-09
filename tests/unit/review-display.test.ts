import { describe, expect, it } from "vitest";
import { filterReviews, parseReviewFilters, reviewFilterHref, reviewStructuredData, type DisplayReview } from "@/lib/reviews/display";
const base: DisplayReview = { id: "r", status: "PUBLISHED", rating: 5, title: null, text: "review", photos: [], orderItemId: "item", merchantReply: null, createdAt: new Date("2026-01-01"), user: { name: "Tester" } };
describe("published review SSR data", () => {
  it("uses all published ratings for JSON-LD rather than a ten-review sample", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ ...base, id: `r${i}`, rating: i < 10 ? 5 : 1 }));
    rows.push({ ...base, id: "pending", status: "PENDING", rating: 1 });
    const data = reviewStructuredData(rows);
    expect(data.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: "4.3", reviewCount: 12 });
    expect(data.review).toHaveLength(5); expect(data.review?.[0].author).toEqual({ "@type": "Person", name: "Tester" });
  });
  it("excludes pending/rejected from cards and schema, including photos", () => {
    const rows = [{ ...base, status: "PENDING" }, { ...base, id: "rejected", status: "REJECTED" }];
    expect(filterReviews(rows, parseReviewFilters({}))).toEqual([]); expect(reviewStructuredData(rows)).toEqual({});
  });
  it("combines low-star/photo filtering and preserves filters when sorting", () => {
    const photo = `/uploads/reviews/${"a".repeat(24)}.webp`;
    const filters = parseReviewFilters({ sort: "lowest", stars: "1", photos: "1" });
    const rows = [{ ...base, id: "photo", rating: 1, photos: [photo] }, { ...base, id: "no-photo", rating: 1 }, base];
    expect(filterReviews(rows, filters).map((r) => r.id)).toEqual(["photo"]);
    expect(reviewFilterHref(filters, { sort: "highest" })).toBe("?pregled=highest&zvezdice=1&foto=1#mnenja");
    expect(reviewFilterHref(filters, { photos: "" })).toBe("?pregled=lowest&zvezdice=1#mnenja");
  });
  it("rejects malformed query input, decimals and unsafe external photo URLs", () => {
    expect(parseReviewFilters({ sort: ["highest"], stars: "1.5", photos: "true" })).toEqual({ sort: "newest", stars: "", photos: "" });
    expect(filterReviews([{ ...base, photos: ["https://evil.example/photo.jpg"] }], parseReviewFilters({ photos: "1" }))).toEqual([]);
  });
  it("sorts rating first then newest date with deterministic ties", () => {
    const rows = [{ ...base, id: "old", rating: 1 }, { ...base, id: "new", rating: 1, createdAt: new Date("2026-02-01") }, { ...base, id: "high", rating: 5 }];
    expect(filterReviews(rows, parseReviewFilters({ sort: "lowest" })).map((r) => r.id)).toEqual(["new", "old", "high"]);
  });
});
