import { describe, expect, it } from "vitest";
import { downscalePhoto, photoBatchProblem, REQUEST_PHOTO_BUDGET_BYTES } from "@/components/storefront/reviews/photo-downscale";
import { MAX_PHOTO_BYTES, MAX_REVIEW_PHOTOS } from "@/lib/reviews/photos";

/** QA 2026-09-29 T3-R3: the review form says what is wrong with a photo batch before sending it. */
describe("photoBatchProblem", () => {
  const photo = (bytes: number) => new File([new Uint8Array(bytes)], "x.jpg", { type: "image/jpeg" });

  it("accepts no photos and a batch within every limit", () => {
    expect(photoBatchProblem([], MAX_REVIEW_PHOTOS)).toBeNull();
    expect(photoBatchProblem([photo(1024), photo(2048)], MAX_REVIEW_PHOTOS)).toBeNull();
  });

  it("names the limit a batch breaks: count, one photo's size, or one request's size", () => {
    expect(photoBatchProblem(Array.from({ length: MAX_REVIEW_PHOTOS + 1 }, () => photo(10)), MAX_REVIEW_PHOTOS)).toBe("count");
    expect(photoBatchProblem([photo(MAX_PHOTO_BYTES + 1)], MAX_REVIEW_PHOTOS)).toBe("size");
    expect(photoBatchProblem([photo(1000), photo(1000)], MAX_REVIEW_PHOTOS, 1500)).toBe("request");
    expect(REQUEST_PHOTO_BUDGET_BYTES).toBeLessThan(10 * 1024 * 1024);
  });
});

describe("downscalePhoto", () => {
  it("leaves a photo within the cap untouched", async () => {
    const small = new File([new Uint8Array(100)], "small.png", { type: "image/png" });
    expect(await downscalePhoto(small)).toBe(small);
  });

  it("returns the original where the browser cannot re-encode (the server then answers with its own error)", async () => {
    const large = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "large.jpg", { type: "image/jpeg" });
    expect(await downscalePhoto(large)).toBe(large);
  });
});
