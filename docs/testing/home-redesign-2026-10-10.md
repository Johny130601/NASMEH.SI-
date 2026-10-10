# Home redesign — 2026-10-10

The owner captured the current HiSmile home page (seven screenshots, `Desktop/HSIMILE SHOP/Home page`, plus one of their shop grid) and asked for our home page to keep that essence while looking more modern, with interactive animations. This record lists what changed, why each change is compliant with AGENTS §8.23 (every figure a computed fact, nothing in the first viewport animating on load), and how it was verified.

The reference was used for layout and mechanics only: no HiSmile names, lines, imagery or pink reached the repo.

## What changed

| Block | Before | After |
|---|---|---|
| Hero | white, light-weight headline, chip, CTA | static brand-tinted backdrop (`.ui-hero-bg`), bold uppercase headline with an optional brand-coloured second line (`titleAccent`, new optional hero Setting field with an admin input; seed and dev row "Brez peroksida."), the linked product's **computed** price beside the CTA (`data-hero-price`), guarantee line with its terms link under the CTA, poster in a rounded frame that zooms on hover, CTA hover shine (`.ui-shine`) |
| Trust strip | unchanged data | white band under the hero |
| Product rail | heading only, bordered cards | left column with heading, claim-free subline and an outlined "Vsi izdelki" pill; borderless `rounded-panel` cards with a heavier price (`CatalogCard`, every surface) |
| Bundle band | full-bleed teal strip | rounded teal panel inside the page width, white `light` pill (new `UiButton` variant) |
| Routine banner | clickable image with the title baked into the placeholder | split bundle card: artwork link (title as its accessible name), eyebrow, title, the bundle's component list (`getBundleComponentTitles`), price, Omnibus prior price and 30-day line **or** the value line, direct "Dodaj paket v košarico", "Več o paketu"; the live footnote stays under the card; falls back to the image banner when the link is not a listed bundle |
| Reviews | none | fifth home section `reviews` (`lib/reviews/home.ts`, `HomeReviews`): store-wide aggregate line and the newest six published reviews with text as quote cards (byline from `reviewAuthor`, verified-buyer pill, product link, month); **absent below three reviews**; spec §4 item 5 (P2-growth, P1 once volume exists) — built latent, hideable in `/admin/vsebina/domov` |
| Newsletter | white block | dark rounded band (title, hook, form with the white pill; `NewsletterForm`/`PrivacyNotice` `tone="dark"`) |
| Motion | section reveals | `.ui-reveal-stagger` (children cascade on their own `view()` timelines, `cover`-percentage ranges), `.ui-shine`, `.ui-halo`; reduced motion turns everything off through the existing global rule |
| Placeholders | hero and wide routine SVGs with text baked in | redrawn product compositions without text; new `placeholder-rutina-card.svg` for the card (seed and dev row); the code default for the routine image stays the wide file |

Section ids: `HOME_SECTION_IDS` gained `reviews`; stored four-entry rows are normalised (the missing id is appended visible), the admin list shows five rows, the fixture-pinning tests were updated.

## Why the figures are honest

- Hero price: `formatEUR` of the catalog card the CTA links to (`linkedProductSlug` against `getCatalogProducts()`), null for any other link.
- Bundle card: components from `Bundle.items` → component product titles; price, `reduction` and `bundleSavings` from the same `CatalogProduct` the rail card uses (`bundleSavingsFor` suppresses the value line under an announced reduction).
- Review grid: only `PUBLISHED` rows with text on purchasable products, newest first; the aggregate is `aggregateRatings` over every published review; the note states only what the submit code enforces (buyers only) and points to the per-product verification list.
- Rail subline: descriptive ("Trakci, ustna voda, serum in paket — vse za domačo nego nasmeha."), no sales or popularity claim.

## Verification

Browser checks (Chromium via Playwright, dev server 127.0.0.1:3000, desktop 1440 and phone 390):

- Full-page captures at both widths, no horizontal overflow; crops of every section reviewed at full resolution (`after1/`, `after2/` in the session scratchpad).
- Stagger measured while entering: review cards 0.33 / 0.22 / 0.16 at 30 px, 1.00 / 0.73 / 0.55 at 100 px; bundle checklist 0.27 / 0.18 / 0.00 at 20 px, 1.00 / 0.82 / 0.41 at 90 px. With `prefers-reduced-motion: reduce` every item reads opacity 1.
- Hover: CTA shine pseudo-element travels −203 px → +203 px; card lift `translate 0 −4px` with the shadow layer at opacity 1 and the image at scale 1.05; hero media scale 1.02.
- Finding on the way: an `overflow: hidden` wrapper is a scroll container and left the checklist's `view()` timeline inactive (opacity stuck at 1); the card wrapper now uses `overflow: clip`. `entry` percentages of a 20 px item were a few pixels, hence the `cover` ranges.

Gates (filled in below as they ran):

- `tsc --noEmit`: clean. `eslint` on every changed file: clean.
- Vitest: 179 files / 1865 tests green after updating the three fixtures that pin the section list and the hero claim fields.
- Playwright, run 1 (full suite, standalone build with the e2e env, fresh `nasmeh_e2e_home`): 189 passed, 6 failed, 21 did not run. One root cause: the stock-out checkout test's `getByText("Naročilo je preklicano")` matched both the heading and Next's route announcer (strict-mode violation, a race the announcer won this time) and the test died before restoring the mouthwash stock it had zeroed; with serial files on one database the mouthwash and therefore the bundle stayed sold out, so four later specs waited for a buy button that was now "Obvestite me" and the search spec saw "Razprodano". Fix in the test: assert on the heading role and restore the stock in a `finally`. Nothing in the five downstream failures touches the redesign.
- Playwright, run 2 (fresh database, patched test): **216 passed, 0 failed, 0 skipped** in 7.7 min (`~/.nasmeh-tools/e2e-logs/e2e-home-redesign-2.log`).
- Lighthouse (desktop + mobile, 7 runs per URL, `docs/testing/lighthouse/2026-10-10/`): **desktop passes** (every page performance 100, home LCP 643 ms, TBT 12 ms, CLS 0; 2026-10-03: 541 ms). **Mobile fails its assertion**: LCP 2.6–2.8 s on all four pages, as at the 2026-10-03 baseline (2.52–2.58 s, the known simulated-throttling line), but TBT also came out far above the baseline (home 139 ms vs 27, product page 454 ms vs 54, checkout 241 ms vs 55). The build's first-load JS moved by 1 kB per route (home 118 → 119 kB, product 122 → 123 kB, cart 121 → 122 kB, checkout 126 → 127 kB) and no client component was added to those routes, so the inflation is the machine, not the page: the mobile run overlapped with the owner browsing the second standalone server on this workstation (the fence is meant to run alone). To be re-run idle before the next release; the desktop pass and the unchanged payload are the evidence this record rests on.

Not run: `docker compose build` (nothing is being merged in this pass).

## Left for the owner

- The dev database holds six temporary demo reviews (`id like 'demo-home-%'`) so the grid can be seen; delete them once reviewed.
- The review grid is spec §4 item 5 (P2-growth). It ships latent; removing it is the section id, the query module and the component.
- Real hero and bundle artwork replace the redrawn placeholders through the media library.
