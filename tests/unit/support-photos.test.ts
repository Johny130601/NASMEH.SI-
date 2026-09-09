import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import sharp from "sharp";

const fs = vi.hoisted(() => ({ mkdir: vi.fn(), open: vi.fn(), unlink: vi.fn(), write: vi.fn(), close: vi.fn() }));
vi.mock("node:fs/promises", () => ({ mkdir: fs.mkdir, open: fs.open, unlink: fs.unlink, writeFile: vi.fn() }));
import { InvalidReviewPhoto } from "@/lib/reviews/photo-storage";
import { MAX_PHOTO_BYTES } from "@/lib/reviews/photos";
import { InvalidSupportPhoto, prepareSupportPhotos, removeSupportPhotos, saveSupportPhotos, SUPPORT_UPLOAD_DIR } from "@/lib/support/photos";

beforeEach(() => {
  vi.clearAllMocks();
  fs.mkdir.mockResolvedValue(undefined); fs.unlink.mockResolvedValue(undefined);
  fs.write.mockResolvedValue(undefined); fs.close.mockResolvedValue(undefined);
  fs.open.mockResolvedValue({ writeFile: fs.write, close: fs.close });
});

describe("private support photo preparation", () => {
  it("reuses actual image decoding and returns sanitized WebP only without storing files", async () => {
    const bytes = await sharp({ create: { width: 1000, height: 500, channels: 3, background: "blue" } }).withMetadata().png().toBuffer();
    const result = await prepareSupportPhotos([new File([new Uint8Array(bytes)], "private evidence.png", { type: "image/png" })]);
    expect(result).toHaveLength(1);
    const metadata = await sharp(result[0]).metadata();
    expect(metadata.format).toBe("webp"); expect(metadata.width).toBe(960); expect(metadata.exif).toBeUndefined();
    expect(fs.mkdir).not.toHaveBeenCalled(); expect(fs.open).not.toHaveBeenCalled();
  });
  it("rejects spoofed content and mismatched declared MIME", async () => {
    await expect(prepareSupportPhotos([new File(["<html>private</html>"], "photo.png", { type: "image/png" })])).rejects.toMatchObject({ reason: "content" });
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer();
    await expect(prepareSupportPhotos([new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" })])).rejects.toBeInstanceOf(InvalidSupportPhoto);
    expect(fs.open).not.toHaveBeenCalled();
  });
  it("rejects counts, unsupported MIME, empty and oversized files before reading their bodies", async () => {
    const file = new File(["data"], "photo.png", { type: "image/png" });
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(prepareSupportPhotos(Array.from({ length: 5 }, () => file))).rejects.toMatchObject({ reason: "count" });
    expect(read).not.toHaveBeenCalled();
    await expect(prepareSupportPhotos([new File(["data"], "document.svg", { type: "image/svg+xml" })])).rejects.toMatchObject({ reason: "mime" });
    await expect(prepareSupportPhotos([new File([], "empty.png", { type: "image/png" })])).rejects.toMatchObject({ reason: "size" });
    await expect(prepareSupportPhotos([new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "large.png", { type: "image/png" })])).rejects.toMatchObject({ reason: "size" });
  });
  it("keeps the shared InvalidReviewPhoto catch contract", () => {
    expect(new InvalidSupportPhoto("content")).toBeInstanceOf(InvalidReviewPhoto);
  });
});

describe("private support storage and rollback", () => {
  it("stores generated filenames exclusively under the private directory with byte sizes", async () => {
    const buffers = [Buffer.from("prepared webp one"), Buffer.from("prepared webp two")];
    const rows = await saveSupportPhotos(buffers);
    expect(SUPPORT_UPLOAD_DIR).toBe(path.join(process.cwd(), "support-uploads"));
    expect(rows).toHaveLength(2); expect(rows[0].filename).not.toBe(rows[1].filename);
    rows.forEach((row, i) => {
      expect(row.filename).toMatch(/^[a-f0-9]{24}\.webp$/); expect(row.size).toBe(buffers[i].length);
      expect(fs.open).toHaveBeenNthCalledWith(i + 1, path.join(SUPPORT_UPLOAD_DIR, row.filename), "wx", 0o600);
      expect(fs.write).toHaveBeenNthCalledWith(i + 1, buffers[i]);
    });
    expect(fs.close).toHaveBeenCalledTimes(2); expect(fs.unlink).not.toHaveBeenCalled();
  });
  it("removes both completed and partially written files when a later write fails", async () => {
    const failure = Object.assign(new Error("storage full"), { code: "ENOSPC" });
    fs.write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure);
    await expect(saveSupportPhotos([Buffer.from("first"), Buffer.from("second")])).rejects.toBe(failure);
    expect(fs.close).toHaveBeenCalledTimes(2);
    expect(fs.unlink.mock.calls.map(call => call[0])).toEqual(fs.open.mock.calls.map(call => call[0]));
  });
  it("does not remove an existing colliding file whose exclusive open failed", async () => {
    const collision = Object.assign(new Error("already exists"), { code: "EEXIST" });
    fs.open.mockResolvedValueOnce({ writeFile: fs.write, close: fs.close }).mockRejectedValueOnce(collision);
    await expect(saveSupportPhotos([Buffer.from("first"), Buffer.from("second")])).rejects.toBe(collision);
    expect(fs.unlink).toHaveBeenCalledTimes(1); expect(fs.unlink).toHaveBeenCalledWith(fs.open.mock.calls[0][0]);
    expect(fs.unlink).not.toHaveBeenCalledWith(fs.open.mock.calls[1][0]);
  });
  it("ignores unsafe cleanup filenames and absent files", async () => {
    const filename = `${"a".repeat(24)}.webp`;
    fs.unlink.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
    await removeSupportPhotos([{ filename }, { filename: "../../.env" }, { filename: "/tmp/private.webp" }, { filename: `${"b".repeat(24)}.jpg` }]);
    expect(fs.unlink).toHaveBeenCalledTimes(1); expect(fs.unlink).toHaveBeenCalledWith(path.join(SUPPORT_UPLOAD_DIR, filename));
  });
  it("reports real deletion errors instead of falsely claiming removal", async () => {
    const failure = Object.assign(new Error("permission denied"), { code: "EACCES" }); fs.unlink.mockRejectedValueOnce(failure);
    await expect(removeSupportPhotos([{ filename: `${"a".repeat(24)}.webp` }])).rejects.toBe(failure);
  });
  it("skips empty batches and refuses malformed prepared batches before filesystem writes", async () => {
    expect(await saveSupportPhotos([])).toEqual([]);
    await expect(saveSupportPhotos([Buffer.alloc(0)])).rejects.toMatchObject({ reason: "content" });
    await expect(saveSupportPhotos(Array.from({ length: 5 }, () => Buffer.from("image")))).rejects.toMatchObject({ reason: "count" });
    expect(fs.mkdir).not.toHaveBeenCalled(); expect(fs.open).not.toHaveBeenCalled();
  });
});
