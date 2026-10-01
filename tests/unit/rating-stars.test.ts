import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

import { RatingStars } from "@/components/storefront/catalog/RatingStars";

/** QA 2026-09-30: the stars' accessible name used a decimal point ("3.5 / 5") next to the visible "3,5". */
describe("RatingStars accessible name", () => {
  it("reads the average with the Slovenian decimal comma", () => {
    const html = renderToStaticMarkup(React.createElement(RatingStars, { rating: { average: 3.5, count: 2 } }));
    expect(html).toContain('aria-label="Ocena 3,5 od 5"');
    expect(html).not.toMatch(/aria-label="[^"]*\d\.\d/);
  });

  it("keeps one decimal for a whole average", () => {
    const html = renderToStaticMarkup(React.createElement(RatingStars, { rating: { average: 5, count: 1 }, showCount: false }));
    expect(html).toContain('aria-label="Ocena 5,0 od 5"');
  });

  it("still renders no stars without reviews", () => {
    expect(renderToStaticMarkup(React.createElement(RatingStars, { rating: null }))).not.toContain('role="img"');
  });
});

/**
 * QA 2026-09-30: Tailwind v4's translate-* and scale-* utilities set the
 * individual `translate` and `scale` properties. A hand-written transition
 * list that names only `transform` lets the card's lift and the packshot zoom
 * snap while the shadow fades (AGENTS §8.23).
 */
describe("CatalogCard hover motion", () => {
  const source = readFileSync(join(__dirname, "..", "..", "components", "storefront", "catalog", "CatalogCard.tsx"), "utf8");

  it("transitions the property each hover utility sets", () => {
    const classLists = [...source.matchAll(/className=\{?[`"]([^`"]*)[`"]/g)].map((match) => match[1]);
    const lifted = classLists.filter((list) => /(^|\s)(hover|group-hover):-?translate-/.test(list));
    const zoomed = classLists.filter((list) => /(^|\s)(hover|group-hover):scale-/.test(list));
    expect(lifted.length).toBeGreaterThan(0);
    expect(zoomed.length).toBeGreaterThan(0);
    for (const list of lifted) expect(list).toMatch(/transition-\[[^\]]*\btranslate\b[^\]]*\]/);
    for (const list of zoomed) expect(list).toMatch(/transition-\[[^\]]*\bscale\b[^\]]*\]/);
  });
});
