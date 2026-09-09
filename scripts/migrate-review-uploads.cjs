"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Dependency-free CommonJS startup script, also loaded by unit tests. */

const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const generatedName = /^[a-f0-9]{24}(?:\.(?:jpg|png|webp)|-320\.webp)$/;

async function inspect(filePath) {
  try { return await fs.lstat(filePath); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function directoryIfPresent(directory) {
  const entry = await inspect(directory);
  if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
    throw new Error("unsafe review-media directory or symlink");
  }
  return entry !== null;
}

async function openRegular(filePath, flags = constants.O_RDONLY) {
  const before = await inspect(filePath);
  if (!before?.isFile() || before.isSymbolicLink()) throw new Error("unsafe review-media file or symlink");
  const handle = await fs.open(filePath, flags | constants.O_NOFOLLOW);
  const opened = await handle.stat();
  if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev) {
    await handle.close();
    throw new Error("review-media file changed during migration");
  }
  return handle;
}

async function hash(handle) {
  const result = createHash("sha256");
  const buffer = Buffer.alloc(64 * 1024);
  for (let position = 0; ;) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    if (!bytesRead) return result.digest("hex");
    result.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
}

async function syncDirectory(directory) {
  const handle = await fs.open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await handle.sync(); }
  catch (error) {
    // Windows cannot flush a directory handle (EPERM/EINVAL). File contents are
    // still fsynced by the caller; only the directory-entry flush is skipped there.
    if (process.platform !== "win32" || !["EPERM", "EINVAL"].includes(error.code)) throw error;
  }
  finally { await handle.close(); }
}

async function compareExisting(source, destination) {
  const original = await openRegular(source);
  try {
    const existing = await openRegular(destination);
    try {
      if (await hash(original) !== await hash(existing)) throw new Error("review-media destination collision; both copies preserved");
    } finally { await existing.close(); }
  } finally { await original.close(); }
}

async function migrateFile(source, destination, privateDirectory) {
  const original = await openRegular(source);
  let output;
  let existed = false;
  try {
    const before = await original.stat();
    try {
      output = await fs.open(destination, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      existed = true;
      // Read-write: sync() below needs write access on Windows (EPERM otherwise).
      output = await openRegular(destination, constants.O_RDWR);
    }
    if (!existed) {
      const buffer = Buffer.alloc(64 * 1024);
      for (let position = 0; ;) {
        const { bytesRead } = await original.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        for (let offset = 0; offset < bytesRead;) {
          const { bytesWritten } = await output.write(buffer, offset, bytesRead - offset, position + offset);
          if (!bytesWritten) throw new Error("review-media copy made no progress; source preserved");
          offset += bytesWritten;
        }
        position += bytesRead;
      }
    }
    // Persist and verify the private bytes and directory entry before removing
    // anything public. Interrupted partial copies fail closed on the next run.
    await output.sync();
    if (await hash(original) !== await hash(output)) throw new Error("review-media destination collision; both copies preserved");
    const after = await original.stat();
    const publicEntry = await inspect(source);
    const privateEntry = await inspect(destination);
    const copied = await output.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
        !publicEntry?.isFile() || publicEntry.isSymbolicLink() || publicEntry.ino !== after.ino || publicEntry.dev !== after.dev ||
        !privateEntry?.isFile() || privateEntry.isSymbolicLink() || privateEntry.ino !== copied.ino || privateEntry.dev !== copied.dev) {
      throw new Error("review-media file changed during migration; source preserved");
    }
    await syncDirectory(privateDirectory);
    await fs.unlink(source);
    await syncDirectory(path.dirname(source));
    return existed;
  } finally {
    await output?.close();
    await original.close();
  }
}

/** Move only generated legacy files; unexpected data must be reviewed manually. */
async function migrateReviewUploads(publicDirectory = path.join(process.cwd(), "public"), privateDirectory = path.join(process.cwd(), "review-uploads")) {
  publicDirectory = path.resolve(publicDirectory);
  privateDirectory = path.resolve(privateDirectory);
  const relative = path.relative(publicDirectory, privateDirectory);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("private review-media storage must be outside public");
  }
  if (!await directoryIfPresent(privateDirectory)) {
    await fs.mkdir(privateDirectory, { mode: 0o700 });
    await syncDirectory(path.dirname(privateDirectory));
  }
  const directories = [publicDirectory, path.join(publicDirectory, "uploads"), path.join(publicDirectory, "uploads", "reviews")];
  for (const directory of directories) {
    if (!await directoryIfPresent(directory)) return { migrated: 0, verifiedExisting: 0 };
  }
  const legacyDirectory = directories[2];
  const names = (await fs.readdir(legacyDirectory)).sort();
  // Validate the entire legacy directory before the first public file is removed.
  for (const name of names) {
    if (!generatedName.test(name)) throw new Error("unexpected legacy review-media filename; files preserved");
    const source = path.join(legacyDirectory, name);
    const entry = await inspect(source);
    if (!entry?.isFile() || entry.isSymbolicLink()) throw new Error("unsafe legacy review-media file or symlink");
    const destination = path.join(privateDirectory, name);
    if (await inspect(destination)) await compareExisting(source, destination);
  }
  const result = { migrated: 0, verifiedExisting: 0 };
  for (const name of names) {
    const existed = await migrateFile(path.join(legacyDirectory, name), path.join(privateDirectory, name), privateDirectory);
    result.migrated += 1;
    if (existed) result.verifiedExisting += 1;
  }
  if ((await fs.readdir(legacyDirectory)).length) throw new Error("legacy review-media directory changed during migration");
  return result;
}

module.exports = { migrateReviewUploads };

if (require.main === module) {
  const args = process.argv.slice(2);
  const task = args.length === 0 || args.length === 2 ? migrateReviewUploads(...args)
    : Promise.reject(new Error("expected either no arguments or public and private directories"));
  task.then(result => {
    if (result.migrated) console.log(`[review-media] moved ${result.migrated} legacy files into private storage`);
  }).catch(error => {
    console.error(`[review-media] startup refused: ${error.message}`);
    process.exitCode = 1;
  });
}
