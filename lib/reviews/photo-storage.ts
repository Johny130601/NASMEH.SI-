import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { validatePhoto, reviewPhotoPaths } from "./photos";

// Deliberately outside Next's public directory so a restart cannot bypass the
// route's publication/ownership check through static-file serving.
export const REVIEW_UPLOAD_DIR = path.join(process.cwd(), "review-uploads");

export class InvalidReviewPhoto extends Error {}

/** Decode then re-encode: reject spoofed MIME, corrupt files and oversized pixels;
 * strip metadata and executable trailing content rather than saving client bytes. */
export async function prepareReviewPhoto(bytes: Buffer, type: string) {
  if (!validatePhoto({ type, size: bytes.length }).ok) throw new InvalidReviewPhoto();
  try {
    const source = sharp(bytes, { failOn: "warning", limitInputPixels: 16_000_000 });
    const meta = await source.metadata();
    const expected = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[type];
    if (meta.format !== expected || !meta.width || !meta.height ||
      meta.width > 8000 || meta.height > 8000 || (meta.pages ?? 1) !== 1) {
      throw new InvalidReviewPhoto();
    }
    const resize = (width: number) => source.clone().rotate().resize({ width, height: width, fit: "inside" }).webp({ quality: 82 }).toBuffer();
    // Decode one size at a time on the 512 MB deployment target.
    const large = await resize(960);
    const small = await resize(320);
    return { large, small };
  } catch {
    throw new InvalidReviewPhoto();
  }
}

export async function removeReviewPhotos(urls: string[]) {
  await Promise.all(reviewPhotoPaths(urls).flatMap((url) => {
    const filename = path.basename(url);
    const names = filename.endsWith(".webp") ? [filename, filename.replace(/\.webp$/, "-320.webp")] : [filename];
    return names.map(async (name) => {
      try { await unlink(path.join(REVIEW_UPLOAD_DIR, name)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    });
  }));
}

export async function saveReviewPhotos(photos: Awaited<ReturnType<typeof prepareReviewPhoto>>[]) {
  if (!photos.length) return [];
  await mkdir(REVIEW_UPLOAD_DIR, { recursive: true });
  const urls: string[] = [];
  try {
    for (const photo of photos) {
      const name = randomBytes(12).toString("hex");
      urls.push(`/uploads/reviews/${name}.webp`);
      await writeFile(path.join(REVIEW_UPLOAD_DIR, `${name}.webp`), photo.large, { flag: "wx" });
      await writeFile(path.join(REVIEW_UPLOAD_DIR, `${name}-320.webp`), photo.small, { flag: "wx" });
    }
    return urls;
  } catch (error) {
    await removeReviewPhotos(urls);
    throw error;
  }
}
