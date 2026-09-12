"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- Lighthouse CI config (Node, CommonJS). */

// Phase 9 step 2: Lighthouse CI against the standalone server (npm run build && npm run start with
// the Playwright env, or any running deployment via LH_BASE_URL). Four storefront templates:
// home, a product page, the cart and the checkout. The cart and the checkout render with one
// line in the guest cart when LH_CART_COOKIE holds a signed cart (scripts/lighthouse/cart-cookie.ts).
//
//   npm run lighthouse            # desktop then mobile: collect, assert against the budgets, write reports
//   LH_OUTPUT_DIR=<dir>           # reports land in <dir>/<device>/ (default docs/testing/lighthouse/latest)
//
// Budgets (docs/plans/phase-9.md step 2): LCP < 2.5 s, TBT < 200 ms (lab proxy for INP), CLS < 0.1,
// performance >= 0.90 on desktop and >= 0.80 on mobile — asserted on the median of the runs.
const path = require("node:path");

const BASE_URL = process.env.LH_BASE_URL ?? "http://127.0.0.1:4317";
const PAGES = ["/", "/izdelek/belilni-trakci-za-zobe", "/cart", "/checkout"];
const OUTPUT_DIR = process.env.LH_OUTPUT_DIR ?? path.join(__dirname, "..", "..", "docs", "testing", "lighthouse", "latest");

/** @param {"desktop" | "mobile"} device @param {number} minScore */
function lighthouseConfig(device, minScore) {
  const cookie = process.env.LH_CART_COOKIE;
  const median = { aggregationMethod: "median" };
  return {
    ci: {
      collect: {
        url: PAGES.map((page) => `${BASE_URL}${page}`),
        numberOfRuns: Number(process.env.LH_RUNS ?? 3),
        settings: {
          ...(device === "desktop" ? { preset: "desktop" } : {}),
          ...(cookie ? { extraHeaders: { Cookie: `nasmeh_cart=${cookie}` } } : {}),
        },
      },
      assert: {
        assertions: {
          "categories:performance": ["error", { minScore, ...median }],
          "largest-contentful-paint": ["error", { maxNumericValue: 2500, ...median }],
          "total-blocking-time": ["error", { maxNumericValue: 200, ...median }],
          "cumulative-layout-shift": ["error", { maxNumericValue: 0.1, ...median }],
        },
      },
      upload: {
        target: "filesystem",
        outputDir: path.join(OUTPUT_DIR, device),
        reportFilenamePattern: "%%PATHNAME%%-%%DATETIME%%.%%EXTENSION%%",
      },
    },
  };
}

module.exports = { lighthouseConfig, PAGES, BASE_URL, OUTPUT_DIR };
