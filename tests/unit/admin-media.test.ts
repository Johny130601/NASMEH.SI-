import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Media guards (§14.2): MIME/size/content checks, managed paths, WebP re-encoding. */

let tmp: string;
let media: typeof import("@/lib/admin/media");

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "nasmeh-media-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmp);
  vi.resetModules();
  media = await import("@/lib/admin/media");
});
afterAll(async () => {
  vi.restoreAllMocks();
  await rm(tmp, { recursive: true, force: true });
});

function fileOf(buffer: Buffer, type: string, size = buffer.byteLength) {
  const bytes = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(bytes).set(buffer);
  return { type, size, arrayBuffer: async () => bytes };
}

const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 20, g: 90, b: 200 } } }).png().toBuffer();

describe("prepareMediaImage", () => {
  it("re-encodes an accepted PNG to WebP and bounds the size", async () => {
    const out = await media.prepareMediaImage(fileOf(await png(3000, 30), "image/png"));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(16);
    const small = await media.prepareMediaImage(fileOf(await png(120, 80), "image/png"), 400);
    expect(await sharp(small).metadata()).toMatchObject({ format: "webp", width: 120, height: 80 });
  });

  it("refuses unsupported types, empty or oversized files and mislabelled content", async () => {
    const image = await png(10, 10);
    await expect(media.prepareMediaImage(fileOf(image, "image/gif"))).rejects.toMatchObject({ reason: "mime" });
    await expect(media.prepareMediaImage(fileOf(image, "image/png", 0))).rejects.toMatchObject({ reason: "size" });
    await expect(media.prepareMediaImage(fileOf(image, "image/png", media.MAX_MEDIA_BYTES + 1))).rejects.toMatchObject({ reason: "size" });
    await expect(media.prepareMediaImage(fileOf(image, "image/jpeg"))).rejects.toMatchObject({ reason: "content" });
    await expect(media.prepareMediaImage(fileOf(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/png"))).rejects.toMatchObject({ reason: "content" });
  });
});

describe("managed paths", () => {
  const ownerId = "cmf0product00000000000001";
  const name = "0123456789abcdef01234567.webp";

  it("recognises only the managed URL layout and resolves files inside the upload directory", () => {
    expect(media.isManagedMediaUrl(`/uploads/products/${ownerId}/${name}`)).toBe(true);
    expect(media.isManagedMediaUrl(`/uploads/collections/${ownerId}/${name}`)).toBe(true);
    expect(media.isManagedMediaUrl("/uploads/placeholder-trakci.svg")).toBe(false);
    expect(media.isManagedMediaUrl(`/uploads/reviews/${name}`)).toBe(false);
    expect(media.isManagedMediaUrl(`/uploads/products/../${name}`)).toBe(false);
    expect(media.isManagedMediaUrl(null)).toBe(false);
    expect(media.mediaFilePath("products", ownerId, name)).toBe(path.join(tmp, "catalog-uploads", "products", ownerId, name));
    expect(media.mediaFilePath("reviews", ownerId, name)).toBeNull();
    expect(media.mediaFilePath("products", "..", name)).toBeNull();
    expect(media.mediaFilePath("products", ownerId, "../secret.webp")).toBeNull();
    expect(media.mediaFilePath("products", ownerId, "0123456789abcdef01234567.png")).toBeNull();
  });

  it("writes new files under the owner directory, never overwrites and removes only managed files", async () => {
    const bytes = await media.prepareMediaImage(fileOf(await png(8, 8), "image/png"));
    const url = await media.saveMediaImage("products", ownerId, bytes);
    expect(url).toMatch(new RegExp(`^/uploads/products/${ownerId}/[a-f0-9]{24}\\.webp$`));
    const file = media.mediaFilePath("products", ownerId, url.split("/").pop()!)!;
    expect(await readFile(file)).toEqual(bytes);
    const second = await media.saveMediaImage("products", ownerId, bytes);
    expect(second).not.toBe(url);
    await expect(media.saveMediaImage("products", "bad id", bytes)).rejects.toThrow("invalid owner id");

    await media.removeMediaImage(url);
    await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(media.removeMediaImage(url)).resolves.toBeUndefined();
    await expect(media.removeMediaImage("/uploads/placeholder-trakci.svg")).resolves.toBeUndefined();
    expect((await stat(media.mediaFilePath("products", ownerId, second.split("/").pop()!)!)).isFile()).toBe(true);
  });
});
