import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  validatePhoto,
  validatePhotoBatch,
} from "@/lib/reviews/photos";

describe("review photo validation (≤4, image-only, ≤2 MB)", () => {
  it("accepts jpg/png/webp within size", () => {
    expect(validatePhoto({ type: "image/jpeg", size: 1000 })).toEqual({
      ok: true,
      ext: "jpg",
    });
    expect(validatePhoto({ type: "image/png", size: 1000 }).ok).toBe(true);
    expect(validatePhoto({ type: "image/webp", size: 1000 }).ok).toBe(true);
  });

  it("rejects wrong MIME", () => {
    expect(validatePhoto({ type: "image/gif", size: 100 })).toEqual({
      ok: false,
      reason: "mime",
    });
    expect(validatePhoto({ type: "application/pdf", size: 100 }).ok).toBe(false);
  });

  it("rejects oversize and empty", () => {
    expect(validatePhoto({ type: "image/jpeg", size: MAX_PHOTO_BYTES + 1 })).toEqual({
      ok: false,
      reason: "size",
    });
    expect(validatePhoto({ type: "image/jpeg", size: 0 }).ok).toBe(false);
  });

  it("batch: rejects >4 photos", () => {
    const files = Array.from({ length: 5 }, () => ({
      type: "image/jpeg",
      size: 100,
    }));
    expect(validatePhotoBatch(files)).toEqual({ ok: false, reason: "count" });
  });

  it("batch: rejects on first bad file", () => {
    const files = [
      { type: "image/jpeg", size: 100 },
      { type: "image/gif", size: 100 },
    ];
    expect(validatePhotoBatch(files)).toEqual({ ok: false, reason: "mime" });
    const ok = Array.from({ length: 4 }, () => ({ type: "image/jpeg", size: 100 }));
    expect(validatePhotoBatch(ok)).toEqual({ ok: true });
  });
});
