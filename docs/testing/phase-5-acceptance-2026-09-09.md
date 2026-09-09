# Phase 5 acceptance — 2026-09-09

**Scope:** finish and independently review the existing customer-account/review implementation, preserving all Phase 3 repairs and Phase 4 work. Changes are local and uncommitted. No production deployment or real payment/email-provider acceptance was performed.

## Result

**Phase 5 local acceptance passed.** The final combined regression passed **512 unit tests and 94/94 browser tests, zero skipped, zero flaky**, including the queue-ordering changes. Lint/TypeScript, Docker/migration/media checks, independent review and desktop/mobile preview inspection passed. External-provider launch gates remain open below.

## What changed

- **Accounts:** complete challenged signup → explicit email activation → login → password reset lifecycle, atomic single-use tokens, activation-bound credentials/consent, session revocation, and strict password/email validation. Email scanners cannot consume activation links through GET.
- **Customer area:** full order summaries/details, saved discount/VAT/address snapshots, safe tracking links and owner/admin invoice downloads. Address editing/default/deletion handles simultaneous requests; marketing changes leave a consent audit trail.
- **Reviews:** delivered-purchase authorization, signed star links, actual image decoding and responsive photo output, private moderation-aware photo serving, complete published-review aggregates/JSON-LD, sorting/filtering and moderation/settings UI.
- **Jobs:** first-delivery timestamps, persistent send attempts and leases, concurrent/repeated invocation protection, recovery after SMTP failures, stable Message-IDs and truthful failure status without raw recipient/error logs.
- **Packaging:** private review volume and safe legacy-photo startup migration, a direct Sharp dependency, multipart allowance for four 2 MB photos, and local development/standalone/Docker startup guards.

## Verification evidence

| Check | Evidence |
|---|---|
| Browser regression | 94/94 Chromium tests on a freshly built standalone artifact. `/tmp/nasmeh-phase5-e2e-final.json` and `.log`. |
| Unit tests | **512/512 passed across 46 files**, including final queue fairness/capacity coverage. `/tmp/nasmeh-phase5-unit-final.log`. |
| Lint + TypeScript | Final `npm run lint` passed, including the queue changes. `/tmp/nasmeh-phase5-lint-final.log`. |
| Production image | `docker compose build app` passed. `/tmp/nasmeh-phase5-docker-final.log`. |
| Fresh database | Container entrypoint applied all 11 migrations to `nasmeh_phase5_docker_smoke_20260909`; Prisma diff against acceptance DB reported no difference. |
| Seed twice | Identical counts: users 2, products 5, variants 5, PriceHistory 7, media 20, settings 15, menus 8, content pages 6, collections 2. |
| Docker runtime | Health 200, product placeholder 200, process UID 1000, 512 MB/1 CPU limits. |
| Legacy photo upgrade | Generated PNG and thumbnail fixtures moved from public to private storage before Next started; public review directory empty. 16 temporary-directory tests cover safe copies, idempotence, collision preservation, unexpected files and symlink rejection. |
| Photo authorization | Real HTTP requests in Docker: pending/rejected originals and thumbnails 404; published legacy PNG and new WebP/thumbnail 200 with `private, no-store`. Files survived restart. |
| Daily endpoint | Missing secret 401; correct local test secret 200 with zero-work counters. Browser cases cover delivery timing, concurrent/repeated sends and expired/active leases. |
| PDF | Browser download/ownership checks passed. Rendered PDF inspected at `/tmp/nasmeh-phase5-invoice-qa/`: Slovenian glyphs, discounts, saved VAT and multiline billing details. |
| Preview visual QA | Registration, dashboard, order detail and address forms inspected at 1440px and 390px: no horizontal overflow or application errors. Heading and settled floating-label geometry are correct. Downloaded invoice is one page and reconciles billing data, €12.50 discount, €20.28 saved VAT and €112.46 total. `/tmp/nasmeh-phase5-visual-qa/report.json` plus PNG/PDFs; temporary orders cleaned and zero remaining fixtures verified. |

The acceptance database is `nasmeh_phase5_acceptance_20260909` on local port 5543. The main development database was not used for this run. Fixtures are isolated and cleaned by tests; review photos are excluded from source control and Docker context. Mail goes only to local Mailpit.

Reproduction (with the existing local PostgreSQL and Mailpit services):

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5543/nasmeh_phase5_acceptance_20260909 \
SMTP_HOST=127.0.0.1 SMTP_PORT=11025 SMTP_USER='' SMTP_PASS='' \
STRIPE_SECRET_KEY='' PAYPAL_CLIENT_ID='' PAYPAL_CLIENT_SECRET='' \
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY='' npx playwright test
npm run lint
npm run test
docker compose build app
```

Playwright supplies explicit test challenge/payment flags, origin and webhook/job test secrets. These are local harness settings and must not be copied to a live environment.

## Findings resolved during acceptance

Independent review found non-atomic token consumption, activation credential/consent binding, stale sessions, concurrent default-address changes, premature/duplicate review requests, use of order-edit time instead of delivery time, incomplete aggregates, unsafe image content, and static serving of legacy review photos. These paths now have targeted regression coverage.

The browser runs additionally exposed an inaccessible country-select label and a review revalidation bug that replaced the thank-you message with the already-submitted notice. Both were fixed. Ambiguous test selectors were scoped to their intended form so Next's route announcer and footer challenge widget do not produce false failures; assertions were retained.

The independent follow-up also fixed silent confirmation-mail failures in the daily endpoint and raw SMTP logging. Queue selection now prioritizes new recipients and rotates retries by attempt count within the 50-order cap; a regression with 52 repeatedly failing recipients proves that the first 50 cannot monopolize every run.

## Upgrade and operating notes

- Refreshed local preview: **http://localhost:3000**, container `nasmeh-preview`, database `nasmeh_preview_20260909`, existing product volume `nasmeh_phase3_preview_uploads_20260909` and new private volume `nasmeh_phase5_preview_reviews_20260909`. The app binds only to loopback, uses explicit local test-payment/challenge mode and Mailpit, and has no real PSP credentials. Home, registration, health and seeded product media return 200; the authenticated daily endpoint returns successful counts. The temporary smoke container was removed; isolated verification databases/volumes remain for reproduction.
- The existing local demo customer was still unverified from the older preview seed. After checking the known demo password and CUSTOMER role, its verification timestamp was populated in the isolated preview only, preserving its password. Demo login: `customer@nasmeh.si` / `Customer123!`. New registrations still require their explicit activation email, captured at local Mailpit port 18025.
- Back up PostgreSQL, public product media and the new private review volume. Preserve existing photo URLs; the startup migration changes their physical location. Unexpected legacy files or differing collisions stop startup and preserve data for investigation.
- Old JWTs without session versions require login again. Legacy verification tokens lacking activation snapshots require a fresh registration link. Existing delivered orders use their historical `updatedAt` once for migration backfill; new deliveries have a dedicated timestamp.
- Request timing is configurable from 7–10 days, default 7. Auto-publish is off by default and can be set to verified 4+ or 5-star reviews.
- Host scheduling of the authenticated daily endpoint remains a deployment step. SMTP delivery is at least once: a crash after mail acceptance but before database acknowledgment may resend despite stable Message-ID.

## Remaining launch gates and next phase

Phase 3's **real Stripe/PayPal/Turnstile checks still require credentials**, as recorded in the [sandbox checklist](phase-3-sandbox-checklist.md). Mailpit does not prove external SMTP deliverability. Configure and verify host scheduling, final media/company/legal data, and launch hardening before going live. Existing dependency advisories remain part of that hardening work; this phase did not perform dependency-major upgrades.

Next implementation phase: **Phase 6 — support and content**, followed by Phase 7 admin operations and Phase 9 launch hardening. Phase 8 growth remains after launch. No Phase 6 work, commit or merge is included in this change.
