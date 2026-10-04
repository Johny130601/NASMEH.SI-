import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareReviewPhoto } from "@/lib/reviews/photo-storage";
import { reviewPhotoPaths, reviewPhotoSrcSet } from "@/lib/reviews/photos";

describe("review photo content normalization", () => {
  it("decodes uploads, removes metadata, and creates responsive WebP assets", async () => {
    const source = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "red" } }).withMetadata().jpeg().toBuffer();
    const result = await prepareReviewPhoto(source, "image/jpeg");
    const large = await sharp(result.large).metadata(); const small = await sharp(result.small).metadata();
    expect(large.format).toBe("webp"); expect(large.width).toBe(960); expect(small.width).toBe(320); expect(large.exif).toBeUndefined();
  });
  it("never enlarges a small photo (QA 2026-10-03 T3-07)", async () => {
    const source = await sharp({ create: { width: 240, height: 180, channels: 3, background: "blue" } }).png().toBuffer();
    const result = await prepareReviewPhoto(source, "image/png");
    const large = await sharp(result.large).metadata(); const small = await sharp(result.small).metadata();
    expect([large.width, large.height]).toEqual([240, 180]);
    expect([small.width, small.height]).toEqual([240, 180]);
  });
  it("rejects HTML pretending to be JPEG and corrupt PNG bytes", async () => {
    await expect(prepareReviewPhoto(Buffer.from("<script>alert(1)</script>"), "image/jpeg")).rejects.toThrow();
    await expect(prepareReviewPhoto(Buffer.from("89504e470d0a1a0a", "hex"), "image/png")).rejects.toThrow();
  });
  it("requires declared MIME to match decoded image format", async () => {
    const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    await expect(prepareReviewPhoto(source, "image/jpeg")).rejects.toThrow();
  });
  it("rejects very wide compressed images before resize", async () => {
    const source = await sharp({ create: { width: 8001, height: 1, channels: 3, background: "red" } }).png().toBuffer();
    await expect(prepareReviewPhoto(source, "image/png")).rejects.toThrow();
  });
  it("rejects compact images exceeding the decoded pixel budget", async () => {
    const source = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "red" } }).png().toBuffer();
    await expect(prepareReviewPhoto(source, "image/png")).rejects.toThrow();
  });
  it("only renders/removes local generated paths and constructs both sizes", () => {
    const url = `/uploads/reviews/${"a".repeat(24)}.webp`;
    expect(reviewPhotoPaths([url, "../secret", "https://outside.example/x.jpg", 5])).toEqual([url]);
    expect(reviewPhotoSrcSet(url)).toContain("-320.webp 320w"); expect(reviewPhotoSrcSet(url)).toContain(`${url} 960w`);
    expect(reviewPhotoSrcSet("/uploads/other.webp")).toBeUndefined();
  });
});
