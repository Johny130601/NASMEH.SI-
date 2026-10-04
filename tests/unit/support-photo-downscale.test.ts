import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORT_PHOTO_LIMITS, supportPhotosWithinLimits } from "@/components/storefront/reviews/photo-downscale";

/**
 * QA 2026-10-03 T3-06: /kontakt and /prijava-nezelenega-ucinka downscale a
 * phone photo over the 2 MB cap in the browser, as the review form does,
 * before refusing it — and keep refusing what the server would refuse.
 */

const photo = (bytes: number, type = "image/jpeg", name = "photo.jpg") => new File([new Uint8Array(bytes)], name, { type });
const OVER_CAP = SUPPORT_PHOTO_LIMITS.maxBytes + 1;

/**
 * A browser stand-in for downscalePhoto: an <img> that decodes to the given
 * size and a canvas whose JPEG comes out at `encodedBytes`. Counts the encodes.
 */
function fakeBrowser(encodedBytes: number, size = { width: 4000, height: 3000 }) {
  const encodes = { count: 0, canvas: { width: 0, height: 0 } };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => undefined }),
    toBlob(callback: (blob: Blob | null) => void, type: string) {
      encodes.count += 1;
      encodes.canvas = { width: this.width, height: this.height };
      callback(new Blob([new Uint8Array(encodedBytes)], { type }));
    },
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("Image", class {
    decoding = "";
    src = "";
    naturalWidth = size.width;
    naturalHeight = size.height;
    async decode() {}
  });
  return encodes;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("supportPhotosWithinLimits", () => {
  it("states the limits the server enforces (lib/support/tickets.ts)", () => {
    expect(SUPPORT_PHOTO_LIMITS).toEqual({ count: 4, maxBytes: 2 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] });
  });

  it("passes no selection and photos within the cap untouched", async () => {
    expect(await supportPhotosWithinLimits([])).toEqual([]);
    const small = [photo(1024), photo(2048, "image/png", "b.png"), photo(10, "image/webp", "c.webp")];
    const result = await supportPhotosWithinLimits(small);
    expect(result).toHaveLength(3);
    result!.forEach((file, index) => expect(file).toBe(small[index]));
  });

  it("refuses too many files, an empty file and anything that is not a JPEG, PNG or WebP", async () => {
    expect(await supportPhotosWithinLimits(Array.from({ length: 5 }, () => photo(10)))).toBeNull();
    expect(await supportPhotosWithinLimits([photo(0)])).toBeNull();
    expect(await supportPhotosWithinLimits([photo(10, "text/plain", "x.txt")])).toBeNull();
    expect(await supportPhotosWithinLimits([photo(OVER_CAP, "image/gif", "x.gif")])).toBeNull();
  });

  it("downscales a photo over the cap instead of refusing it, once per selected file", async () => {
    const encodes = fakeBrowser(600 * 1024);
    const large = photo(5 * 1024 * 1024, "image/png", "telefon.png");
    const [first] = (await supportPhotosWithinLimits([large]))!;
    expect(first.size).toBe(600 * 1024);
    expect(first.type).toBe("image/jpeg");
    expect(first.name).toBe("telefon.jpg");
    expect(encodes.canvas).toEqual({ width: 1600, height: 1200 }); // the longest edge brought to 1600 px
    // a retry sends the very same bytes: the file is not re-encoded
    const [again] = (await supportPhotosWithinLimits([large]))!;
    expect(again).toBe(first);
    expect(encodes.count).toBe(1);
  });

  it("still refuses a photo the browser cannot bring under the cap, or cannot decode", async () => {
    fakeBrowser(OVER_CAP + 10);
    expect(await supportPhotosWithinLimits([photo(OVER_CAP + 20)])).toBeNull();
    vi.unstubAllGlobals();
    // no browser at all (or a failed decode): the original comes back, still over the cap
    expect(await supportPhotosWithinLimits([photo(OVER_CAP)])).toBeNull();
  });
});
