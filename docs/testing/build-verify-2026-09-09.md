# Build & verify record — 2026-09-09

Companion to [the run plan](../plans/build-and-verify-2026-09-09.md). Every number here was produced in this run on this machine; nothing is carried over from earlier records.

## Environment

| Item | Value |
|---|---|
| Machine | Windows 11 Pro 10.0.26200, 16 threads, 16 GB, elevated shell, Developer Mode on |
| Node / npm | 22.23.2 / 10.9.8 (portable, `~\.nasmeh-tools\node`) |
| PostgreSQL | 16.11 (portable EDB binaries, `~\.nasmeh-tools\pgsql`), port 5543 on 127.0.0.1 **and ::1**, locale en-US, UTF8. Listening on ::1 was added mid-run: with only 127.0.0.1, `localhost` connections took ~2.1 s each (Windows tries ::1 first), so 3 concurrent Prisma interactive transactions failed with "Unable to start a transaction in the given time"; a probe showed 24 concurrent transactions in 0.77 s once ::1 listened. No product code was changed for this. |
| Git | 2.55.0.windows.3 (winget); repository initialised in this run, baseline commit `ef19388` |
| Mailpit | v1.31.1 (portable), SMTP 127.0.0.1:11025, UI/API 127.0.0.1:18025 |
| Playwright | @playwright/test 1.63 with Chromium 153 (chromium-1243) |
| Docker Desktop | 4.90.0 installed via winget; WSL 2.7.13 installed; WSL + Virtual Machine Platform features enabled. **Restart required** before the engine runs, so Docker gates are deferred (see "Deferred"). |
| Databases | `nasmeh` (dev, migrated + seeded), `nasmeh_e2e` (isolated, migrated + seeded; used by every e2e run below) |

## Fixes made before the gates (commit `ea9f013`)

| Backlog | Fix | Evidence |
|---|---|---|
| B6 | `scripts/start-standalone.cjs` replaces the POSIX-only shell script; junction links on Windows, same refuse-on-foreign-link guards and review-media guard calls | `npm start` used by every e2e run below |
| PW | Playwright `webServer.command` is shell-agnostic; `HOSTNAME=127.0.0.1`; `PW_REUSE_SERVER=1` opt-in | phase runs below |
| B9 | Review-media guard: directory fsync tolerated on `win32` only; identical-copy path opens the private file read-write so `sync()` works on Windows | unit suite 587/587 (was 573/587 with 14 Windows failures) |
| B10 | `prisma/seed.ts` loads `.env` when `DATABASE_URL` is not exported | `npm run db:seed` without an exported URL completed against the `.env` database (exit 0) |
| test | `support-attachment-route.test.ts` path expectation built with `path.join` | unit suite |
| B12 (new) | **Next.js 15.5 Node-middleware body race.** `next-server.js` calls `requestData.body.finalize()` without `await` after Node-runtime middleware, so a Server Action can attach to a still-streaming multipart body and miss the chunks already buffered for it. Reproduced deterministically in the Phase 5 group: the review submission with a 1.2 MB photo reached the action with only `photos,sensitivity,orderItemId,ratingToken` (the leading `rating`, `title`, `text` and the first file were gone), while a routed/buffered replay of the same request succeeded. Excluding `/oceni` from the middleware matcher made the group pass twice. Upstream: vercel/next.js#85416, fixed by PR #85418 in 16.x; no 15.x release carries it (15.5.25 is the `backport` tag). Workaround: `middleware.ts` reads a `request.clone()` tee to the end for every request with a body, so the upload has fully arrived before any handler reads Next's buffered copy. Draining `request.body` itself is not viable: Next's adapter then throws "Response body object should not be disturbed or locked" for every POST. | Phase 5 group 18/18 twice and Phase 6 7/7 after the fix; lint pass |
| diag | `submitReviewAction` logs the failing field names and received keys (no values) when zod rejects a submission | the line that exposed B12 |

## Gates

| Gate | Result |
|---|---|
| `npm run lint` (eslint + tsc) | pass (two runs: before and after the fixes) |
| `npm run test` (Vitest) | **587 passed / 52 files**, 0 failed, after the fixes (initial run on Windows: 573 passed, 14 failed in 2 files) |
| `npm run build` | pass: compiled in 44 s, 44 routes, `.next/standalone/server.js` present (background build with `.env`); a second build with the Playwright env produced the artifact every phase run below uses |
| `docker compose build` | deferred until restart |

## Phase verification

Each phase runs its e2e spec files against the isolated database, Mailpit and a production standalone server on 127.0.0.1:4317 started with the Playwright env. Filled in as the phases complete.

| Phase | Specs | Result |
|---|---|---|
| 0 Scaffold | `smoke` | **2/2 passed** (Playwright-managed build + start, 1.1 min total); health reports `db: up` |
| 1 Shell, CMP, SEO | `ssr`, `cmp`, `newsletter`, `chrome` | **19/19 passed** (26 s): SSR source audit, JSON-LD, legal draft notice, cookie table, sitemap/robots with retired slugs absent, legacy 308 redirects, noindex, 404 countdown, CMP reject/reopen/analytics gating, newsletter double opt-in via Mailpit, mega-menu keyboard, drawer, maintenance gate without RSC leak |
| 2 Catalog | `catalog`, `pdp`, `search` | **16/16 passed** (11 s): deep-linkable tabs, all sorts, Omnibus line on card and PDP, sold-out card/PDP, SEO expander, PDP SSR audit with Product/Offer/FAQPage/BreadcrumbList JSON-LD, bundle savings math, accordions/stepper, unknown slug 404, search suggest → results → zero state, `/iskanje` SSR, sold-out capture double opt-in via Mailpit |
| 3 Cart, checkout | `cart`, `checkout`, `phase3-*` | first run 33/34: `phase3-cart-persistence` failed deterministically with Prisma "Unable to start a transaction in the given time" (see PostgreSQL row: `localhost` → `::1` connection delay). Fixed by listening on `::1`; the spec then passed in 0.3 s. **Recheck of the full group: 34/34 passed** (38 s): full guest purchase with email + PDF + lookup, SCA retry, webhook idempotency and signature rejection, stock-out cancellation, PayPal capture path, cart steppers/cap/merge/tamper/visibility, signed quotes and stale-price confirmation, combined bundle inventory, competing captures, rollback/retry, amount mismatch, cross-provider rejection, partial/full refunds, cancellation ordering, PayPal approval without capture, declined/denied captures, confirmation privacy and ownership, post-purchase account |
| 4 Promotions | `promo` | **7/7 passed** (14 s): `/koda/TEST10` discount + terms + order snapshot + redemption row, remove restores totals, invalid code state, usage-limit exhaustion, threshold change propagates from the DB, welcome popup delay/suppression/dismiss/thank-you with double opt-in email, cross-sell curation |
| 5 Accounts, reviews | `auth`, `account`, `reviews`, `review-job` | first run 17/18: the review photo submission failed with the form's "invalid" message (B12 above). After the middleware workaround: **18/18 passed twice** (28 s, 27 s): activation/login/reset lifecycle, activation binding, concurrent resets, expired links, challenge boundary, private account routes, dashboard/detail/invoice/tracking, address CRUD and concurrency, consent history, review request job timing/leases/concurrency, signed star link → invalid image rejected → two real photos → moderation → SSR/JSON-LD → rejection hides evidence, aggregates beyond ten reviews and filters |
| 6 steps 1–2 | `contact`, `contact-runtime` | **7/7 passed** (11 s): all nine topics with routing and acknowledgement, guest lookup proof, signed-in order list, photo guidance and private evidence, idempotent retry, concurrent submissions, ownership checks |

## Deferred

- **Docker gates** (`docker compose build`, container smoke): Windows reported `restart needed: True` after enabling WSL/VMP; Docker Desktop cannot start its engine until then. Nothing in this run reboots the machine.
- **Real-provider acceptance (G1)**: no Stripe/PayPal/Turnstile credentials; unchanged.
