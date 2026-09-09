# Phase 0 — Project scaffold & foundation

**Date:** 2026-09-09 · **Status:** in progress · **Scope source:** `docs/GENERAL_PLAN.md` lines 58–85, `AGENTS.md`

## Goal
Clean checkout builds and runs in Docker; DB migrates + seeds; auth skeleton, design tokens, Ui primitives, copy system, CI scripts. No user-facing features.

## Packages (major-pinned)
- next `^15.5.25`, react/react-dom `^19.1.9`, typescript `^5.9.3`
- tailwindcss `^4.3.3` + `@tailwindcss/postcss` (v4, no config file; tokens via `@theme inline`)
- prisma + @prisma/client `^6.19.3`; seed via tsx
- next-auth `5.0.0-beta.32` (exact) + @auth/prisma-adapter `^2.11.3`, bcryptjs `^3.0.3`
- zod `^4.5.4`, nodemailer `^10.0.1` (+@types)
- vitest `^3.2.7`, @playwright/test `^1.63.0`, eslint `^9.39.5` + eslint-config-next `^15.5.25` (flat config via FlatCompat), tsx

## Files
- Root: `package.json` (scripts per AGENTS §7 + postinstall prisma generate), `tsconfig.json` (strict, `@/*`), `next.config.ts` (`output:"standalone"`), `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts` (webServer dev :3100), `.gitignore`, `.dockerignore`, `.env(.example)`, `Dockerfile` (node:20-alpine, 3-stage, non-root, HEALTHCHECK, entrypoint `prisma migrate deploy && node server.js`), `docker-entrypoint.sh`, `docker-compose.yml` (app+db, tools profile: adminer+mailpit, limits, commented external network), `docker-compose.override.yml` (dev-only db :5432 publish), `auth.config.ts` (edge-safe), `middleware.ts` (/admin gate), `next-auth.d.ts`, `instrumentation.ts` (env validation at boot, skipped during build).
- `app/`: `layout.tsx` (root, fonts, `lang="sl"`), `globals.css` (THE token file — RGB triplets, iOS ramp, `--brand: 0,168,143` (=#00A88F, D1 pending), radii 3rem/.5rem/.25rem, `--padding:1.25rem`, breakpoints 768/991 via `@theme`, hairline), `(storefront)/{layout,page}.tsx`, `(storefront)/prijava/{page,actions}.tsx`, `admin/{layout,page}.tsx`, `api/health/route.ts`.
- `components/storefront/ui/`: UiButton, UiPill, UiInput(+UiFormField), UiModal, UiAccordion, UiCarousel, UiMarquee (SSR-safe, keyboard-navigable); `components/admin/.gitkeep`.
- `lib/`: `db.ts`, `env.ts`, `auth.ts`, `pricing.ts`, `price-history.ts`, `settings.ts`, `email/{mailer.ts,templates/proof.tsx}`, `copy/{common,home,auth,admin,email}.ts`.
- `prisma/`: `schema.prisma`, `migrations/`, `seed.ts`.
- `public/fonts/*.woff2` (Plus Jakarta Sans 300–800 variable, self-hosted, swap), `public/uploads/.gitkeep`.
- `tests/unit/{pricing,price-history}.test.ts`, `tests/e2e/smoke.spec.ts`.

## Prisma models (baseline, AGENTS §4)
User(role CUSTOMER|ADMIN, bcrypt hash, marketingOptIn), Account/Session/VerificationToken (Auth.js adapter), Product(slug, status, customFields Json, visibility flags, SEO), Variant(sku, priceCents Int, compareAt, stock, maxCartQuantity=5), PriceHistory(variantId, priceCents, createdAt — immutable), Collection(MANUAL|RULES + CollectionProduct position), Order(NS- number, status enum, totals+vatCents snapshot, addresses Json, PSP refs, tracking, timeline Json), OrderItem(snapshot, vatRate, qty, properties Json), Coupon(code, type PERCENT|FIXED|FREE_SHIPPING|BXGY, limits, dates, minSpend, stackable=false), Promotion + FreeGiftRule `[P2 model only]`, Bundle+BundleItem, Review(status, rating, photos Json, orderItem link), Cart+CartItem(user / guest token), Address(SI postal), Setting(key Json), ContentPage(slug, template), Menu(handle, items Json), ConsentLog(choices Json, version).
Seed (upsert, idempotent): products belilni-trakci €34.99 / ustna-voda €19.99 / serum-korektor €19.99 / paket-popolna-rutina €49.99 (bundle maxCartQuantity=1, BundleItems 1×each hero); initial PriceHistory per variant; ADMIN user (env password); Settings (shipping.freeThresholdCents=4500, vat.ratePercent=22, marquee text, company); Menus header/utility/footer/mobile.

## Auth
Edge-safe `auth.config.ts` (authorized callback gates /admin, session jwt, role passthrough); `lib/auth.ts` adds PrismaAdapter + Credentials (bcrypt compare); middleware = `NextAuth(authConfig).auth`; minimal `/prijava` credentials form + server action; admin layout re-checks role server-side.

## lib/pricing
Integer cents; `formatEUR` (sl-SI Intl); `vatBreakdown(gross,22)` exact net/tax cents; `formatDdvLine` → "vključen DDV 22 %: €X"; `changeVariantPrice` — variant.update + priceHistory.create in ONE $transaction.

## Test plan
- Unit: 3499↔€34.99 format; VAT 22 % exact cents (3499→net 2868/tax 631); round-trip; DDV line; PriceHistory helper same-transaction (mock tx) + no-history-on-unchanged-price.
- E2E smoke: GET / 200 (product names in SSR HTML), /api/health 200 JSON.
- Seed idempotency: run twice, counts unchanged.
- Docker: clean `compose build && up -d` → /api/health 200 from container, migrations auto-applied, non-root user, logs clean, restart policy; `compose down` after.
- Grep audits: no hex outside `app/globals.css`; no SI literals (čšž + keyword list) in `app/`, `components/` JSX; no secrets committed; .env gitignored.
- Gates: `lint`, `test`, `test:e2e` green.

## Review-boss findings (filled at phase end)

**Built as planned; all gates green (2026-09-09).**

Test results:
- `npm run lint` (eslint 9 flat + tsc --noEmit): green.
- `npm run test` (Vitest): 19/19 green — exact 22 % VAT cents (3499→2868+631, 1999→1639+360, 4500→3689+811, round-trip 0–20 000), DDV line, integer-cents guards, PriceHistory same-transaction + no-op-on-unchanged (mock tx).
- `npm run test:e2e` (Playwright, chromium): 2/2 green — GET / 200 with seeded product names + prices in SSR HTML, /api/health 200 `{status:ok, db:up}`.
- Seed idempotency: 3 consecutive runs → stable counts (4/4/4/1/4/6).
- Docker: `compose build` clean; fresh volume → entrypoint applied `20260909025556_init`; /api/health 200 from container; homepage SSR from container DB; runs as uid 1000 (node); restart unless-stopped on both services; logs clean (one npm-update notice); torn down after.
- Auth (manual curl): /admin → 307 to /prijava; credentials login → session `{role:"ADMIN"}` → /admin 200; wrong password → no session.
- Grep audits: zero hex outside `app/globals.css` (only the D1 comment inside it); zero SI literals (čšž + keyword list) in `app/`/`components/`; no secrets; `.env` untracked.

Deviations from GENERAL_PLAN item 12 & notes:
1. **Playwright runs against the production standalone server** (`npm run build && PORT=4317 npm run start`), not the dev server — Next dev watcher hits macOS EMFILE even with `ulimit -n 65536`, and `next start` is unsupported with `output:"standalone"` (start = `scripts/start-standalone.sh`). This tests the exact artifact Docker ships. Mailpit assertions land with real email flows in later phases.
2. nodemailer pinned `^8` (next-auth 5.0.0-beta.32 peers `^7||^8`, npm ERESOLVE on ^10).
3. Dev db host port **5543** (5432 = Postgres.app, 5433 = another container) via `docker-compose.override.yml`; production compose publishes no db port.
4. TS augmentation for JWT targets `@auth/core/jwt` (v5 beta types); `next-auth/jwt` augmentation does not reach callbacks.
5. Prisma 6 warns `package.json#prisma` is deprecated (Prisma 7 future) — harmless on 6, revisit at Prisma 7 upgrade.

Review-boss pass: SSR/a11y (content in initial HTML, details-accordion, focus rings, reduced-motion marquee) ✓; money server-side only ✓; admin gated in middleware AND layout ✓; no HiSmile assets/names; phase discipline — Promotion/FreeGiftRule/BXGY are schema-only ✓.
