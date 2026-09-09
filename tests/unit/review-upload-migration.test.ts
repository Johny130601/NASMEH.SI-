import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { migrateReviewUploads } = require("../../scripts/migrate-review-uploads.cjs") as {
  migrateReviewUploads: (publicDir: string, privateDir: string) => Promise<{ migrated: number; verifiedExisting: number }>;
};
let root: string;
let publicDir: string;
let legacy: string;
let privateDir: string;
const name = "a".repeat(24) + ".webp";
const payload = Buffer.from([0, 255, 17, 128, 65, 42]);

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "nasmeh-review-migration-"));
  publicDir = path.join(root, "public");
  legacy = path.join(publicDir, "uploads", "reviews");
  privateDir = path.join(root, "review-uploads");
  await mkdir(legacy, { recursive: true });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const run = () => migrateReviewUploads(publicDir, privateDir);

describe("legacy review media migration before startup", () => {
  it("moves generated originals and thumbnails without changing names or bytes", async () => {
    const names = [name, "a".repeat(24) + "-320.webp", "b".repeat(24) + ".jpg", "c".repeat(24) + ".png"];
    for (const file of names) await writeFile(path.join(legacy, file), payload);
    expect(await run()).toEqual({ migrated: 4, verifiedExisting: 0 });
    expect(await readdir(legacy)).toEqual([]);
    for (const file of names) expect(await readFile(path.join(privateDir, file))).toEqual(payload);
  });
  it("is idempotent and removes an identical public copy only after verifying the private file", async () => {
    await writeFile(path.join(legacy, name), payload);
    await run();
    expect(await run()).toEqual({ migrated: 0, verifiedExisting: 0 });
    await writeFile(path.join(legacy, name), payload);
    expect(await run()).toEqual({ migrated: 1, verifiedExisting: 1 });
    expect(await readFile(path.join(privateDir, name))).toEqual(payload);
    expect(await readdir(legacy)).toEqual([]);
  });
  it("preflights collisions and preserves all source and destination data", async () => {
    const safeName = "0".repeat(24) + ".jpg";
    await writeFile(path.join(legacy, safeName), payload);
    await writeFile(path.join(legacy, name), payload);
    await mkdir(privateDir);
    await writeFile(path.join(privateDir, name), "different private bytes");
    await expect(run()).rejects.toThrow("collision");
    expect(await readFile(path.join(legacy, name))).toEqual(payload);
    expect(await readFile(path.join(legacy, safeName))).toEqual(payload);
    expect(await readFile(path.join(privateDir, name), "utf8")).toBe("different private bytes");
    expect(await readdir(privateDir)).toEqual([name]);
  });
  it.each(["notes.txt", "A".repeat(24) + ".jpg", "a".repeat(24) + "-320.jpg", "nested"])("refuses unexpected legacy name %s without moving valid files", async invalid => {
    await writeFile(path.join(legacy, name), payload);
    if (invalid === "nested") await mkdir(path.join(legacy, invalid));
    else await writeFile(path.join(legacy, invalid), "unknown data");
    await expect(run()).rejects.toThrow("filename");
    expect(await readFile(path.join(legacy, name))).toEqual(payload);
    expect(await readdir(privateDir)).toEqual([]);
    expect(await readdir(legacy)).toHaveLength(2);
  });
  it("refuses a source symlink even if it has a generated filename", async () => {
    const outside = path.join(root, "original-private-file");
    await writeFile(outside, payload);
    await symlink(outside, path.join(legacy, name));
    await expect(run()).rejects.toThrow("symlink");
    expect((await lstat(path.join(legacy, name))).isSymbolicLink()).toBe(true);
    expect(await readFile(outside)).toEqual(payload);
  });
  it("refuses an identical destination symlink without deleting either source or target", async () => {
    await writeFile(path.join(legacy, name), payload);
    const outside = path.join(root, "other-file");
    await writeFile(outside, payload);
    await mkdir(privateDir);
    await symlink(outside, path.join(privateDir, name));
    await expect(run()).rejects.toThrow("symlink");
    expect(await readFile(path.join(legacy, name))).toEqual(payload);
    expect(await readFile(outside)).toEqual(payload);
    expect((await lstat(path.join(privateDir, name))).isSymbolicLink()).toBe(true);
  });
  it.each(["public", "uploads", "reviews", "private"])("refuses a symlink for the %s directory", async part => {
    const outside = path.join(root, "outside");
    await mkdir(outside);
    const link = part === "public" ? publicDir : part === "uploads" ? path.dirname(legacy) : part === "reviews" ? legacy : privateDir;
    await rm(link, { recursive: true, force: true });
    await symlink(outside, link);
    await expect(run()).rejects.toThrow("symlink");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readdir(outside)).toEqual([]);
  });
  it("never permits private destination storage inside public", async () => {
    await writeFile(path.join(legacy, name), payload);
    await expect(migrateReviewUploads(publicDir, path.join(publicDir, "new-reviews"))).rejects.toThrow("outside public");
    expect(await readFile(path.join(legacy, name))).toEqual(payload);
  });
  it("secures stale standalone copies against the same persistent private directory", async () => {
    const standalonePublic = path.join(root, ".next", "standalone", "public");
    const oldStandalone = path.join(standalonePublic, "uploads", "reviews");
    await mkdir(oldStandalone, { recursive: true });
    await writeFile(path.join(legacy, name), payload);
    await writeFile(path.join(oldStandalone, name), payload);
    await run();
    expect(await migrateReviewUploads(standalonePublic, privateDir)).toEqual({ migrated: 1, verifiedExisting: 1 });
    expect(await readdir(oldStandalone)).toEqual([]);
    expect(await readFile(path.join(privateDir, name))).toEqual(payload);
  });
  it("allows a fresh checkout with no legacy directory", async () => {
    await rm(publicDir, { recursive: true });
    expect(await run()).toEqual({ migrated: 0, verifiedExisting: 0 });
    expect((await lstat(privateDir)).isDirectory()).toBe(true);
  });
});
