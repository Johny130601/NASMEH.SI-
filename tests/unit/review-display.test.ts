import { describe, expect, it } from "vitest";
import { filterReviews, parseReviewFilters, reviewAuthor, reviewFilterHref, reviewStructuredData, reviewVerificationPoints, type DisplayReview } from "@/lib/reviews/display";
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
  it("shows the first name and the last-name initial, in cards and JSON-LD alike", () => {
    const named = (name: string | null) => ({ ...base, user: name === null ? null : { name } });
    expect(reviewAuthor(named("Ana Kovač"))).toBe("Ana K.");
    expect(reviewAuthor(named("  Ana   Marija  Novak-Kranjc "))).toBe("Ana N.");
    expect(reviewAuthor(named("živa zasebna"))).toBe("živa Z.");
    expect(reviewAuthor(named("Ana"))).toBe("Ana");
    expect(reviewAuthor(named("   "))).toBe("Kupec");
    expect(reviewAuthor(named(null))).toBe("Kupec");
    expect(reviewAuthor({ ...base, user: undefined })).toBe("Kupec");
    expect(reviewStructuredData([named("Ana Kovač")]).review?.[0].author).toEqual({ "@type": "Person", name: "Ana K." });
  });
  it("states how reviews are verified, following the auto-publish setting fail-closed", () => {
    const off = reviewVerificationPoints(0);
    expect(off).toContain("Vsako mnenje pred objavo pregledamo.");
    expect(off.join(" ")).toContain("dostavljenim naročilom");
    expect(off.join(" ")).toContain("»Preverjen kupec«");
    expect(off.join(" ")).toContain("»Odgovor Nasmeh.si«");
    expect(off.join(" ")).toContain("nizke ocene");
    expect(reviewVerificationPoints(4)).toContain("Mnenja s 4 ali 5 zvezdicami objavimo takoj, vsa druga pred objavo pregledamo.");
    expect(reviewVerificationPoints(5)).toContain("Mnenja s 5 zvezdicami objavimo takoj, vsa druga pred objavo pregledamo.");
    for (const malformed of [null, "4", 3, { value: 4 }]) expect(reviewVerificationPoints(malformed)).toEqual(off);
  });
  it("sorts rating first then newest date with deterministic ties", () => {
    const rows = [{ ...base, id: "old", rating: 1 }, { ...base, id: "new", rating: 1, createdAt: new Date("2026-02-01") }, { ...base, id: "high", rating: 5 }];
    expect(filterReviews(rows, parseReviewFilters({ sort: "lowest" })).map((r) => r.id)).toEqual(["new", "old", "high"]);
  });
});
