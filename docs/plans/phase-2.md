# Phase 2 — Catalog

**Date:** 2026-09-09 · **Status:** in progress · **Scope source:** `docs/GENERAL_PLAN.md` lines 112–136, spec §5/§6/§9.2/§12.6, research 02

## Goal
`/trgovina` + 4 PDPs (+ sold-out demo PDP) live from DB, instant search, Omnibus price display, per-page SEO — all SSR.

## Schema (`phase2_catalog`) & seed v3 (idempotent)
- New model **BackInStockSubscription**(email, productId FK idx, variantId? FK idx, status PENDING|CONFIRMED|NOTIFIED, confirmToken uniq, confirmedAt, source).
- **Badges** become structured: `Product.badges = [{label, style}]` (style: outline|solid|grey|warning|promo — admin-data-driven; component maps style→UiPill variant).
- New collections: `beljenje` (3 heroes + travel strips, manual positions), `paketi` (routine bundle). Tabs = collection handles.
- New 5th product **potovalni-trakci-7** ("Belilni trakci — potovalno pakiranje (7 uporab)", NAS-TRK-07, €19.99, **stock 0**) → exercises Obvestite me on card + PDP. DOCUMENTED CHOICE: 5th demo product (vs variant stock 0) so /trgovina shows a sold-out card too.
- Omnibus demo: serum gets compareAt 24,99 € + scripted PriceHistory [2499 @ −40 d, 2499 @ −10 d, 1999 latest] → line "Najnižja cena v zadnjih 30 dneh: 24,99 €" (rebuild only if no 2499 row exists → idempotent).
- PDP content in `prisma/seed-pdp.ts` keyed by slug → Product.accordions (Kako deluje/Sestavine INCI/Jamstvo/Testirano, HTML), Product.faq [{q,a}], Product.education [{heading,body}], Product.customFields {uspChips, intro, bullets, unitPrice:{quantity,unit}, crossSell:[slugs]}; bundle crossSell too. seoTitle/seoDescription per product.
- Gallery: per product 3 GALLERY MediaImages (product svg + 2 new generic placeholders), CARD stays sort 0.

## lib
- `lib/pricing.ts` += `unitPriceCents(price, qty)`, `formatUnitPrice(price, qty, unit)` → "2,50 € na uporabo" (sl-SI format, document notation vs spec's "€2,50"), `klarnaInstallmentCents(total)` = round(/3), `lowestPriceInLast30Days(history, now, 30)` → min prior price in window else null (excludes latest row; >30 d excluded), `bundleSavings(componentPrices[], bundlePrice)` → {valueCents, savingsCents, savingsPercent}.
- `lib/omnibus.ts`: db variant → lowest-30d (uses pricing helper).
- `lib/search.ts`: `searchProducts(query, limit)` — $queryRaw ILIKE (escaped %/_) over title/description/customFields::text, word-AND; shared by Route Handler + /iskanje.
- Actions: `backInStock.ts` (email zod + Turnstile + upsert PENDING + verification email; uniform response). Route `/potrdi-zalogo/[token]` → CONFIRMED + ConsentLog. Mailer: renderBackInStockEmail(template+send fn).

## Routes & components
- `/trgovina` (replaces stub, indexable): promo banner (mobile/desktop crop placeholders), tabs = links `?kolekcija=all|beljenje|paketi` (deep-linkable), sort = SortMenu `<details>` of links `?razvrsti=priporoceno|najnovejse|cena-vzpadno|cena-padajco|naziv-az|naziv-za` (no client JS needed), grid of CatalogCards, SEO text block + `<details>` "Preberi več +", lazy images + UiSkeleton (skeletons used in search overlay; catalog tiny — documented). No facets (§5).
- `components/storefront/catalog/`: CatalogCard (badge pill by style, packshot CARD, title, **RatingStars+count** (Review aggregate, honest empty), price + compare-at + Omnibus line, unit price, swatch "+N" when >1 variant, full-width CTA by state: Dodaj v košarico→PDP link (DOCUMENTED: links, Phase 3 wires cart) / Sestavi paket→bundle PDP / Obvestite me→modal), BadgePill, RatingStars, SortMenu, CollectionTabs, ObvestiteMeButton+Modal (client, UiModal + email form + hidden turnstile token pattern from P1).
- `/izdelek/[slug]` PDP (DOM order §6): Breadcrumbs(+JSON-LD) → PdpGallery (portrait 0.6875:1, first fetchpriority=high) → badge+H1 → RatingSummary slot → USP chips (≤3) → intro+bullets → accordions (SSR bodies, */^ resolve here) → BuyBox (client qty stepper 1–max, price/compare-at/Omnibus line/unit price/Klarna line "ali 3 obroka po 11,66 € s Klarna", ATC **disabled + note "na voljo v fazi 3"** (DOCUMENTED CHOICE on PDP), green 30-day pill) → delivery accordion (2–4 dni, brezplačna nad €45 Setting, 14-dnevni odstop) → "Dopolni svojo rutino" curated cards → education sections → FAQ + FAQPage JSON-LD → reviews mount slot → "Ljudje tudi kupujejo" 4 cards → StickyBuyBar (client). Sold-out: ATC→Obvestite me everywhere; page fully merchandised. Bundle PDP: component list + "vrednost 74,97 € — prihranite 33 %" from live prices. JSON-LD Product+Offer(availability) + BreadcrumbList + FAQPage; canonical/OG from product seo fields.
- Search: SearchOverlay (client; header icon = Link SSR → swaps to button on mount; debounced fetch `/api/search?q=` → Route Handler (limit 6); results + "Vsi rezultati" → `/iskanje?q=`; zero state). `/iskanje` SSR results grid + GET form + zero state, noindex.

## Copy
lib/copy: catalog.ts (sort labels, tabs, seo block, CTA labels, swatch), pdp.ts (accordion titles, buy box lines, guarantee, delivery, cross-sell, FAQ title, reviews mount, sticky bar, bundle), search.ts (overlay/results/zero states), backInStock.ts (modal/form/success/confirm page). Product CONTENT = DB seed (data).

## Tests
- Unit: lowestPriceInLast30Days (no history→null; [2499@−10d,1999 now]→2499; >30 d excluded→null; picks min), formatUnitPrice (3499/14→"2,50 € na uporabo"), klarna (3499→1166), bundleSavings (7497 vs 4999 → 2498/33 %).
- e2e catalog.spec: tabs deep-link (?kolekcija=paketi → only bundle; click switches URL), each sort orders correctly (price asc/desc first-card price; A–Ž/Ž–A first title; najnovejše), Omnibus line on serum card, sold-out card CTA.
- e2e pdp.spec: SSR — H1/price/accordion bodies/FAQ/breadcrumb/JSON-LD(Product+Offer,FAQPage,BreadcrumbList) in initial HTML; omnibus line; unit price; Klarna line; bundle components+savings math; accordions toggle; gallery img[fetchpriority=high] first.
- e2e search.spec: type "trak" → strips suggestion; → /iskanje?q=trak results; "xyznic" → zero state; overlay Esc.
- e2e backinstock.spec: sold-out PDP → Obvestite me → email submit → Mailpit → confirm /potrdi-zalogo → DB CONFIRMED + ConsentLog.
- Gates: lint, unit, e2e; seed×2; docker smoke fresh volume (4 migrations).

## Review-boss findings

**Built all 9 scope items; all gates green (2026-09-09).**

Test results:
- `lint` (eslint+tsc): green, 0 warnings. `test`: 53/53 (omnibus all branches, unit price, klarna, bundle savings + all prior).
- `test:e2e`: 35/35 — tabs deep-linkable, all 6 sorts verified by first-card, sort persists across tab switch, Omnibus line on card+PDP, sold-out card/PDP, PDP SSR audit (H1/price/INCI/accordion bodies/FAQ/breadcrumbs/JSON-LD Product+Offer+FAQPage+BreadcrumbList/preload-priority), accordion toggle, stepper, disabled ATC, bundle components + 33 % savings, search suggest→results→zero, back-in-stock double opt-in via Mailpit + DB CONFIRMED + ConsentLog.
- Seed ×2 idempotent (5/5/7/20/1/9/8/6/2). Docker: fresh volume → 4 migrations auto-applied, health 200, /trgovina + /api/search 200, uid 1000.
- Grep audits: hex/SI-literals/secrets PASS.

Bugs found & fixed in the loop:
1. `changeVariantPriceInTx` compareAt=null semantics verified (no-op idempotent).
2. NBSP in sl-SI currency broke a literal unit-test match → normalize \u00A0 in assertions.
3. React hoists first-image `fetchPriority` to `<link rel=preload>` (not an `<img>` attribute) — test accepts both forms.
4. CMP banner intercepted Playwright clicks in new specs → dismiss helper now waits for the Server Action to resolve before navigating (race aborted the consent cookie write).

Documented choices/deviations:
- ATC: catalog cards link to PDP; PDP ATC disabled + note; both activate in Phase 3 (no client cart invented).
- 5th demo product (potovalni-7, stock 0) exercises sold-out + Obvestite me; admin can archive before launch.
- Sort: SSR `<details>` of links (no client JS needed); catalog is tiny → JS-side sort after single query (documented).
- Skeletons ship in the search overlay; /trgovina grid is small → no pagination/load-more needed (spec "load more if needed").
- Search: ILIKE (escaped) over title/description/customFields; trigram/typo-tolerance is §3.1 [P2] → Phase 8.
- Unit-price notation follows site currency format ("2,50 € na uporabo", NBSP) rather than spec's loose "€2,50" literal.
- "Ustna voda" matches search "trak" because crossSell metafields reference trakci — acceptable metafields search behavior.
