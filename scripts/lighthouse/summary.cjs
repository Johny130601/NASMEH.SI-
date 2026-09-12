"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Dependency-free CommonJS report summarizer. */

// Summarizes Lighthouse CI filesystem uploads: one Markdown table per device with the category
// scores and the budgeted metrics of the representative (median) run of every URL.
//   node scripts/lighthouse/summary.cjs [outputDir]   (default docs/testing/lighthouse/latest)
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2] ?? path.join(__dirname, "..", "..", "docs", "testing", "lighthouse", "latest");
const ms = (audit) => (audit && typeof audit.numericValue === "number" ? `${Math.round(audit.numericValue)} ms` : "—");
const score = (value) => (typeof value === "number" ? String(Math.round(value * 100)) : "—");
const lines = [];
for (const device of ["desktop", "mobile"]) {
  const manifestPath = path.join(root, device, "manifest.json");
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const runsPerUrl = manifest.length / new Set(manifest.map((run) => run.url)).size;
  lines.push(`### ${device} (${runsPerUrl} runs per URL, representative run shown)`, "");
  lines.push("| URL | Perf | A11y | BP | SEO | LCP | TBT | CLS | FCP | Speed Index |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const run of manifest.filter((entry) => entry.isRepresentativeRun)) {
    const report = JSON.parse(fs.readFileSync(path.resolve(path.dirname(manifestPath), run.jsonPath), "utf8"));
    const audits = report.audits;
    const cls = audits["cumulative-layout-shift"];
    lines.push(`| ${new URL(run.url).pathname} | ${score(run.summary.performance)} | ${score(run.summary.accessibility)} | ${score(run.summary["best-practices"])} | ${score(run.summary.seo)} | ${ms(audits["largest-contentful-paint"])} | ${ms(audits["total-blocking-time"])} | ${cls && typeof cls.numericValue === "number" ? cls.numericValue.toFixed(3) : "—"} | ${ms(audits["first-contentful-paint"])} | ${ms(audits["speed-index"])} |`);
  }
  lines.push("");
}
const out = lines.join("\n");
fs.writeFileSync(path.join(root, "summary.md"), out);
process.stdout.write(out);
