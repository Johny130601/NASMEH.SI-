import { MAX_PHOTO_BYTES } from "@/lib/reviews/photos";

/** Longest edge after downscaling; the server keeps 960 px, so nothing visible is lost. */
export const DOWNSCALE_MAX_EDGE = 1600;
/** What one Server Action request may carry (next.config.ts bodySizeLimit "10mb"), less multipart overhead. */
export const REQUEST_PHOTO_BUDGET_BYTES = 9 * 1024 * 1024;

/**
 * Re-encodes a photo in the browser when it exceeds the per-photo cap, so a
 * typical 3–5 MB phone photo fits the 2 MB limit and four of them fit one
 * request. Decoding goes through an <img> (EXIF orientation applied by every
 * current browser) and the result is a JPEG without metadata; the server
 * still decodes and re-encodes it. The original is returned when it is small
 * enough already, or when the browser cannot decode it — the server then
 * answers with its own error.
 */
export async function downscalePhoto(file: File, maxBytes = MAX_PHOTO_BYTES, maxEdge = DOWNSCALE_MAX_EDGE): Promise<File> {
  if (file.size <= maxBytes || typeof document === "undefined" || typeof URL.createObjectURL !== "function") return file;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) return file;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "fotografija"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The files a submit may carry: nothing when the input is untouched, at most `count` photos within the request budget. */
export function photoBatchProblem(files: File[], count: number, budget = REQUEST_PHOTO_BUDGET_BYTES): "count" | "size" | "request" | null {
  if (files.length > count) return "count";
  if (files.some((file) => file.size > MAX_PHOTO_BYTES)) return "size";
  if (files.reduce((total, file) => total + file.size, 0) > budget) return "request";
  return null;
}

/**
 * The support forms' photo rule (contact, adverse event): the limits
 * lib/support/tickets.ts enforces — at most four JPEG, PNG or WebP photos,
 * none empty, each at most 2 MB. Four photos at the cap stay inside one
 * request's budget.
 */
export const SUPPORT_PHOTO_LIMITS = {
  count: 4,
  maxBytes: 2 * 1024 * 1024,
  types: ["image/jpeg", "image/png", "image/webp"],
} as const;

/** One re-encode per selected file, so a retry sends the same bytes the first attempt did. */
const supportPhotoCache = new WeakMap<File, Promise<File>>();

/**
 * The photos a support form may send (QA 2026-10-03 T3-06): a phone photo over
 * the per-photo cap is downscaled in the browser first, like the review form's,
 * and the selection is refused only when it still breaks the rule — too many
 * files, an empty or non-image file, or a photo the browser could not bring
 * under the cap. Null: refused. Each file is re-encoded once and the result
 * reused, so a retry after a lost response carries identical bytes (the
 * contact form's replay key hashes them).
 */
export async function supportPhotosWithinLimits(files: File[]): Promise<File[] | null> {
  const types: readonly string[] = SUPPORT_PHOTO_LIMITS.types;
  if (files.length > SUPPORT_PHOTO_LIMITS.count || files.some((file) => file.size === 0 || !types.includes(file.type))) {
    return null;
  }
  const photos: File[] = [];
  for (const file of files) {
    let photo = supportPhotoCache.get(file);
    if (!photo) {
      photo = downscalePhoto(file, SUPPORT_PHOTO_LIMITS.maxBytes);
      supportPhotoCache.set(file, photo);
    }
    photos.push(await photo);
  }
  return photos.some((photo) => photo.size > SUPPORT_PHOTO_LIMITS.maxBytes) ? null : photos;
}
