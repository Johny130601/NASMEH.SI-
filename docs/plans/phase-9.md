# Phase 9 — Hardening & launch

**Date:** 2026-09-11, updated 2026-09-12. **Status:** steps 1–3 complete and locally verified ([step 1](../testing/phase-9-step-1-2026-09-12.md), [step 2](../testing/phase-9-step-2-2026-09-12.md), [step 3](../testing/phase-9-step-3-2026-09-12.md)); step 4 next. Source: GENERAL_PLAN.md Phase 9 (six checkpoints) and NASMEH_FEATURES.md §2.3, §3.6, §15. Depends on Phases 0–7 (all locally accepted; Phase 7 closed on 2026-09-11 with [step 7](../testing/phase-7-step-7-2026-09-11.md)). Runs under the user's 2026-09-10 direction: steps execute in order without a stop between checkpoints where their inputs exist; every step still ends with an acceptance record (`docs/testing/phase-9-step-N-<date>.md`), a ledger update and a commit. Steps 4–6 depend on external gates and stop at the gate they cannot pass locally.

## Checkpoints

1. Security review and dependency remediation — backlog B14 (login form without JavaScript) and B15 (maintenance password hashing) land here. **Complete 2026-09-12** ([acceptance record](../testing/phase-9-step-1-2026-09-12.md)); the CSP ships report-only, the dependency advisories are dispositioned rather than upgraded (Auth.js peer ranges pin nodemailer and `@auth/core`).
2. Performance: Core Web Vitals budgets, Lighthouse CI, image/font/JS audit, caching strategy; sitemap/robots/JSON-LD re-audit after backlog B1. **Complete 2026-09-12** ([acceptance record](../testing/phase-9-step-2-2026-09-12.md)): Lighthouse CI with the budgets on `npm run lighthouse`; desktop 100 on the four templates, mobile 97–98 with LCP within budget on three of them and 2.53 s on the product page (deviation recorded; re-measure with real media after D2); one preloaded font subset, immutable static caching, on-demand payment panel, zod out of the checkout bundle; four accessibility defects fixed; B1 re-audit clean; backlog B16 (responsive image variants) added.
3. Backups and disaster recovery with a restore drill into a fresh stack; monitoring with a forced-failure alert test. **Complete 2026-09-12** ([acceptance record](../testing/phase-9-step-3-2026-09-12.md)): `scripts/backup.sh` (self-verifying dump + four media archives + manifest, 14 daily / 8 weekly retention) and `scripts/restore.sh` (fresh compose project on port 3100) with [docs/RUNBOOK.md](../RUNBOOK.md); the drill restored a backup to a serving store in 21 s with the order, the product image and both private photos byte-identical and the review moderation gate still closed on a `PENDING` review; the forced failure turned `/api/health` 503 on the next check, alerted on the second and recovered without restarting the app. Five findings fixed (F1 MSYS path conversion, F2 truncated-dump detection, F3 half-written backups, F4 the new unit test's `beforeEach` teardown, F5 non-executable `docker-entrypoint.sh` on a Linux host).
4. GDPR and legal finalisation — gate **D4** (legal review, IRPS provider, accountant confirmation). Local part: the audit checklist and the consent-log review; the sign-off itself is external.
5. Home-server deployment behind the existing proxy, staging, host cron for `/api/jobs/daily` — gate **G3** and the host itself.
6. Go-live checklist including live webhooks (**D5**), the €1 real-card order and refund (**G1**), rollback plan, launch sign-off.

No schema change is expected; a migration appears only if step 1 needs one (B15 does not: the hash replaces the plain value in the same `maintenance` row).

## Decisions taken for this phase

- **No major framework upgrade before launch.** `npm audit` on 2026-09-11 lists 11 advisories (8 high, 3 moderate); every "fix" is a major jump (Next 16, Vitest 5) or has no published fix (nodemailer, and `@auth/core`/`next-auth` flagged only through nodemailer). Step 1 disposes of each advisory as *applicable → fixed* or *not applicable → accepted with the reason*; major upgrades go to a post-launch maintenance window with the full regression, never into the launch week.
- **Security headers at the app, TLS and HSTS at the proxy.** The app sends `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`/`frame-ancestors` and a Content-Security-Policy through `next.config.ts` `headers()`. The CSP ships **report-only** first (Stripe, PayPal, Google Tag Manager, Turnstile and the site itself as sources; inline scripts already present: the consent-defaults snippet and JSON-LD), is read for a full browser run, then enforced in the same step if the run stays clean.
- **Monitoring at launch scale is a health check plus log discipline.** Uptime: an external checker on `/api/health` (the host's existing tooling or a free checker), documented in the runbook. Errors: structured server logs with the Docker `json-file` driver rotated (`max-size`/`max-file`); an optional error-tracking DSN is an env placeholder, not a dependency added now. The forced-failure test stops the database container and shows the health endpoint turning red and the checker alerting.
- **Backups are host cron, restores are drilled.** `scripts/backup.sh` (pg_dump + tar of the four volumes into a dated directory with retention) and `scripts/restore.sh` (into a fresh compose project name), both exercised in step 3 on this workstation with Docker Desktop.
- **Staging is the same image with the step 6 switches.** A staging deployment runs the production image with `seo.defaults.indexable = false` and maintenance/password mode on, behind its own hostname on the proxy; there is no second codebase.

## Step 1 design — security review and dependency remediation

Checklist (each item is verified with a grep, a test or a request, and the record says which):

1. **Input boundaries.** Every Server Action and Route Handler parses its input with zod (the Phase 7 step 7 review covered the admin; this step covers the storefront actions, the webhook handlers, the public API routes and the middleware). Grep-driven inventory plus a review of any parse-less handler.
2. **Webhooks.** Stripe and PayPal signatures verified before parsing; processed event ids stored; handlers safe to receive twice (existing unit coverage re-run and extended if a path is missing).
3. **Rate limiting and bot protection.** Inventory of `lib/rate-limit.ts` call sites (checkout, tracking, TOTP) and Turnstile call sites (auth, newsletter, contact, returns, adverse event, back-in-stock, checkout); add limits where a form can be scripted without either (password reset requests, registration, coupon `/koda` lookups) and record the thresholds.
4. **Headers and CSP** as decided above; cookie flags (`HttpOnly`, `Secure` in production, `SameSite`) checked on every cookie the app sets (session, consent, maintenance unlock, cart, pre-auth, checkout key).
5. **Admin and private routes** — the step 7 audit stands; re-run its mechanical greps on the final tree.
6. **Secret hygiene.** `NEXT_PUBLIC_` inventory; no secret in the image (`docker history` and the standalone output are grepped for the `.env` values); `.env.example` complete and commented.
7. **Dependencies.** `npm audit` disposition table (package, advisory, applicable?, action); direct dependencies bumped within their major where a patched release exists; base image pinned to a digest (`node:20-alpine@sha256:…`) and `npm ci` in the image.
8. **Backlog B14.** The storefront login form submits through a plain Server Action so it works without JavaScript; the error state moves to search params.
9. **Backlog B15.** The maintenance password is stored as a bcrypt hash; the settings form sets a new password (blank keeps the current hash) and the unlock action compares with bcrypt; the middleware still only reads `enabled`.
10. **Error handling.** Route handlers and actions never return stack traces; unexpected errors log server-side and answer a generic message (spot-check with a forced failure).

Acceptance: unit tests for B14/B15 and any new limit; browser — login without JavaScript succeeds and shows the wrong-password error; maintenance unlock with the hashed password; a CSP report-only run of the full suite with zero violations; the full regression; record `docs/testing/phase-9-step-1-<date>.md`.

## Step 2 design — performance

- Lighthouse CI (`@lhci/cli`, dev dependency) against the standalone server for `/`, a PDP, `/cart` and `/checkout` with budgets: LCP < 2.5 s, INP < 200 ms (lab proxy: TBT), CLS < 0.1, performance score ≥ 90 on desktop and ≥ 80 on mobile; results committed under `docs/testing/lighthouse/`.
- Image audit: hero poster and card images served as WebP/AVIF with `srcset`, `fetchpriority="high"` on the hero and first PDP image; the media library re-encodes to WebP already — the audit checks the committed placeholders and the `<img>` usage.
- Fonts and JS: font subsetting/preload check, route-level bundle sizes from the build output, no client component larger than needed (the Phase 7 editors are admin-only and excluded from the storefront budget).
- Caching: `force-dynamic` routes stay dynamic (they read settings and menus per request); static assets get immutable caching from Next; the product page could use ISR later — decision recorded, not built.
- Backlog B1 re-audit: sitemap entries, robots rules (now data-driven through the index switch), JSON-LD validity on home, PDP and content pages.

Acceptance: budgets green on the four templates; before/after numbers in the record; any fix with its own regression.

## Step 3 design — backups, DR, monitoring

- `scripts/backup.sh`: `pg_dump` through `docker compose exec -T db`, gzip, plus `tar` of `/app/catalog-uploads`, `/app/public/uploads`, `/app/review-uploads`, `/app/support-uploads` from the volumes; dated directory; retention (daily 14, weekly 8) documented; runs from host cron.
- `scripts/restore.sh <backup-dir>`: creates a fresh compose project (`-p nasmeh-restore`), restores the dump and the volumes, starts the stack and checks `/api/health`; the drill proves an order, a product image and a private review photo survive; private photos never land in `public/`.
- Monitoring: `/api/health` already reports the database; add process metrics (uptime, memory) to the JSON; log rotation in compose (`logging: json-file, max-size 10m, max-file 5`); runbook section for the uptime checker and the alert route; forced failure: stop `db`, health turns `db: down`, the checker alerts (screenshot or log in the record), start `db`, health recovers.

Acceptance: restore drill passes on this workstation; forced-failure alert observed; record with the exact commands.

## Step 4 design — GDPR and legal finalisation (gate D4)

Local part: a checklist document (`docs/testing/legal-checklist.md`) mapping each legal page, the cookie table (now data, step 6), the consent log, the withdrawal form, the complaints page and the adverse-event form to their legal basis and the reviewer's sign-off column; the consent-log audit (every stored choice carries the version and the categories). External: professional review of the texts, IRPS provider selection, accountant confirmation of invoicing (invoice number = order number, VAT breakdown). The step stops at the sign-off and records what is still open.

## Step 5 design — deployment and cron (gate G3, the host)

- Host prerequisites: Docker Compose, the existing proxy network name, DNS, TLS at the proxy; `.env` on the host with the real secrets; `PORT` chosen to avoid collisions; `NEXT_PUBLIC_SITE_URL=https://nasmeh.si` baked at build time (the image is built on the host or in CI with that value).
- Compose on the host: `docker compose -f docker-compose.yml up -d` (no override file), the `networks:` block enabled, resource limits kept; backups cron from step 3; daily job cron: `curl -fsS -X POST -H "Authorization: Bearer $JOBS_SECRET" https://nasmeh.si/api/jobs/daily` once a day, logged.
- Staging: a second compose project with the same image, the index switch off and maintenance mode on, on `staging.nasmeh.si`; preview links are the storefront itself behind the password.
- Acceptance: `https://nasmeh.si` serves the SSR store through the proxy; health, sitemap, robots, a checkout in test mode; cron entries listed in the record.

## Step 6 design — go-live checklist (gates D5, G1, D2, G2, G4)

Checkable items, each with its evidence: live Stripe/PayPal keys and webhook endpoints registered and verified (test event received); Klarna eligibility decided; company data and invoice numbering confirmed (G4); legal pages final and reviewed flags set (D4); cookie banner live with the reviewed table; Search Console verified and sitemap submitted; real catalog content and final media replacing seeds and placeholders (D2); support mailboxes staffed with the response promise (G2); social profiles in the footer menu; index switch on and maintenance mode off; the €1 real-card order placed and refunded from the admin order screen (G1); rollback plan: previous image tag and the restore script; launch sign-off document.

## Placeholders and external inputs

- Uptime checker and error-tracking DSN: documented placeholders until the host's tooling is chosen.
- Proxy type (Traefik or nginx) on the home server: both documented in the runbook; the compose network block is proxy-agnostic.
- D2 media, D4 legal texts, D5 credentials, D6 carrier accounts, G2 mailboxes, G4 company data: unchanged launch gates, listed in GENERAL_PLAN §4.
