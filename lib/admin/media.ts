import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { MEDIA_UPLOAD_LIMITS } from "./cms-schemas";

/**
 * Product and collection media (§14.2, §14.3): files live in the persistent
 * `catalog-uploads/{products|collections}/<ownerId>/` directory (a Docker
 * volume; a junction from the standalone directory locally) and are served by
 * `app/uploads/[owner]/[ownerId]/[filename]/route.ts` under
 * `/uploads/<owner>/<ownerId>/<hex>.webp`. The production server inventories
 * `public/` once at startup, so runtime uploads cannot go there. Every image
 * upload is decoded and re-encoded to WebP so no client image bytes are stored
 * as-is. The global library also takes the hero video (QA M13): MP4 or WebM,
 * recognised by its container signature, within one request's size, stored as
 * uploaded (there is no video encoder on the host) and only under `media/`.
 */
export const MAX_MEDIA_BYTES = MEDIA_UPLOAD_LIMITS.imageBytes;
export const MAX_MEDIA_VIDEO_BYTES = MEDIA_UPLOAD_LIMITS.videoBytes;
export const MEDIA_MIME: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
export const MEDIA_VIDEO_MIME: Record<string, MediaVideoExtension> = { "video/mp4": "mp4", "video/webm": "webm" };
export type MediaVideoExtension = "mp4" | "webm";
export const MEDIA_OWNERS = ["products", "collections", "media"] as const;
/** Owner id of the global media library (§14.10) under catalog-uploads/media/. */
export const MEDIA_LIBRARY_OWNER_ID = "knjiznica-medijev";
export type MediaOwner = (typeof MEDIA_OWNERS)[number];

export const CATALOG_UPLOAD_DIR = path.join(process.cwd(), "catalog-uploads");
export const MEDIA_OWNER_ID = /^[a-z0-9][a-z0-9-]{9,39}$/i;
export const MEDIA_FILENAME = /^[a-f0-9]{24}\.(?:webp|mp4|webm)$/;
const MANAGED_URL = /^\/uploads\/(products|collections|media)\/([a-z0-9][a-z0-9-]{9,39})\/([a-f0-9]{24}\.(?:webp|mp4|webm))$/i;
const CONTENT_TYPES: Record<string, string> = { webp: "image/webp", mp4: "video/mp4", webm: "video/webm" };
/** ISO base-media brands of ordinary MP4 video (not QuickTime, HEIF or AVIF images, which share the box layout). */
const MP4_BRANDS = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V ", "mmp4", "msnv"]);

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

/** The container a video's first bytes declare: an MP4 `ftyp` box with a video brand, or a WebM EBML header. */
export function sniffVideo(bytes: Uint8Array): MediaVideoExtension | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && MP4_BRANDS.has(ascii(8, 12))) return "mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && ascii(4, Math.min(bytes.length, 64)).includes("webm")) return "webm";
  return null;
}

/** Validates one video upload for the library: declared type, size and container must agree. */
export async function prepareMediaVideo(file: { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<{ buffer: Buffer; extension: MediaVideoExtension }> {
  const expected = MEDIA_VIDEO_MIME[file.type];
  if (!expected) throw new InvalidMediaFile("mime");
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_MEDIA_VIDEO_BYTES) throw new InvalidMediaFile("size");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (sniffVideo(buffer) !== expected) throw new InvalidMediaFile("content");
  return { buffer, extension: expected };
}

/** Absolute path of a managed file; null for anything outside the managed layout (videos live in the library only). */
export function mediaFilePath(owner: string, ownerId: string, filename: string): string | null {
  if (!(MEDIA_OWNERS as readonly string[]).includes(owner) || !MEDIA_OWNER_ID.test(ownerId) || !MEDIA_FILENAME.test(filename)) return null;
  if (!filename.endsWith(".webp") && owner !== "media") return null;
  return path.join(CATALOG_UPLOAD_DIR, owner, ownerId, filename);
}

/** Content type of a managed file, by its extension. */
export function mediaContentType(filename: string): string {
  return CONTENT_TYPES[filename.slice(filename.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
}

/**
 * The response for a managed file's bytes: its own content type, immutable caching, and byte
 * ranges — Safari fetches video only through `Range` requests and plays nothing without a 206.
 * One `bytes=start-end` range (or a suffix) is served; anything unsatisfiable answers 416.
 */
export function mediaFileResponse(bytes: Uint8Array, filename: string, range: string | null): Response {
  const size = bytes.byteLength;
  const headers: Record<string, string> = {
    "Content-Type": mediaContentType(filename),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!range || !match || (match[1] === "" && match[2] === "")) {
    return new Response(bytes.slice(), { headers: { ...headers, "Content-Length": String(size) } });
  }
  let start: number;
  let end: number;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (size === 0 || start >= size || start > end) {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
  });
}

/** Writes one prepared image and returns its public URL. */
export async function saveMediaImage(owner: MediaOwner, ownerId: string, buffer: Buffer): Promise<string> {
  return saveMediaFile(owner, ownerId, buffer, "webp");
}

/** Writes one prepared file (a WebP image, or a library video) under a random name and returns its public URL. */
export async function saveMediaFile(owner: MediaOwner, ownerId: string, buffer: Buffer, extension: "webp" | MediaVideoExtension): Promise<string> {
  if (!MEDIA_OWNER_ID.test(ownerId)) throw new Error("invalid owner id");
  if (extension !== "webp" && owner !== "media") throw new Error("videos belong to the media library");
  const directory = path.join(CATALOG_UPLOAD_DIR, owner, ownerId);
  await mkdir(directory, { recursive: true });
  const name = `${randomBytes(12).toString("hex")}.${extension}`;
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
