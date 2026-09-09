# Phase 6 — Support and content

**Date:** 2026-09-09. **Status:** step 1 complete and locally accepted; revised step 2 navigation/page simplification complete and locally verified. Stopped at the step 2 checkpoint; steps 3–6 have not started. Source: GENERAL_PLAN.md Phase 6 and NASMEH_FEATURES.md §3/§12/§13.1–13.2. The step 3–6 designs below were added with general plan v1.1 (2026-09-09); they describe intended work, not delivered work.

## User checkpoints

The user explicitly requested a stop and report after each numbered main step. Complete and verify one step, then end the turn before continuing. Do not treat a progress message as satisfying this stop.

1. **Contact forms and tickets** — complete: guided topics, durable requests, order context, private photos and routed transactional emails. [Acceptance record](../testing/phase-6-step-1-2026-09-09.md): 587 unit tests, 21 targeted browser checks, lint, migration/seed, Docker runtime and desktop/mobile checks pass.
2. **Navigation and page simplification** — complete and locally verified (user screenshot direction, 2026-09-09). This replaces the Help Centre build: no Help Centre, About Us, Explore or standalone Delivery page. Contact, tracking, legal, account and product/PDP content remain. [Acceptance record](../testing/phase-6-step-2-2026-09-09.md): 587 unit tests across 52 files, all 103 browser tests, lint, migration/schema, Docker and responsive visual checks pass.
3. Public order tracking — not started; design in "Step 3 design" below. **Next checkpoint.**
4. Returns, complaints and adverse-event reporting — not started; design in "Step 4 design" below.
5. Back-in-stock emails — not started; design in "Step 5 design" below.
6. Full Phase 6 regression, Docker, desktop/mobile review and backlog cleanup — not started; scope in "Step 6 scope" below. Each earlier step still receives checks appropriate to its own changes.

## Step 1 design

- `/kontakt` serves nine topic cards, reason choices, optional order context, contact details/message, an unchecked privacy acknowledgment and a real Turnstile challenge. Wrong/damaged deliveries accept up to four JPEG/PNG/WebP photos of at most 2 MB each. All Slovenian UI text lives in copy files.
- Signed-in shoppers select only their own orders. Guest lookup verifies one email/number pair per request, behind a separate challenge, and returns minimal order context. Final submission checks the pair again; lookup does not grant checkout/confirmation access or enumerate other orders sharing an email. Cancellation/change requests create tickets and do not mutate the order.
- A Ticket, attachment metadata and independent staff/customer email-delivery rows are written atomically before SMTP. A high-entropy request key with a canonical payload hash makes exact retries idempotent and rejects changed payloads using the same key.
- Attachments use private `support-uploads` storage, existing image decoding/re-encoding limits, generated filenames and an authorized route. Files are available to the submitting signed-in customer and administrators; guest uploads are available to administrators. Nothing is served as public product/review media. Failed persistence cleans up files.
- Topic routing is server-controlled from validated `support.contact` settings: adverse-event contact messages go to compliance; all others go to support. The dedicated structured adverse-event form is still step 4. Mailpit and `.test` addresses are used locally; real addresses/hours/response targets remain launch inputs.
- Staff notifications contain escaped request details and authenticated attachment links; reply-to is the validated sender email. Customer acknowledgments contain only a reference and generic receipt, avoiding disclosure of unverified submitted content to arbitrary inboxes.
- Each mail leg has its own lease, attempt count, stable Message-ID and sent status. A failed leg stays queued without resending the successful leg. The authenticated daily job retries ticket mail and reports actual failures. SMTP remains at least once across its acceptance/database-acknowledgment crash gap.

## Step 1 acceptance

Targeted unit/integration/browser checks cover all nine topics and reason validation, guest/account order ownership, wrong/damaged photos, protected media, challenge enforcement, same/different-payload idempotence, simultaneous submissions, mail routing/escaping/failures and retry leases. Check Prisma migration/seed behavior, TypeScript/lint, production packaging and the local contact preview. Record actual evidence in the step 1 acceptance report before marking this step complete.

## Step 2 revised scope — 2026-09-09

The user's screenshot direction supersedes the Help Centre scope. Build shopping-focused navigation: promotion/account rows, the shop mega-menu's product links and two Nasmeh featured cards, and a highlighted bundles link. Remove the Help Centre, About Us and empty Explore destinations from desktop/mobile navigation and page scope. Keep contact, tracking and legal links in the footer. Preserve the account, support/ticket flows, product content and PDP FAQs. Retain Nasmeh's own teal design tokens and assets; use the screenshot only as a layout reference.

Delivery stays in the existing checkout flow, which already reads configured methods/estimates, validates destination eligibility and computes shipping server-side. No Help Centre articles/categories or standalone shipping page are planned by this checkpoint.

Legacy URL handling: `/pomoc` → `/kontakt`; `/o-nas` and `/razisli` → `/`; `/dostava` → `/checkout`; `/paketi` → the existing `/trgovina?kolekcija=paketi` collection view. Update seed definitions and persisted navigation/CMS references, retire the obsolete shipping placeholder and sitemap entry, and replace references to the Dostava page with checkout. Do not overwrite unrelated operator settings or content.

## Step 2 local acceptance

[The acceptance record](../testing/phase-6-step-2-2026-09-09.md) documents 587 passing unit tests across 52 files and all 103 current browser tests passing, with zero failures, skips or flaky cases. Lint and the production Docker build passed. The schema diff is empty; final data-only migration 13 passed custom-data preservation and exact no-op replay checks. The refreshed preview is healthy at `http://localhost:3000` with the final migration applied. Desktop 1440 px, tablet 768/991 px and mobile 390 px checks passed for visual layout, focus, overflow and console errors.

Revised step 2 is complete and locally verified. Stop and report at this checkpoint. Public tracking remains step 3; steps 3–6 are still pending and are not authorized by this navigation work. Passing the current full browser suite does not complete the later full Phase 6 regression checkpoint, which must follow its remaining functionality. The earlier step 1 acceptance evidence above is retained separately.

## Future inputs

Support/compliance mailboxes, support hours/response commitment, return address and approved policies. These can be configured before launch and do not block building step 1. Real Stripe/PayPal/Turnstile acceptance remains the separate Phase 3 gate.

## Prerequisites before step 3 (added 2026-09-09)

- Workstation per GENERAL_PLAN §2.1: Node 20, Docker Compose v2, Git, a POSIX shell for `npm start`, Playwright Chromium, free ports 5543/11025/18025/4317. The machine analysed on 2026-09-09 had none of these (gate G0).
- Confirm the step 1–2 tree is committed on `main` (gate G5); the step 3 acceptance record cites that commit.
- Isolated database for `test:e2e` (`nasmeh_phase6_step3_<date>` on port 5543) and Mailpit only; no PSP keys locally.
- Migration numbering continues from the 13 existing migrations: step 3 → 14, step 4 → 15, step 5 → 16. Each step ships one migration containing its schema and data statements.

## Step 3 design — public order tracking (§12.3)

Routes and inputs:
- `/sledi` keeps its URL, footer link and `noindex`. Two server-rendered modes on one page: **tracking number**, or **email + order number**. Both are Turnstile-guarded with the shared challenge props and rate-limited per IP with `checkRateLimit` (20 requests per 10 minutes per mode). Exceeding the limit returns the same not-found response as a miss so the page is not an oracle.
- Tracking-number normalisation: trim, uppercase, strip inner whitespace; 6–40 characters of `[A-Z0-9-]`. Lookup by `Order.trackingNumber` (new index). If more than one order shares a number, return not-found and log a data error without PII.
- Response by mode. Tracking-number mode returns status, carrier, carrier link, `shippedAt` and estimate. Email + number mode keeps the existing fields (method, item count, total, date) and adds carrier link, `shippedAt`, `deliveredAt` and estimate. Neither mode returns names, addresses or line titles.
- Estimate: `shipping.methods[].estimate` resolved by `Order.shippingMethod` id, rendered as "Odposlano {date} · predviden prihod {estimate}" when shipped; status copy otherwise (pending payment, preparing, shipped, delivered with date, cancelled, refunded). Copy extends `orders.lookup` in `lib/copy/checkout.ts` or moves to `lib/copy/tracking.ts`.
- Carrier link only through `trackingUrl()` in `lib/tracking.ts` (HTTPS template, `{number}` encoded). Unknown carrier → number shown without a link.

Transitions and mail (`lib/orders/transitions.ts`):
- `markOrderShipped(orderId, { carrier, trackingNumber, actor })`: allowed from PAID or PROCESSING; validates the carrier against the configured `shipping.methods` carriers and the tracking-template keys; stamps `shippedAt` once (first shipment wins); sets `status = SHIPPED`; appends a timeline entry; sets `shippedEmailPending = true`. One transaction with `SELECT … FOR UPDATE` on the order, like the payment transitions.
- `markOrderDelivered(orderId, { actor })`: allowed from SHIPPED; sets `status = DELIVERED`; the existing DB trigger stamps `deliveredAt`.
- Rejected transitions return a typed result (`invalid_transition`, `not_found`, `missing_tracking`) and never throw for expected cases.
- Shipped email: `lib/email/templates/order-shipped.ts` (carrier, number, link from the same helper, estimate, order number, link to `/sledi`); copy in `lib/copy/email.ts`. Delivery follows the confirmation-email pattern: pending flag, lease, attempts and last error, post-commit send, daily-job retry stream `shippedRetries` with the `{processed, sent, failed, skipped}` shape and 503 on real failures.
- Migration 14 `phase6_tracking`: `Order.shippedAt`, `Order.shippedEmailPending/SentAt/LeaseUntil/LastError`, `@@index([trackingNumber])`; backfill `shippedAt = updatedAt` once for existing SHIPPED/DELIVERED rows (the Phase 5 `deliveredAt` precedent).
- Test hook: `testDriverShipAction({ orderNumber, carrier, trackingNumber })` behind `isTestMode()`, mirroring `testDriverPayAction`, so browser tests exercise the real transition. No admin UI in this step (general plan decision).

Consistency: a unit test builds one order and asserts that the account detail, the shipped email and the tracking page derive the identical URL; the e2e check compares the `href` on `/racun/narocilo/[number]` with the Mailpit link.

Acceptance list: GENERAL_PLAN Phase 6, "Step 3". Record: `docs/testing/phase-6-step-3-<date>.md`.

## Step 4 design — returns, withdrawal, complaints, adverse events (§12.4, §12.6)

Withdrawal (`/odstop-od-pogodbe`):
- A static route renders the CMS body (LEGAL template, draft notice while `reviewed = false`) and, below it, the **online model withdrawal form** and a link to the **downloadable PDF**. The `[slug]` route no longer serves this slug (precedent: `politika-piskotkov`).
- Online form fields: name, email, address, order number + order email (proof through `resolveContactOrder`; a signed-in owner needs no email), purchase or receipt date, items to return (free text, 10–2000 characters), optional note, unchecked privacy acknowledgment, Turnstile, request key. Submission creates a `Ticket` with topic `RETURN`, new reason `WITHDRAWAL` (added to `topicReasons.RETURN`) and `details` JSON `{ kind: "withdrawal", statutoryBasis, receivedAt, items, address }`. Staff mail subject prefix `[ODSTOP]` with the structured fields; the customer acknowledgment adds the statutory sentence that the seller refunds within 14 days of receiving the goods or proof of dispatch. No order mutation, no refund.
- PDF: `GET /odstop-od-pogodbe/obrazec.pdf` → pdfkit with the invoice font, the EU model withdrawal form (CRD Annex I(B)) in Slovenian, seller block from the `company` Setting, blank consumer fields; `Content-Disposition: attachment`, cacheable for a day. A unit test asserts the `%PDF` magic bytes and the company name.

Guarantee page: seed `garancija-vracila-denarja` (LEGAL, `reviewed = false`) with the 30-day conditions (contact first, proof of purchase, photos). The data migration adds the footer legal link only if missing (step 2 pattern). The PDP guarantee pill and the delivery/returns accordion link to it.

Reklamacije: the page body stays in the CMS; add a "Prijavi reklamacijo" CTA to `/kontakt?tema=DAMAGED` and `?tema=WRONG`. `ContactForm` accepts an initial topic from a validated search param (must be in `TOPIC_CODES`). The IRPS paragraph is marked for D4: the named provider, or the statement that none is recognised, is legal input, not code.

Adverse-event form (`/prijava-nezelenega-ucinka`, indexable, linked from the footer support group and the PDP INCI accordion):
- Fields: reporter name, email, phone (optional), reporter type (user / carer / health professional); product (select from ACTIVE products), **batch number required** ("natisnjeno na embalaži", 3–40 characters), purchase place and date, optional order number + email proof; reaction description (20–5000 characters), onset date, whether ongoing, medical treatment sought (yes/no + free text); consents: privacy (required, unchecked), follow-up contact permission (optional, unchecked); up to four photos through the step 1 photo path (extend `createContactTicket` to allow photos for `ADVERSE`).
- Creates a `Ticket` with topic `ADVERSE`, reason `REACTION` or `PRODUCT_SAFETY`, and `details` JSON holding every structured field; routing to the compliance mailbox already exists. The staff mail renders the structured block; the customer acknowledgment stays generic. Same request-key idempotency and payload hash (the hash includes `details`).
- Migration 15 `phase6_returns`: `Ticket.details Json?`; a data statement replacing the seeded "spletni obrazec je v pripravi" sentence in the unreviewed withdrawal draft only (B7); guarantee page and footer link upserts guarded by "only if missing".

Copy: `lib/copy/returns.ts` (withdrawal form, guarantee CTA, reklamacije CTA) and `lib/copy/adverse.ts`; support-email copy extended for the two structured mails.

Acceptance list: GENERAL_PLAN Phase 6, "Step 4". Record: `docs/testing/phase-6-step-4-<date>.md`.

## Step 5 design — back-in-stock alerts (§13.1–13.2)

Data (migration 16 `phase6_restock`): `BackInStockSubscription` += `notifiedAt DateTime?`, `alertPendingSince DateTime?`, `alertLeaseUntil DateTime?`, `alertLeaseToken String?`, `alertAttempts Int @default(0)`, `alertLastError String?`; index on `(alertPendingSince, alertLeaseUntil)`. The `SubscriberStatus` enum is unchanged; a notified row stays `CONFIRMED` with `notifiedAt` set.

Stock write path (`lib/inventory/stock.ts`, general plan rule 13):
- `setVariantStockInTx(tx, { variantId, stock, reason })` and `adjustVariantStockInTx(tx, { variantId, delta, reason })`: lock the variant with `FOR UPDATE`, write the new stock, and when `before <= 0 && after > 0` mark every `CONFIRMED` subscription for that variant or product with `notifiedAt = null` as `alertPendingSince = now()` in the same transaction. Returns `{ before, after, armedAlerts }`.
- `deductOrderInventory` remains the only decrement path (already locked and tested). Seed stock writes switch to the helper. Phase 7 product and refund forms must use it; AGENTS.md §8 gets the convention at step 6.

Sending:
- `lib/jobs/restock-alerts.ts` `sendPendingRestockAlerts(now)`: claim up to 50 rows with a five-minute lease (the `sendDueReviewRequests` pattern), re-check that the variant still has stock > 0 and the row is still CONFIRMED and un-notified, send `lib/email/templates/back-in-stock-alert.ts` (product title, price via `lib/pricing`, PDP link, unsubscribe link), set `notifiedAt`, clear pending and lease. Failures release the lease and keep the row retryable; results use the `{processed, sent, failed, skipped}` shape as stream `restockAlerts` in `/api/jobs/daily`.
- Post-commit fast path: callers of the helper invoke `sendPendingRestockAlerts()` best-effort after their transaction, the way `deliverOrderConfirmation` runs after `markOrderPaid`.
- Unsubscribe: `/odjava-zaloga/[token]`, where the token is an HMAC over the subscription id with `AUTH_SECRET` (the `rating-token` pattern); sets `status = UNSUBSCRIBED`, records a `ConsentLog` row, idempotent.
- Re-subscribe semantics: an existing `CONFIRMED`, un-notified row is a no-op success; a notified row is re-armed by clearing `notifiedAt` without a new confirmation email (consent already given); `PENDING` rows get a fresh confirmation token as today.
- Test hook: `testSetStockAction({ sku, stock })` behind `isTestMode()`, calling the helper.

Acceptance list: GENERAL_PLAN Phase 6, "Step 5". Record: `docs/testing/phase-6-step-5-<date>.md`.

## Step 6 scope — regression, cleanup, review

- Backlog: B1 sitemap (add `/trgovina` and ACTIVE, catalog-visible product URLs; keep noindex routes out), B2 delete the stub copy module and component, B6 optional Node port of the standalone start script if Windows development continues, B9 Windows directory-fsync tolerance in the review-media guard, B10 `.env` loading in the seed script.
- Suites: `npm run lint`, `npm run test`, `npm run test:e2e` in full; fresh-database `migrate deploy` (16 migrations) and seed ×2; `docker compose build` and a run smoke covering the three media volumes and the daily job with all five streams.
- Review: desktop 1440, tablet 768/991, mobile 390 on `/sledi`, `/odstop-od-pogodbe`, the guarantee page, the adverse-event page and the restock email in Mailpit; JS-disabled source checks; keyboard focus on the new forms; clean console.
- Review-boss checklist per GENERAL_PLAN §2 rule 3, including a phase-discipline check that no Phase 7 UI leaked in.
- Docs: acceptance record `phase-6-step-6-<date>.md`; update AGENTS.md §3 (new routes and `lib/inventory`), §5.11 (remove the step 2 stop instruction), §8 (stock helper convention); update the GENERAL_PLAN status ledger and this file's header.

## Known-gap cleanup map

| Backlog item (GENERAL_PLAN §6) | Step |
|---|---|
| B1 sitemap products/catalog | 6 |
| B2 dead stub code | 6 |
| B4 subscription notified/lease state | 5 |
| B5 tracking page, transitions, shipped email | 3 |
| B6 POSIX-only start script | 6 (optional) |
| B7 withdrawal draft sentence | 4 |
| B9 Windows directory-fsync in the review-media guard | 6 (with B6) |
| B10 seed script does not load `.env` | 6 |
