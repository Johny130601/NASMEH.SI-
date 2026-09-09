# Phase 5 — Customer accounts & reviews

**Date:** 2026-09-09 · **Status:** implemented and locally accepted; uncommitted. Scope: GENERAL_PLAN.md Phase 5 and NASMEH_FEATURES.md §10/§11/§14.9/§14.12. Real-provider checks remain separate from local acceptance.

## Delivered scope

- Registration, explicit email activation, login, forgotten-password/reset and logout. Slovenian copy files, unchecked marketing opt-in, reusable Turnstile widgets, social-first layout with disabled OAuth slots.
- `/racun` order dashboard, all-item expansion, order detail with saved prices/discount/VAT and both address snapshots, carrier links, authorized invoice PDF downloads and delivered-item review entry points.
- `/racun/podatki` address create/edit/delete/default, country-specific postal validation and marketing preference changes with consent history.
- Post-delivery review requests, signed star links, one review per purchased item, up to four photos, optional sensitivity/recommendation attributes, and verified-buyer linkage.
- SSR PDP summary/distribution/photo wall/cards, sorting and combined star/photo filters; Product AggregateRating and Review JSON-LD derived from all published reviews. Product cards use the same published data.
- `/admin/ocene` pending/published/rejected queues, approve/reject, merchant reply editing/clearing, per-photo removal, auto-publish setting (off/4+/5) and request delay (7–10 days). Every mutation rechecks the admin role.

## Auth and consent invariants

`AuthToken` stores a SHA-256 token hash, kind, expiry, used timestamp and optional activation snapshot. Verification expires in 24 hours; password reset in one hour. GET renders an activation screen without consuming a token: an explicit challenged POST performs the mutation, so email link scanners cannot activate accounts.

Issuing and consuming tokens locks the user row. Only the newest token of that kind remains usable; consuming a token and changing credentials are one transaction. Verification snapshots the requesting shopper's password hash, name and marketing choice onto that token, preventing another unverified registration from supplying the credentials activated by a victim's email click. Marketing stays disabled until explicit activation. Consent history records registration, activation and preference changes.

Password validation rejects bcrypt inputs over 72 UTF-8 bytes. The credentials provider verifies Turnstile itself, so direct Auth.js callbacks cannot bypass the UI guard. Forgotten-password responses are uniform. Successful activation/reset increments `User.sessionVersion`; Node-side session reads compare the JWT version and current database role, invalidating old sessions. Middleware provides coarse routing while pages/actions enforce current authorization.

Upgrade behavior: old JWTs without a version require login again. Unused verification tokens without an activation snapshot fail closed; re-register to obtain a fresh link.

## Address and order integrity

Address mutations serialize on the owning user row. Ownership is checked before default changes; deleting the default promotes another remaining address. A partial unique index enforces at most one default per user. Editing an address never rewrites an existing order's snapshots.

Order detail and invoice routes require the owner or an administrator. Unissued invoices return 404. PDFs retain saved discounts/VAT, multiline billing data and Slovenian glyphs; responses are private and not cached. Tracking URLs accept safe HTTPS templates and encode the tracking number.

## Scheduled delivery

`POST /api/jobs/daily` requires `Authorization: Bearer <JOBS_SECRET>` with constant-time comparison. It retries pending Phase 3 order confirmations, then considers up to 50 eligible review-request orders. Host scheduling is an operational deployment step; the app does not start its own cron process.

- Reviews are requested 7–10 days after `Order.deliveredAt`, configured in `/admin/ocene`; the seed default is 7 days. A database trigger stamps first delivery. Later edits do not restart the delay. Already-delivered legacy orders are backfilled once from their previous `updatedAt`, the only available historical proxy.
- Eligible orders are delivered, require no refund, and have an unreviewed item linked to an existing variant. Eligibility is rechecked after claiming.
- `ReviewRequest.orderId` is unique. New eligible recipients receive priority; remaining capacity is filled by retries with the fewest attempts, then oldest delivery. The total batch stays capped at 50, and repeated failures cannot monopolize retries. The worker claims an unsent row with a five-minute lease and token before sending; simultaneous/repeated jobs skip active or sent rows. Each claim uses its actual current time. Attempts, sent time, lease and sanitized error state make failures retryable.
- Star links contain a domain-separated HMAC token binding item, rating and expiry; request links expire after 30 days. SMTP uses a stable Message-ID per order.
- A failed send returns the claim to retryable state. A crash after SMTP accepts mail but before the database acknowledges it can still duplicate mail on retry: delivery is at least once. The endpoint returns aggregate counts without customer data and HTTP 503 on delivery failures.

See the job invocation example in the [existing operational checklist](../testing/phase-3-sandbox-checklist.md). Configure a long dedicated secret in the app and host scheduler; never put it in a public environment variable.

## Review authorization and media

Submission requires the delivered order's customer session or a valid signed item token. An admin session alone cannot impersonate a buyer. Submission locks the order, rechecks eligibility and handles duplicate races using the unique OrderItem link. Tokens, text, attributes and form boundaries are validated with zod.

Photos accept JPEG/PNG/WebP, at most four files and 2 MB each, with a 16-megapixel decode cap. Sharp checks actual file contents against declared MIME type, strips metadata and writes 960/320-pixel WebP variants. Server Actions allow a 10 MB multipart body. Failed/duplicate submissions clean up generated files.

Product media remains in `public/uploads`. **Review media is stored privately in `review-uploads`**, mounted separately in Docker and excluded from git/build context. Existing `/uploads/reviews/<generated filename>` URLs resolve through an authorization-aware route: published reviews are public; pending/rejected photos require the owner/admin. Thumbnails follow the same check. Responses are `private, no-store` with `nosniff`, so changing moderation status takes effect on subsequent requests.

Before local standalone or Docker startup, `scripts/migrate-review-uploads.cjs` moves generated legacy review files out of the public directory. It preflights names/symlinks/collisions, copies exclusively, verifies SHA-256 and durable storage, then removes the public source. Identical existing private copies permit idempotent recovery. Unknown files, symlinks or conflicting contents stop startup with all unverified data preserved. Do not bypass this guard: Next static files can otherwise bypass route authorization. Back up and restore both media volumes alongside PostgreSQL.

## Migrations

1. `20260909131200_phase5_accounts`: AuthToken, ReviewRequest, review attributes.
2. `20260909160000_phase5_acceptance`: session version, delivered timestamp/backfill/trigger, review-send leases, default-address normalization and unique index.
3. `20260909161000_phase5_activation_snapshot`: activation data bound to verification tokens.

The existing Phase 3 repair migration between these is preserved. Deploys apply the full ordered migration history.

## Acceptance and review gate

Final results are recorded in the [acceptance report](../testing/phase-5-acceptance-2026-09-09.md): **512 unit tests, 94 browser tests, lint/TypeScript and Docker build pass**, with zero browser skips/flaky cases. Fresh migration/seed and private-media runtime checks also pass. Coverage includes:

- Auth lifecycle through Mailpit; replay/expired/malformed tokens; concurrent resets; activation binding; old-session revocation; unverified login; server challenge boundary; private account routes.
- Dashboard snapshots, all-item expansion, tracking and PDF download; owner/admin/foreign access; address CRUD/default and concurrent mutations; consent withdrawal history.
- Authenticated job endpoint, concurrent and repeated invocations, delivered timestamp semantics and lease recovery; SMTP failures and acknowledgment failures in unit tests.
- Email → signed five-star link → invalid-image rejection → two real photos (one over 1 MB) → moderation → SSR/JSON-LD; duplicate submission; pending/rejected media privacy; photo deletion, reply and configurable moderation.
- Aggregate counts beyond ten reviews, combined filters, token and actual-image validation, legacy media migration/idempotence/collision/symlink preservation.
- Full lint/type check, all unit/browser regressions, seed idempotence, migration parity, production Docker build, fresh-database startup and preview smoke/visual inspection.

Independent review identified and fixed non-atomic token use, activation credential binding, stale sessions, concurrent default addresses, duplicate job sends, delivery-time drift, truncated review aggregates, unvalidated image content and legacy public-media exposure. Final follow-up review is recorded with acceptance results.

## Deferred and next

Real Turnstile siteverify and production SMTP delivery need configured services; the existing Phase 3 Stripe/PayPal sandbox gate still needs credentials. Local acceptance uses explicit challenge/payment test mode and Mailpit only. Schedule the daily endpoint on the deployment host before launch.

OAuth, helpful votes, incentives, self-service withdrawal/GDPR and notification preferences remain Phase 8. Support/content is Phase 6, full admin operations Phase 7, launch hardening Phase 9. No Phase 6 implementation is included here.
