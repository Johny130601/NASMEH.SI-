import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";

/**
 * Product and collection media (§14.2, §14.3): files live in the persistent
 * `catalog-uploads/{products|collections}/<ownerId>/` directory (a Docker
 * volume; a junction from the standalone directory locally) and are served by
 * `app/uploads/[owner]/[ownerId]/[filename]/route.ts` under
 * `/uploads/<owner>/<ownerId>/<hex>.webp`. The production server inventories
 * `public/` once at startup, so runtime uploads cannot go there. Every upload
 * is decoded and re-encoded to WebP so no client bytes are stored as-is.
 */
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
export const MEDIA_MIME: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
export const MEDIA_OWNERS = ["products", "collections", "media"] as const;
/** Owner id of the global media library (§14.10) under catalog-uploads/media/. */
export const MEDIA_LIBRARY_OWNER_ID = "knjiznica-medijev";
export type MediaOwner = (typeof MEDIA_OWNERS)[number];

export const CATALOG_UPLOAD_DIR = path.join(process.cwd(), "catalog-uploads");
export const MEDIA_OWNER_ID = /^[a-z0-9][a-z0-9-]{9,39}$/i;
export const MEDIA_FILENAME = /^[a-f0-9]{24}\.webp$/;
const MANAGED_URL = /^\/uploads\/(products|collections|media)\/([a-z0-9][a-z0-9-]{9,39})\/([a-f0-9]{24}\.webp)$/i;

export class InvalidMediaFile extends Error {
  constructor(readonly reason: "mime" | "size" | "content") {
    super(`invalid media: ${reason}`);
    this.name = "InvalidMediaFile";
  }
}

/** Validates, decodes and re-encodes one upload; throws InvalidMediaFile otherwise. */
export async function prepareMediaImage(file: { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }, maxWidth = 1600): Promise<Buffer> {
  const expected = MEDIA_MIME[file.type];
  if (!expected) throw new InvalidMediaFile("mime");
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_MEDIA_BYTES) throw new InvalidMediaFile("size");
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const source = sharp(bytes, { failOn: "warning", limitInputPixels: 30_000_000 });
    const meta = await source.metadata();
    if (meta.format !== expected || !meta.width || !meta.height || meta.width > 10000 || meta.height > 10000 || (meta.pages ?? 1) !== 1) {
      throw new InvalidMediaFile("content");
    }
    return await source.rotate().resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch (error) {
    if (error instanceof InvalidMediaFile) throw error;
    throw new InvalidMediaFile("content");
  }
}

/** Absolute path of a managed file; null for anything outside the managed layout. */
export function mediaFilePath(owner: string, ownerId: string, filename: string): string | null {
  if (!(MEDIA_OWNERS as readonly string[]).includes(owner) || !MEDIA_OWNER_ID.test(ownerId) || !MEDIA_FILENAME.test(filename)) return null;
  return path.join(CATALOG_UPLOAD_DIR, owner, ownerId, filename);
}

/** Writes one prepared image and returns its public URL. */
export async function saveMediaImage(owner: MediaOwner, ownerId: string, buffer: Buffer): Promise<string> {
  if (!MEDIA_OWNER_ID.test(ownerId)) throw new Error("invalid owner id");
  const directory = path.join(CATALOG_UPLOAD_DIR, owner, ownerId);
  await mkdir(directory, { recursive: true });
  const name = `${randomBytes(12).toString("hex")}.webp`;
  const handle = await open(path.join(directory, name), "wx", 0o644);
  try {
    await handle.writeFile(buffer);
  } finally {
    await handle.close();
  }
  return `/uploads/${owner}/${ownerId}/${name}`;
}

export function isManagedMediaUrl(url: unknown): url is string {
  return typeof url === "string" && MANAGED_URL.test(url);
}

/** Deletes a managed file; placeholders and foreign URLs are left alone. */
export async function removeMediaImage(url: unknown): Promise<void> {
  if (!isManagedMediaUrl(url)) return;
  const match = MANAGED_URL.exec(url)!;
  const file = mediaFilePath(match[1].toLowerCase(), match[2], match[3].toLowerCase());
  if (!file) return;
  try {
    await unlink(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
