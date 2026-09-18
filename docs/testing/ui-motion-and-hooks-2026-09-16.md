# UI motion and sales hooks — 2026-09-16

The storefront after Phase 9 closure was correct and fast but flat: no feedback beyond colour changes, and the only merchandising signals on an item were the admin badge and the Omnibus strikethrough. This change adds a tokenised motion system and a set of sales hooks on items, every hook computed from live data. Two constraints shaped it: the Lighthouse fence (AGENTS §8.20 — mobile LCP already sat at the 2.5 s line, so nothing in the first viewport may animate on load and no JavaScript may join the critical path) and EU consumer law (UCPD Annex I points 7 and 20, the Omnibus price-reduction rules — a scarcity or price claim that is not true is a banned practice, so no figure is ever typed into copy or content).

## 1. What other stores do (reference pass)

Patterns read on 2026-09-16, mechanics only (AGENTS §8.12):

| Pattern | Source | Taken as |
|---|---|---|
| Button states — loading, brief success, disabled — remove doubt; a mini-cart or confirmation card after the add, and a cart icon that changes | scandiweb, *Add-to-Cart Best Practices in 2026* | busy spinner → green "Dodano ✓" flash → page-level confirmation card; popping cart badge |
| Micro-interactions of 200–500 ms, hover cards revealing a second view, reduced-motion respected | DigiDrub / Primotech 2026 micro-interaction guides | 0.2–0.5 s tokens, hover cross-fade to the first gallery image, global reduced-motion rule |
| Three to five trust signals at the point of purchase: free shipping over X, returns/guarantee, secure checkout, next to the buy button | Shopify *Trust badges* (2026), OptiMonk, Section Store | trust row under the buy box, trust strip under the hero |
| Low-stock messages are among the highest-impact PDP additions when the count is real and the threshold reasonable; tiered wording; fake signals destroy trust | easyappsecom low-stock guide citing Baymard | the real "Samo še N kosov na zalogi" line at or under the admin threshold, nothing above it |
| Fake countdown timers and untrue availability claims are banned (UCPD Annex I); the 2023 EU sweep found timers on 42 of 399 shops; compliant urgency is a real deadline or a real count | Consentmo, *Dark patterns in e-commerce promotions*; EC UCPD page | no timers, no "X people viewing"; only computed facts |
| Scroll-driven CSS animations (`animation-timeline: view()`) replace observer scripts; Chrome/Edge 115+, Safari 18+, Firefox behind a flag; guard with `@supports`, animate only transform and opacity | Josh W. Comeau, *Scroll-Driven Animations*; MDN | `.ui-reveal` and the header scroll shadow, zero JavaScript |

HiSmile's own motion spec (research 06 §14: restrained, functional, one hover lift) and its card/PDP mechanics (02 §3.3–3.4, §5.2–5.8; 04 §8 risk reversal) remain the base; nothing of theirs was copied.

## 2. What changed

**Motion system** (`app/globals.css`, AGENTS §8.23). Tokens in `@theme`: `--ease-out-quart`, `--shadow-card`, `--shadow-card-hover`, `--animate-pop`, `--animate-fade-up`, `--animate-bar`, `--animate-pulse-dot`, `--animate-toast-in`, `--animate-rise`, `--animate-sheet-in`; classes `.ui-reveal` (view-timeline fade-and-rise, `@supports` and `prefers-reduced-motion: no-preference` guarded), `.ui-header::after` (scroll-timeline shadow), `.ui-navlink` (drawn-in underline), `.ui-glow` (drifting highlight). A global reduced-motion rule finishes every animation and transition at once. Every keyframe is transform or opacity; the built CSS grew from the closure tree by about 4 kB.

**Where it shows.**
- Product card: lift + shadow + title colour on hover, image zoom with a cross-fade to the first gallery image that differs from the card image (`hoverImageUrl`, lazy, decorative); "Dodaj v košarico" → "Dodajam …" with a spinner → green "Dodano ✓" popping in.
- Header: the cart badge pops on every count change (keyed by the count); nav links draw an underline; a shadow line fades in under the sticky header over the first 4 rem of scroll.
- Home: trust strip under the hero grid; the rail, the bundle banner and the routine banner reveal on scroll; the bundle banner carries the drifting highlight and a white pill CTA (full contrast, unlike the white-on-brand link); the routine banner zooms inside its frame on hover; the hero CTA arrow nudges on hover. The hero itself does not animate on load (its poster is the LCP element).
- PDP: gallery images zoom slowly inside clipped frames on hover, USP chips carry a check, the quantity figure pops on change, the sticky buy bar rises in and shows the product thumbnail on desktop; cross-sell, education, FAQ and "Ljudje tudi kupujejo" reveal on scroll.
- Cart: the free-shipping fill grows from the left on load.
- `UiModal` renders through a portal on `<body>` and rises in: a hovered card is a transformed ancestor, which would otherwise trap the fixed overlay inside the card. The back-in-stock input got its own id (`back-in-stock-email`), because the portaled dialog now follows the footer's newsletter input, which is also named `email` — the pre-existing duplicate id had only been masked by DOM order.
- `UiButton`: `active:scale-[0.98]` press feedback, a `success` variant, and `uiButtonClasses()` for links that need the button look.

**Sales hooks on items** (`lib/catalog.ts`, `lib/copy/catalog.ts`, `lib/copy/pdp.ts`).
- **"−X %" pill** on the card image and beside the PDP price, from `PriceReduction.percentOff` — the same history-backed figure as the strikethrough and the 30-day line, rounded down (`lib/pricing`). A sold-out item never shows it.
- **Bundle value line** "Vrednost 74,97 € · prihranite 33 %" on bundle cards, from `bundleSavingsFor` (components' current prices × quantities against the bundle price, `bundleSavings` in `lib/pricing`); rendered only when the bundle costs less, never as a strikethrough (§6.6 — not an Art. 6a reduction).
- **Low-stock line** "Samo še N kosov na zalogi" with a pulsing dot on cards, search results and the PDP buy box, from `lowStockUnits(stock, threshold)`: the real count while 1 ≤ stock ≤ the operator's threshold, null for a healthy, empty or backordered stock and when the threshold is 0. The threshold is the existing §14.2 setting `inventory.lowStockThreshold`, now also read by the storefront through `getLowStockThreshold()` (`lowStockThresholdSchema`, default 5, AGENTS §8.17). Slovenian count forms: 1 kos, 2 kosa, 3–4 kosi, 5+ kosov (`kosForm`; 21–24 are plural).
- **Trust row** (`components/storefront/pdp/TrustRow.tsx`, copy `trust` in `lib/copy/pdp.ts`): "Dostava 2–4 delovne dni", "Brezplačna dostava od 45,00 €", the guarantee link to `/garancija-vracila-denarja`, "Varno plačilo · kartica, PayPal, Apple Pay, Google Pay". The estimate and the threshold come from the shipping Setting at render time (the same reader as the PDP delivery accordion), with honest fallbacks ("Dostava po Sloveniji", "Brezplačna dostava pri vseh naročilih").
- **Add-to-cart confirmation card** (`components/storefront/cart/CartToast.tsx`, mounted once in the storefront layout, fed by a `window` CustomEvent from `lib/cart/added-event.ts`): the item, its line ("1 × 34,99 €"), "Poglej košarico", "Nadaljuj z nakupovanjem"; anchored under the header near the cart icon, auto-dismissed after 5 s, paused while hovered or focused, Esc closes, dismissed on any route change; the wrapper lets clicks through so nothing behind it is blocked. A confirmation, not the P2 drawer cart (§15). Display data only — the cart was written by the Server Action.
- Seed: the hero's campaign line was "Brezplačna dostava pri naročilih nad 45 €", which the trust strip now states from the Setting directly above it; the seed's line pushes the bundle instead ("Vsi trije izdelki v enem paketu — Paket popolna rutina" → the bundle PDP). Operator content, re-seeded databases only; stored hero rows keep their text.

`CatalogProduct` gained `lowStock`, `hoverImageUrl` and `bundleSavings`; the search page fills them from its own rows and the same threshold reader.

## 3. Checks

| Check | Result |
|---|---|
| `tsc --noEmit`, `eslint .` | clean |
| Vitest | 125 files, 1 273 tests, all green (`tests/unit/catalog-hooks.test.ts` new: low-stock rule, count forms, hook copy, bundle value math, card mapping) |
| Playwright, batch A (hooks, catalog, pdp, cart, search, admin-catalog, phase3-cart-persistence) | first run 28 passed / 4 failed (the three locator collisions and the duplicate id below); after the fixes 35 passed / 1 failed (finding 1); the fixed spec re-ran green in batch B1 |
| Playwright, batch B1 (hooks, chrome, ssr, smoke, performance, promo, hardening) | 35 passed |
| Playwright, batch B2 (restock, checkout, reviews, cmp, phase3-checkout-quote) | 22 passed |
| `tsc`, `eslint`, Vitest after the screenshot fixes (finding 4–7) | clean; 125 files, 1 262 tests |
| Playwright on the final build, batch C (hooks, catalog, pdp, cart, search, chrome, restock, performance, admin-catalog, phase3-cart-persistence) | 44 passed / 1 failed: my hooks spec still looked for the guarantee link inside the PDP trust row after finding 7 moved it to the pill; the assertion now checks the pill and that the row does not repeat it — 5 passed on the re-run |
| Playwright after finding 8 (hooks, cart, pdp, phase3-cart-persistence) | 22 passed |
| Lighthouse (`npm run lighthouse`, standalone build, e2e environment, signed one-line cart cookie, 3 runs per template, median asserted) | desktop: every budget met, performance 100 on all four templates; mobile: performance 97 on all four (closure: 96–97), TBT ≤ 67 ms, CLS 0, and the same four LCP assertion failures as the closure run, now by 15–92 ms (closure: 9–169 ms) — `lhci` exit 1 as before; reports under `docs/testing/lighthouse/2026-09-16/` |

Two existing specs were adjusted for the new elements, never weakened: `admin-catalog.spec.ts` reads the card image as the first `img` (the decorative hover view now follows it, asserted `alt=""`), and the PDP sticky-bar locator `div.fixed` stays unique because the confirmation card is a `<section>`.

Findings during the run:
1. The confirmation card survived the client-side navigation to `/cart` (the layout that hosts it never remounts) — dismissed on the link click and on every pathname change.
2. The portaled dialog exposed the duplicate `email` id shared with the footer form (above).
3. No test pinned the hero campaign line, the card image count or the modal's DOM position; the three assertions that met the new elements are the ones listed above.

Findings from the screenshot pass (desktop 1440 px and phone 390 px, after the browser suite):
4. The solid admin badge ("USPEŠNICA") rendered white on the light tile: `BadgePill` overrode the neutral pill's `bg-light-3` with a `bg-dark-1` class, and two `bg-*` utilities on one element resolve by stylesheet order, not class order — pre-existing since Phase 2. Every admin badge style is now its own `UiPill` variant (`dark`, `outline`, `grey`), and AGENTS §8.23 records the rule.
5. The card kept the carousel's fixed 15 rem width inside the two-column phone grid on `/trgovina`, so the second column ran off the screen — pre-existing. The card now fills its cell (`w-full h-full`, equal heights per row), the home rail sets the slide width, and card CTAs use a tighter padding and text size below 768 px so "Dodaj v košarico" fits a 183 px column.
6. The confirmation card's second button ("Nadaljuj z nakupovanjem") overflowed the card at both widths; the card keeps one CTA ("Poglej košarico →") and the corner close.
7. The PDP trust row repeated the guarantee pill sitting directly above it; on the PDP the row states delivery, threshold and secure payment, and the guarantee stays the green pill.
8. The confirmation card's `role="status"` region was created together with its content; assistive technology may skip a live region inserted with its first content, so the empty region is now always in the DOM and only the card mounts on an add.
9. A full-page screenshot of the phone layout shows the sections below the fold blank: the capture never scrolls, so a `view()`-timeline reveal stays at its start state. A person scrolling sees them fade in; Firefox, reduced motion, print and a tall renderer viewport (Googlebot) show them at once. Screenshot scripts scroll to the bottom before a full-page capture.

### Lighthouse, final tree (2026-09-16) against the closure run (2026-09-15)

Mobile LCP medians, ms: home 2592 (closure 2509), product page 2576 (2665), cart 2592 (2576), checkout 2515 (2669). All four sit on the budget line for the reason the closure record established: the largest text or image is counted when the web font renders, and the throttled lab puts the 38 kB font's arrival at 2.5–2.7 s. The run-to-run spread is the same as before (the home page measured 2591, 2592 and 2756 ms; the closure run 2505, 2509 and 2574 ms), and Speed Index remains bimodal on every template on both days (913 ms when the fallback face counts, 3.4–3.7 s when it does not). The critical path did not change: the home document grew from 24.1 to 27.6 kB transferred (trust strip, hover views, campaign line), the stylesheet from 9.4 to 10.6 kB gzipped, scripts by 1.7 kB; the hero poster still starts with the stylesheet and the font, and no new request precedes it. Desktop LCP 558–618 ms (closure 555–581 ms).

#### desktop (3 runs per URL, representative run shown)

| URL | Perf | A11y | BP | SEO | LCP | TBT | CLS | FCP | Speed Index |
|---|---|---|---|---|---|---|---|---|---|
| / | 100 | 96 | 100 | 100 | 559 ms | 0 ms | 0.000 | 256 ms | 256 ms |
| /izdelek/belilni-trakci-za-zobe | 100 | 96 | 100 | 100 | 560 ms | 0 ms | 0.000 | 253 ms | 307 ms |
| /cart | 100 | 97 | 100 | 61 | 618 ms | 0 ms | 0.000 | 249 ms | 282 ms |
| /checkout | 100 | 97 | 100 | 58 | 558 ms | 0 ms | 0.000 | 255 ms | 255 ms |

#### mobile (3 runs per URL, representative run shown)

| URL | Perf | A11y | BP | SEO | LCP | TBT | CLS | FCP | Speed Index |
|---|---|---|---|---|---|---|---|---|---|
| / | 97 | 96 | 100 | 100 | 2592 ms | 27 ms | 0.000 | 913 ms | 913 ms |
| /izdelek/belilni-trakci-za-zobe | 97 | 96 | 100 | 100 | 2576 ms | 18 ms | 0.000 | 912 ms | 912 ms |
| /cart | 97 | 97 | 100 | 61 | 2592 ms | 29 ms | 0.000 | 910 ms | 910 ms |
| /checkout | 97 | 97 | 100 | 58 | 2509 ms | 46 ms | 0.000 | 913 ms | 913 ms |

(The cart and checkout SEO scores are the intended `noindex`.)

## 4. What this leaves

- Real media (gate D2) will make the hover cross-fade and the gallery zoom meaningful; the placeholders only prove the mechanism.
- The low-stock threshold is the operator's dashboard value; if a different storefront threshold is wanted, it is one more Setting with its own schema, reader and form (AGENTS §8.17).
- P2 items stay P2: the drawer cart, the rule-based upsell cards ("Paket & Prihrani"), GWP badges, countdowns for real campaign deadlines (with the deadline stored on the coupon).
