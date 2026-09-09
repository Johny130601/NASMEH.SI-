/**
 * Review photo upload validation (§10/§14.9) — PURE, unit-tested.
 * ≤4 photos, image-only (jpg/png/webp), ≤2 MB each.
 */

export const MAX_REVIEW_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface PhotoValidationInput {
  type: string;
  size: number;
}

export type PhotoValidation =
  | { ok: true; ext: string }
  | { ok: false; reason: "mime" | "size" };

export function validatePhoto(file: PhotoValidationInput): PhotoValidation {
  const ext = ALLOWED_MIME[file.type];
  if (!ext) return { ok: false, reason: "mime" };
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return { ok: false, reason: "size" };
  }
  return { ok: true, ext };
}

/** Only locally generated review assets may render or be removed by moderation. */
export function reviewPhotoPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((url): url is string =>
    typeof url === "string" && /^\/uploads\/reviews\/[a-f0-9]{24}\.(webp|jpg|png)$/.test(url),
  ).slice(0, MAX_REVIEW_PHOTOS);
}

export function reviewPhotoSrcSet(url: string): string | undefined {
  if (!reviewPhotoPaths([url]).length || !url.endsWith(".webp")) return undefined;
  return `${url.replace(/\.webp$/, "-320.webp")} 320w, ${url} 960w`;
}

export function validatePhotoBatch(
  files: PhotoValidationInput[],
): { ok: true } | { ok: false; reason: "count" | "mime" | "size" } {
  if (files.length > MAX_REVIEW_PHOTOS) return { ok: false, reason: "count" };
  for (const file of files) {
    const result = validatePhoto(file);
    if (!result.ok) return { ok: false, reason: result.reason };
  }
  return { ok: true };
}
