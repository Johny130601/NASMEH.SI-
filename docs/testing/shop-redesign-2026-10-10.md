# Shop page redesign — 2026-10-10

Second pass of the day, after the home redesign (commit 78d6f07): the owner captured the HiSmile "All products" page (four screenshots, `Desktop/HSIMILE SHOP/Vsi izdelki`) and asked for `/trgovina` to follow the same essence, "a little changed, improved visually and functionally". Layout and mechanics only; no HiSmile names, lines, imagery or pink.

## What changed

| Block | Before | After |
|---|---|---|
| Top of page | a dark placeholder banner image for the all view, heading under it | a brand-colour **title band** (`.ui-band-bg`, static) with the live `<h1>`, a claim-free subline on the all view ("Trakci, ustna voda, serum in paket …") and nothing else; a collection with its own uploaded banner keeps the sized image and the heading under it, and "hide banner text" still leaves an sr-only heading |
| Filter row | tabs and sort in the content | a slim hairline **filter bar**: collection pills left, the live **product count** ("5 izdelkov", `izdelekForm`) and the sort menu right |
| Grid | four columns, the sold-out travel strips alone on a second row | **three columns on desktop**, two on a phone, `grid-flow-dense`; the bundle is a **double-wide card** (`CatalogCard layout="wide"`: 2:1 tile, text and CTA side by side on desktop, the computed component list "V paketu: …"), so five products fill two rows exactly |
| Cards (every surface) | badges inside the tile | the admin badge and the sold-out pill **float centred on the tile's top edge**, the computed "−X %" pill stays inside; the first card of the grid loads its image eagerly with high priority (`priority`, the LCP candidate); the CTA pills carry the hover shine; "Obvestite me" has a bell icon |
| SEO block | plain text under the grid | a light rounded panel (`.ui-reveal`, below the fold) |
| Catalog shape | the home bundle card ran its own components query | `CatalogProduct.bundleComponents` (title and quantity from the bundle's rows) feeds the home bundle card and the wide grid card; `getBundleComponentTitles` removed |
| Placeholders | the bundle's square artwork had its title baked in, visible twice on the wide tile | `placeholder-paket.svg` redrawn as a text-free composition kept inside the middle band of the square, so the 2:1 crop shows every product |

Spec notes: NASMEH_FEATURES §5 (band, double-wide card — listed P2-growth, built at the owner's request —, floating chips).

## Why the figures are honest

- Product count: the length of the list actually rendered after the collection filter.
- Component list, price, value line: the same `CatalogProduct` the card already carried; the component titles come from the bundle rows, in stored order.
- Subline: descriptive, VAT rule included, no sales claim.

## Verification

Browser checks (Chromium via Playwright against the dev server, desktop 1440 and phone 390): full-page captures with no horizontal overflow; crops of the band, bar and grid reviewed at full resolution. Desktop rows: strips, mouthwash, serum / bundle (wide), travel strips. Phone rows: strips + mouthwash / serum + travel / bundle full width.

Gates:

- `tsc --noEmit` and `eslint` on every changed file: clean. Catalog, pricing, availability, copy-import and claims unit files: green (fixtures gained the component product title).
- Full Vitest: 179 files green (the catalog hooks fixtures needed a component product title on every bundle item; two lines, one of them behind a variable stock value, were patched).
- Playwright, run 1 (full suite, standalone build, fresh `nasmeh_e2e_shop`): 208 passed, 3 failed, 5 did not run. (a) **Real finding**: the wide card's component list printed the mouthwash's title on `/trgovina` after the visibility test had set it to DRAFT — a hidden or draft product's name leaked through the bundle it belongs to. Fix: `listableBundleComponents` names every component or none (a component that is a draft or a hidden deal empties the list; never a partial "V paketu" claim), unit-tested, and the home bundle card falls back to the image banner in that case. (b) `catalog.spec` SSR test still expected the retired placeholder banner: updated to the band. (c) `hooks.spec` hover test asserted opacity 0 while the pointer rested on the first card (it stays where the cookie button was, which the redesigned grid now puts under it): the test moves the pointer away first. The five that did not run are the rest of the serial cart spec after (a).
- Playwright, run 2 (rebuilt with the fix, fresh database): PENDING
- Lighthouse: PENDING

Test changes: `performance.spec` asserts the band and the eager first card image instead of the retired placeholder banner box; `catalog-hooks` fixtures carry a component title.
