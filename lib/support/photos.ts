import { mkdir, open, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { MAX_REVIEW_PHOTOS, validatePhotoBatch } from "@/lib/reviews/photos";
import { InvalidReviewPhoto, prepareReviewPhoto } from "@/lib/reviews/photo-storage";

/** Support evidence never enters Next's public directory or review storage. */
export const SUPPORT_UPLOAD_DIR = path.join(process.cwd(), "support-uploads");
export const SUPPORT_PHOTO_FILENAME = /^[a-f0-9]{24}\.webp$/;
export interface SavedSupportPhoto { filename: string; size: number }

export class InvalidSupportPhoto extends InvalidReviewPhoto {
  constructor(public readonly reason: "count" | "mime" | "size" | "content") {
    super();
    this.name = "InvalidSupportPhoto";
  }
}

/** Reuse the bounded decoder and metadata removal, without writing review files. */
export async function prepareSupportPhotos(files: File[]): Promise<Buffer[]> {
  const validation = validatePhotoBatch(files);
  if (!validation.ok) throw new InvalidSupportPhoto(validation.reason);
  const photos: Buffer[] = [];
  for (const file of files) {
    try {
      const prepared = await prepareReviewPhoto(Buffer.from(await file.arrayBuffer()), file.type);
      photos.push(prepared.large);
    } catch (error) {
      if (error instanceof InvalidReviewPhoto) throw new InvalidSupportPhoto("content");
      throw error;
    }
  }
  return photos;
}

/** Invalid filenames are ignored, so cleanup cannot escape the private directory. */
export async function removeSupportPhotos(rows: Array<{ filename: string }>): Promise<void> {
  await Promise.all(rows.filter(row => SUPPORT_PHOTO_FILENAME.test(row.filename)).map(async row => {
    try { await unlink(path.join(SUPPORT_UPLOAD_DIR, row.filename)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }));
}

/**
 * Candidates for the retention sweep: stored file names old enough that a
 * submission in flight cannot be caught (the file is written before its
 * TicketAttachment row). Bounded per run; anything else in the directory is
 * left alone, as the cleanup itself is.
 */
export async function agedSupportPhotoFiles(before: Date, limit: number): Promise<string[]> {
  let entries: string[];
  try { entries = await readdir(SUPPORT_UPLOAD_DIR); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const aged: string[] = [];
  for (const filename of entries) {
    if (aged.length >= limit) break;
    if (!SUPPORT_PHOTO_FILENAME.test(filename)) continue;
    try {
      const info = await stat(path.join(SUPPORT_UPLOAD_DIR, filename));
      if (info.mtimeMs < before.getTime()) aged.push(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return aged;
}

/** Each created file is tracked only after an exclusive open succeeds. If a
 * later write fails, compensate this batch without touching any prior file. */
export async function saveSupportPhotos(buffers: Buffer[]): Promise<SavedSupportPhoto[]> {
  if (buffers.length > MAX_REVIEW_PHOTOS) throw new InvalidSupportPhoto("count");
  if (buffers.some(buffer => !Buffer.isBuffer(buffer) || buffer.length === 0)) throw new InvalidSupportPhoto("content");
  if (!buffers.length) return [];
  await mkdir(SUPPORT_UPLOAD_DIR, { recursive: true });
  const saved: SavedSupportPhoto[] = [];
  try {
    for (const buffer of buffers) {
      const filename = `${randomBytes(12).toString("hex")}.webp`;
      const handle = await open(path.join(SUPPORT_UPLOAD_DIR, filename), "wx", 0o600);
      saved.push({ filename, size: buffer.length });
      try { await handle.writeFile(buffer); }
      finally { await handle.close(); }
    }
    return saved;
  } catch (error) {
    await removeSupportPhotos(saved);
    throw error;
  }
}
