# Phase 1 — Storefront shell & homepage

**Date:** 2026-09-09 · **Status:** in progress · **Scope source:** `docs/GENERAL_PLAN.md` lines 86–110, spec §3/§4/§12.5/§13.1

## Goal
Full site chrome (marquee/header/mega-menu/drawer/footer), real GDPR CMP with server ConsentLog, homepage per §4 from data, legal-page rendering, SSR SEO foundation, double-opt-in newsletter w/ Turnstile guard.

## Data deps & migration (`phase1_shell`)
- New model **Subscriber**(email uniq, status PENDING|CONFIRMED|UNSUBSCRIBED, confirmToken uniq, confirmedAt, source).
- **ContentPage.reviewed** Boolean default false (D4 draft flag).
- Seed v2 (upsert, idempotent): menus header(children+featured slugs, RAZIŠČI children)/utility/mobile/footer-{trgovina,pomoc,razisli,sledite,pravno}; Settings `home.hero`(JSON slot: kicker/title/subtitle/cta/videoDesktop/videoMobile/poster/promoOverlay), `analytics.gtmId`(""), `seo.googleVerification`(""), `maintenance`({enabled:false,password,message}); 6 legal ContentPages (pogoji-poslovanja, politika-zasebnosti, politika-piskotkov, odstop-od-pogodbe, reklamacije, dostava; published, reviewed=false, SI draft bodies).
- Placeholder SVGs: placeholder-hero.svg, placeholder-rutina-wide.svg, og-default.svg (public/ + uploads/).

## Copy (lib/copy only)
New modules: chrome (nav/utility/drawer/search/cart), footer (newsletter hook/columns/company/payment), cmp (banner text, category labels/descriptions, COOKIES live-table data), newsletter, legal (draft notice/TOC), maintenance, notFound, errors; home.ts extended (rail/bundle/routine/hero fallback). RAZIŠČI everywhere.

## lib
- `lib/consent.ts` (PURE): CONSENT_VERSION, cookie name, serialize/parse/validate (zod), defaults-all-denied; unit-tested.
- `lib/turnstile.ts`: server verify; NODE_ENV=test + TURNSTILE_TEST_TOKEN match → bypass (e2e-only, documented); no secret → fail-closed in prod, allow in dev (documented); else POST siteverify. Unit-tested (mock fetch/env).
- `lib/seo.ts`: buildMetadata(title,description,path,{noindex,image}) → canonical/OG/Twitter; siteUrl from env.
- `lib/email/templates/verify-subscription.tsx` + mailer.sendSubscriptionVerification (link {siteUrl}/potrdi/{token}).
- Server actions (`app/(storefront)/actions/`): consent.ts (saveConsent: zod, cookie + ConsentLog row), newsletter.ts (subscribe: email zod + turnstile verify + Subscriber upsert + send email; uniform response), maintenance.ts (password → cookie gate).

## Components
- chrome/: SiteHeader(server: UiMarquee from Setting + utility bar SI/Prijava|Moj račun(auth)/Center za pomoč + logo + nav + search/cart icons w/ badge slot), MegaMenu(client: TRGOVINA button aria-expanded, Esc/focus-out close, links from Menu children + 2 featured cards resolved from featured slugs→Product+MediaImage CARD+NEW pill; RAZIŠČI dropdown; colored PAKETI), MobileDrawer(client: hamburger, accordions via details, featured cards, colored link, Esc/scroll-lock).
- chrome/SiteFooter(server): NewsletterForm(client: email+Turnstile→action), columns from footer-* menus (grid desktop / details accordions mobile), payment SVG badges, company block from Setting, legal row + CmpOpenButton(client).
- cmp/: ConsentProvider(client ctx; server-read cookie initial, gtag consent default/update), CmpBanner(client: Nujni locked + Analitični/Trženjski toggles, Sprejmi vse/Zavrni/Shrani izbiro), GatedScripts(client: inject GTM only after analytics consent; SSR inline Consent-Mode-v2 defaults script always). DECISION: hand-rolled gating (no @next/third-parties) — full control + SSR defaults.
- ProductCard(server): MediaImage CARD, badge pills, title, price (lib/pricing), rating slot (empty until P5), CTA→/izdelek/[slug] (PDP Phase 2).
- home/: HeroSection(server; video if Setting has URLs else poster image; promo overlay banner slot), BundleBanner, RoutineBanner(full-width link image + live-HTML legal footnote), rail = UiCarousel(ProductCard).
- misc: RedirectCountdown(client, 404), MaintenanceGate(client form), TurnstileWidget(client), JsonLd(server).

## Routes
- (storefront)/layout.tsx: maintenance gate → ConsentProvider → SiteHeader / children / SiteFooter / CmpBanner / GatedScripts / JSON-LD(Organization, WebSite+SearchAction→/iskanje).
- page.tsx: §4 order — hero, uspešnice rail, bundle banner, routine banner (+footer in layout). No quiz/press/blog.
- [slug]/page.tsx: ContentPage by slug, DEFAULT + LEGAL templates (draft notice when !reviewed), generateMetadata; 404 when missing.
- politika-piskotkov/page.tsx: ContentPage body + live CookieTable (static route beats [slug]).
- potrdi/[token]/page.tsx: confirm Subscriber → CONFIRMED + ConsentLog(marketing-email); friendly invalid state.
- Stubs noindex: /cart /checkout /racun /iskanje (+/paketi,/trgovina,/razisli,/o-nas? only if linked — /trgovina & /paketi linked from nav: minimal indexable placeholders until Phase 2; /razisli,/pomoc,/kontakt link targets: minimal placeholders w/ noindex where utility).
- app/not-found.tsx (copy + countdown), app/sitemap.ts (/, legal pages, politika-piskotkov), app/robots.ts (disallow cart/checkout/racun/iskanje/admin/api + sitemap URL), root metadata: metadataBase, OG/Twitter default image, GSC verification from Setting.

## Tests
- Unit: consent parse/serialize/invalid/version; turnstile branches (bypass-only-in-test, fail-closed prod w/o secret, siteverify mock); existing 19 stay green.
- e2e (workers:1 — shared DB mutations): ssr.spec (GET / HTML contains marquee/nav/footer/hero/rail/legal-footnote; JSON-LD parse+@types; legal page 200; sitemap/robots 200; 404 status+copy; cookie table), cmp.spec (banner → Zavrni: no gtm script + ConsentLog row; reopen via footer; analytics-accept w/ gtmId Setting → gtm script; restore), newsletter.spec (mailpit: submit→email arrives→extract /potredi link→confirm→DB CONFIRMED+ConsentLog; webServer NODE_ENV=test+TURNSTILE_TEST_TOKEN, SMTP→mailpit), chrome.spec (mega-menu keyboard open/Esc; drawer featured+colored link; maintenance on→gate→password→site→off). Mailpit via `--profile tools up -d db mailpit --wait` (+healthcheck).

## Gates
lint, unit, e2e green; seed×2 idempotent; docker smoke (fresh volume: 3 migrations, /api/health 200, homepage SSR from container). Audits: hex/SI-literals/secrets.

## Review-boss findings

**Built all 9 scope items; all gates green (2026-09-09).**

Test results:
- `lint` (eslint 9 + tsc): green. `test` (Vitest): 38/38 (consent codec+schema, turnstile all branches, pricing, price-history).
- `test:e2e`: 18/18 — SSR audit (marquee/nav/hero/rail/footnote/footer/legal/JSON-LD/sitemap/robots/noindex/404), CMP (banner→Zavrni→cookie+ConsentLog row; footer reopen; analytics-accept→GTM only), newsletter double opt-in via Mailpit (email→/potrdi link→CONFIRMED+ConsentLog), mega-menu keyboard, drawer featured+colored link, maintenance gate, 404 countdown browser+SSR.
- Seed ×2 idempotent (4/4/4/8/1/9/8/6). Docker: build clean; fresh volume → 3 migrations auto-applied; /api/health 200; homepage+legal SSR from container; uid 1000; restart unless-stopped; torn down, dev db re-seeded.
- Grep audits: no hex outside globals.css; no SI literals in rendered JSX (only code comments contain SI words); no secrets.

Bugs found & fixed in the loop:
1. Next.js build forbids `react-dom/server` in the app graph → email templates rewritten as string templates (`lib/email/templates/layout.ts` shared shell).
2. Consent cookie double-encoding (Next `cookies().set` percent-encodes) → base64url wire codec in `lib/consent.ts` (+unit tests).
3. NODE_ENV inlined as "production" into the standalone build → Turnstile e2e bypass re-keyed to explicit `NASMEH_E2E=1` harness flag (documented in .env.example; unit path NODE_ENV=test still covered).
4. Static prerender hit the DB during image build → `force-dynamic` on storefront layout + DB-tolerant root `generateMetadata`.
5. Playwright reused a stale manually-started server (chunks overwritten by rebuild → dead JS) → `reuseExistingServer: false`.
6. Mailpit host ports moved 1025/8025 → 11025/18025 (taken by another project on this machine; .env.example updated).

Deviations / notes for review:
- **Dynamic-route 404s**: `notFound()` thrown inside a dynamic page (unknown `[slug]`) is delivered via RSC + client render (Next.js 15 framework behavior) — fully interactive in browsers, e2e-covered. Unmatched multi-segment routes use the static root not-found → full SSR incl. countdown (verified JS-disabled).
- Email templates are string templates, not React-email components (build-graph restriction); same call sites, can be swapped later.
- Hand-rolled script gating chosen over @next/third-parties (documented in plan): SSR Consent-Mode-v2 defaults + GTM injected only after analytics consent.
- OG/social image is SVG placeholder (raster 1200×628 lands with D2 brand assets).
- Product images use plain `<img>` (SVG placeholders; next/image + optimization when real assets arrive).
- Turnstile widget renders only with real keys; otherwise hidden-token (e2e) or dev-open mode — all server-enforced via `verifyTurnstile`.
- Mega-menu hover is not implemented (click/keyboard only — matches a11y requirement; hover-intent can be added later).

## Review-round 2 (maintenance RSC leak — MAJOR fix)
- **Root cause:** layout early-return `<MaintenanceGate>` still let the page tree execute → full catalog in RSC flight payload.
- **Fix:** middleware rewrite to standalone `/vzdrzevanje` (outside `(storefront)`, no chrome queries) — gated pages never execute. Middleware runs on the **Node.js runtime** (Prisma Setting lookup per matched page request; matcher excludes /api, _next, file-like paths). /admin, /prijava, /api, /vzdrzevanje stay reachable; unlock posts → HMAC cookie → `router.refresh()` renders the originally requested URL (rewrite never changes the URL).
- Cookie is now `hmac-sha256(fixed payload, AUTH_SECRET)` + `timingSafeEqual` (was plain sha256(password:secret)).
- New e2e: locked HTML source of /, /pogoji-poslovanja, /politika-piskotkov contains NO product names/prices/legal bodies; /api/health + /prijava reachable; /admin → auth redirect; UI unlock → full render.
- Gates after fix: lint ✓, unit 42/42 ✓ (+maintenance HMAC tests), e2e 19/19 ✓, local build ✓, docker build ✓. Reviewer copy fix "24 ur"→"24 ure" committed.
