"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Dependency-free CommonJS startup script. */

// `next start` does not support output:"standalone" — assemble the standalone
// directory the same way the Dockerfile does, then run its server. Written in
// Node rather than sh so `npm start` (and Playwright's webServer) also work on
// Windows. The Docker image does not use this file: its entrypoint runs
// server.js directly against the copied public/static directories.

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const projectDir = process.cwd();
const standaloneDir = path.join(projectDir, ".next", "standalone");
const guard = path.join(projectDir, "scripts", "migrate-review-uploads.cjs");
const reviewUploads = path.join(projectDir, "review-uploads");

function refuse(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
  refuse("No .next/standalone build found — run `npm run build` first.");
}

// Guard both the source tree and any stale standalone public copies before
// Next inventories public files (which would bypass the protected media route).
for (const publicDir of [path.join(projectDir, "public"), path.join(standaloneDir, "public")]) {
  const result = spawnSync(process.execPath, [guard, publicDir, reviewUploads], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

fs.mkdirSync(path.join(standaloneDir, "public"), { recursive: true });
fs.mkdirSync(path.join(standaloneDir, ".next", "static"), { recursive: true });
fs.cpSync(path.join(projectDir, "public"), path.join(standaloneDir, "public"), { recursive: true });
fs.cpSync(path.join(projectDir, ".next", "static"), path.join(standaloneDir, ".next", "static"), { recursive: true });

// The standalone server chdirs into its own directory, so its private media
// directories must be links to the persistent project directories. Requests
// still pass through the moderation-aware routes, never Next's public server.
ensurePersistentLink("review-uploads", "review-media");
fs.mkdirSync(path.join(projectDir, "support-uploads"), { recursive: true });
ensurePersistentLink("support-uploads", "support-media");

const server = spawn(process.execPath, [path.join(standaloneDir, "server.js")], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

/** Link targets compare as resolved paths; Windows readlink may add a \\?\ prefix. */
function canonical(target) {
  const stripped = target.replace(/^\\\\\?\\/, "").replace(/^\\\?\?\\/, "");
  const resolved = path.resolve(stripped).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function ensurePersistentLink(name, label) {
  const target = path.join(projectDir, name);
  const link = path.join(standaloneDir, name);
  let entry = null;
  try { entry = fs.lstatSync(link); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (entry && entry.isSymbolicLink()) {
    if (canonical(fs.readlinkSync(link)) !== canonical(target)) {
      refuse(`[${label}] unexpected standalone storage link; refusing startup`);
    }
    return;
  }
  if (entry) refuse(`[${label}] standalone storage is not the persistent project link; refusing startup`);
  // Junctions need no privilege on Windows; directory symlinks elsewhere.
  fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
}
