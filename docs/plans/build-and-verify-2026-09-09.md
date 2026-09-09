# Build & verify run — 2026-09-09

**Directive (user, 2026-09-09):** install all required programs, build the program, then verify phase by phase in order: check Phase 1, fix anything broken before advancing, then Phase 2, and so on. Write this plan before doing anything.

**Machine facts (checked before this plan):** Windows 11 Pro, 16 threads, 16 GB RAM, elevated PowerShell, Developer Mode on. Node 22.23.2 and PostgreSQL 16.11 are portable installs in `C:\Users\Luka\.nasmeh-tools` (database `nasmeh` on 127.0.0.1:5543, migrated and seeded, dev server verified). Missing: Git, Docker, WSL/Hyper-V features (disabled), Mailpit, Playwright browsers. The folder has no `.git`.

## A. Tooling (gate G0 of the general plan)

| # | Program | How | Why |
|---|---|---|---|
| A1 | Git | `winget install Git.Git` (elevated, silent) | commits, diffs of every fix, acceptance records cite a commit |
| A2 | Local git repository | `git init` + baseline commit of the imported snapshot | every change in this run is reviewable and revertible |
| A3 | Mailpit | portable binary in `~\.nasmeh-tools\mailpit`, detached, SMTP 127.0.0.1:11025, UI 127.0.0.1:18025 | matches `.env`, `docker-compose.yml` and `tests/e2e/helpers.ts` |
| A4 | Playwright Chromium | `npx playwright install chromium` | `test:e2e` |
| A5 | Docker Desktop + WSL 2 | `wsl --install --no-distribution`, `winget install Docker.DockerDesktop` | `docker compose build` gate. **Both need a reboot**; no automatic reboot in this run, so Docker gates are deferred to after the user reboots |
| A6 | Isolated e2e database `nasmeh_e2e` | `createdb`, `migrate deploy`, seed | the e2e suite seeds and mutates the configured database; the dev database stays clean |

## B. Windows portability fixes (backlog B6, B9, B10 + new findings)

These are the minimum code changes for the plan's gates to run on this machine. POSIX and Docker behaviour must stay identical; each fix ships with a test or a documented check.

| # | Change | Files |
|---|---|---|
| B6 | `npm start` runs a Node script that assembles the standalone directory (copy `public` and `.next/static`, link `review-uploads` and `support-uploads` as junctions on Windows / symlinks elsewhere, same refuse-on-foreign-link guards, same review-media guard calls), then execs `server.js` | `scripts/start-standalone.cjs`, `package.json` |
| PW | Playwright `webServer.command` becomes `npm run build && npm run start` (PORT already comes from `env`); `reuseExistingServer` opt-in via `PW_REUSE_SERVER=1` for phase-by-phase runs against one build | `playwright.config.ts` |
| B9 | Review-media guard tolerates `EPERM`/`EINVAL` from directory fsync on `win32` only | `scripts/migrate-review-uploads.cjs`, `tests/unit/review-upload-migration.test.ts` |
| B10 | `prisma/seed.ts` loads `.env` when `DATABASE_URL` is unset (never overrides an exported value) | `prisma/seed.ts` |
| B11 | Vitest `@` alias uses `fileURLToPath` (the `URL.pathname` form yields `/C:/…` on Windows) — only if the unit run fails on it | `vitest.config.ts` |

## C. Build gates

`npm run lint` → `npm run test` → `npm run build`. Anything red is fixed before phase verification starts.

## D. Phase-by-phase verification

One production build, one standalone server on 127.0.0.1:4317 with the Playwright `env` (test mode, Turnstile bypass token, e2e webhook secrets, `JOBS_SECRET`), `DATABASE_URL` → `nasmeh_e2e`, SMTP → Mailpit. Each phase runs its spec files; the phase passes only when all its specs and unit files are green. On failure: fix, re-run that phase, then advance. Results go to `docs/testing/build-verify-2026-09-09.md` with one section per phase.

| Phase | e2e specs | unit files | extra checks |
|---|---|---|---|
| 0 Scaffold | `smoke` | `pricing`, `price-history` | `/api/health` db up; seed ×2 stable counts |
| 1 Shell, CMP, SEO | `ssr`, `cmp`, `newsletter`, `chrome` | `consent`, `turnstile`, `maintenance` | JS-disabled source of `/` contains nav, footer, JSON-LD; `sitemap.xml`, `robots.txt` 200 |
| 2 Catalog | `catalog`, `pdp`, `search` | `catalog-pricing`, `search` | PDP JSON-LD Product/Offer/FAQPage/BreadcrumbList in source; back-in-stock capture on the sold-out PDP |
| 3 Cart, checkout | `cart`, `checkout`, `phase3-*` | `cart-*`, `checkout-*`, `order-*`, `payment-*`, `webhook-verify`, `invoice-data`, `promo`, `analytics`, `rate-limit` | confirmation email + PDF in Mailpit |
| 4 Promotions | `promo` | `promo-coupons`, `coupon-resolve` | popup suppression paths |
| 5 Accounts, reviews | `auth`, `account`, `reviews`, `review-job` | `auth-*`, `account-*`, `review*`, `rating-token`, `daily-job` | `/api/jobs/daily` 401 without secret, 200 with |
| 6 steps 1–2 | `contact`, `contact-runtime`, `chrome` (navigation) | `contact-*`, `support-*` | legacy redirects 308; retired slugs out of the sitemap |

## E. Continue the build

After Phase 6 steps 1–2 pass: implement Phase 6 step 3, 4, 5, 6 per [plans/phase-6.md](phase-6.md) (design sections), each with lint + unit + e2e and its own acceptance record, then Phase 7 checkpoints per the general plan, then the Phase 9 items that are possible locally (security review, dependency audit, performance audit). Docker image gates run after the reboot; real-provider gate G1 stays blocked on credentials.

## F. Rules for this run

- No test result is reported that was not produced in this run; every claim points at the record file.
- Fixes are minimal and Windows-guarded; nothing changes for Linux/Docker without a stated reason.
- Each phase's verification is re-run after its fixes before advancing.
- Commits: one per fix group and one per delivered step, so the run is reviewable.
- Stop only for things the user must do: reboot for Docker, provider credentials, legal/brand decisions.
