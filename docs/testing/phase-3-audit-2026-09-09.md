# Phase 3 independent acceptance audit — 2026-09-09

**Follow-up:** The user-authorized [repair record](phase-3-repairs-2026-09-09.md) now records 319 passing unit tests and 80 passing browser tests. The defects below describe the pre-repair tree; they remain here as the audit trail. Real-provider sandbox acceptance is still pending.

**Decision: Phase 3 is not accepted.** The simulated purchase flow works, but independent tests reproduce order-access, inventory, payment-state, and cart defects. Real payment completion also has missing implementation. Earlier “all gates green” statements in the phase plan are historical reports, not the current acceptance status.

## Scope and repository state

Reviewed `AGENTS.md`, both feature specifications, `GENERAL_PLAN.md`, every existing phase plan (0–5), and all seven research dossiers. Compared them with routes, cart/checkout/payment/order code, migrations, tests, and git history. Tested the current working tree at HEAD `5cca5d6`, including the existing uncommitted Phase 5 work; this is not a test of the historical Phase 3 commit in isolation.

| Build phase | Current state |
| --- | --- |
| 0 — Foundation | Implemented/committed: Next.js, Prisma, auth skeleton, tokens, Docker, seed. Fresh migration/build/startup checked here. |
| 1 — Storefront shell | Implemented/committed: homepage, navigation, consent, newsletter, legal-page rendering, SEO. Existing browser coverage largely passes. |
| 2 — Catalog | Implemented/committed: catalog, product pages, search, price history, restock capture. Existing browser coverage passes. |
| 3 — Cart/checkout/orders | Implemented simulated path; acceptance reopened by this audit. Real Stripe/PayPal completion remains incomplete. |
| 4 — Promotions | Already committed (`4cad0e0`, `5cca5d6`): coupons, redemption links, welcome popup, curated cross-sells. Its seven browser tests pass. |
| 5 — Accounts/reviews | Substantial uncommitted work: verification/reset, dashboard, addresses, invoices, reviews, moderation, daily job. Four auth tests pass after selector corrections. Planned `account.spec.ts` and `reviews.spec.ts` are missing; phase review is pending. |
| 6, 7, 9 | Future launch work: support/content, operational admin, then hardening/deployment. |
| 8 | Post-launch growth. Recommended order remains 0→1→2→3→4→5→6→7→9→8. |

Build **Phase 3** is part of the feature specification's **P1-core** launch scope. It is unrelated to the feature tag **P3-later**.

## Executed checks

Used a separate PostgreSQL database, `nasmeh_phase3_audit_20260909`, on the existing local development DB service. No existing development records were seeded, deleted, or modified. All payment outcomes used the local test driver and synthetic signed events; SMTP was explicitly directed to local Mailpit. No real payment or customer email was sent.

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, including after test additions. |
| `npm test` | **140/140 pass**, 21 files. |
| Empty-database migration | **8/8 applied**, including the pending Phase 5 migration. |
| Seed twice | Stable counts: 5 products, 5 variants, 7 price-history records, 20 media records, 2 users, 14 settings, 8 menus, 6 content pages, 2 collections. |
| Initial existing browser suite | 51 passed, 3 failed, 5 skipped. Two failures were ambiguous selectors; the third was missing noindex after an account redirect. |
| Expanded browser suite after selector corrections | **55 passed, 8 failed, 2 skipped; 65 total; no flaky results.** Six failures are new Phase 3 acceptance regressions; two are existing account/SEO integration failures. |
| Previously skipped cookie-tamper and product-visibility tests | **2/2 pass** when selected independently. |
| Login-merge with a temporarily verified isolated seed customer | **1/1 pass.** The underlying merge works; the ordinary unmodified seed fails verification before merge is reached. The test customer's verification field was restored afterward. |
| Production standalone build | Pass as part of Playwright startup. |
| `docker compose build` | Pass on retry. First attempt timed out resolving Docker Hub's Dockerfile frontend, before application compilation. |
| Fresh container startup | 8 migrations applied at entrypoint; health endpoint reports DB up; Docker health is healthy; uid 1000; PDFKit font data present. `/`, `/cart`, `/checkout` return 200, catalog is in initial homepage HTML. |
| Container product media | **Fail:** `/uploads/placeholder-trakci.svg` returns 404. `.dockerignore` excludes `public/uploads`; compose has no upload mount. |

The existing five checkout tests all pass: guest purchase with exact stored totals, confirmation email/PDF attachment and lookup; simulated SCA failure/retry; sequential webhook replay plus invalid signature; simple stockout; synthetic PayPal capture event. These do **not** establish real Stripe, 3DS, wallets, PayPal capture/signatures, or Klarna operation. Invoice layout/Slovenian glyph rendering was not visually certified in this audit.

## Reproduced acceptance failures

These tests assert the required behavior; they are deliberately not skipped or marked as expected failures. Their red result preserves the acceptance gate until implementation is repaired.

| Priority | Failure and observed evidence | Location |
| --- | --- | --- |
| P1 | An anonymous request with no purchaser cookie/token receives another guest order's private item title in the confirmation HTML. | `app/(storefront)/potrditev/[orderNumber]/page.tsx:31`; customer acceptance test 1. |
| P1 | An unrelated anonymous browser can choose a password on that confirmation page, create a user under the purchaser's email, and become the order owner. The test proves both user creation and changed `Order.userId`. | `app/(storefront)/actions/checkout.ts:144`; customer acceptance test 2. |
| P1 | Bundle + standalone item both require the same component. With stock 1 and demand 2, payment is marked PAID and stock becomes **−1**. | `lib/orders/transitions.ts:75`; webhook acceptance test 1. |
| P1 | After payment and a move to PROCESSING, a distinct success event changes status back to PAID, rewrites payment/invoice timestamps, and decreases stock **2→1 again**. | `lib/orders/transitions.ts:71`; webhook acceptance test 2. |
| P1 | `CHECKOUT.ORDER.APPROVED` without capture marks the PayPal order PAID, issues an invoice number, and deducts stock. | `app/api/webhooks/paypal/route.ts:42`; webhook acceptance test 3. |
| P2 | Adding the same item twice while logged in leaves stored quantity **1 instead of 2**. | `lib/cart/server.ts:71`; customer acceptance test 3. |
| P2 | Seeded customer login redirects to `?error=unverified`; the existing merge test cannot reach merge. Seeded admin has the same missing `emailVerified` field. | `prisma/seed.ts:347`, `lib/auth.ts:32`, `tests/e2e/cart.spec.ts:151`. |
| P2 | Anonymous `/racun` redirects to `/prijava`, whose rendered metadata has no noindex. | `app/(storefront)/prijava/page.tsx:12`, `tests/e2e/ssr.spec.ts:87`. |

Regression files: `tests/e2e/phase3-customer-acceptance.spec.ts` and `tests/e2e/phase3-webhook-acceptance.spec.ts`. Fixtures are unique to each test and cleaned up in `finally` blocks.

## Additional code-confirmed gaps

These were established by reading implementation, not by executing real PSP requests or concurrency/failure-injection tests:

1. **Stripe UI is a placeholder.** `CheckoutWizard.tsx:114` discards `clientSecret`; `:560` only renders placeholder text. There is no mounted Payment Element or confirmation call. The prior Phase 3 plan's claim that this code path exists is incorrect.
2. **Production checkout has no Turnstile widget/token path.** `CheckoutWizard.tsx:110` sends `testToken ?? ""`. Tests bypass this; production verification rejects an empty token.
3. **PayPal still needs capture and real webhook verification.** Only sandbox order creation/approval redirection exists. The webhook uses the test-style HMAC contract rather than PayPal verification. Credentials alone will not finish it.
4. **Webhook processing is not atomic/retry-safe.** The processed-event record commits before state changes; every insertion error is treated as a duplicate. State and stock checks precede the transaction. A failed transition can lose retries, and concurrent requests can oversell/double-deduct. Add deterministic fault/concurrency coverage with the repair.
5. **Payment recovery is incomplete.** PSP intent creation runs inside the database transaction; checkout-key retries return neither client secret nor approval URL. Implement recoverable order/intent creation before sandbox acceptance.
6. **Checkout does not show the final payable amount before submission.** Its rail uses shipping cost zero and continues displaying “choose shipping”; the review step displays only contact/address/provider. VAT/installment copy uses subtotal, including when a coupon is applied.
7. **Discounted invoices do not explain the discount.** `InvoiceData` and PDF rendering show undiscounted item/subtotal values and discounted grand total without a discount row. Add coupon invoice reconciliation coverage.
8. **Post-purchase accounts have no usable verification path.** The account action neither verifies email nor sends verification, while current authentication requires verification. Repair this together with ownership protection.
9. **Country/rate validation needs alignment.** Checkout accepts any two-character country but requires four-digit postal codes for every country, despite offering other EU destinations. Shipping methods are not validated against destination zones.

## Required next work

1. Repair order ownership proof, guest account claim/activation, and confirmation access. Retest both authorized purchase access and anonymous denial.
2. Make payment transitions transactional, state-aware and retry-safe; aggregate inventory requirements and prevent concurrent overselling. Require captured PayPal payment. Make the six new regressions green and add failure/concurrency cases.
3. Repair logged-in cart increments, verified seed setup, account noindex, final checkout totals, coupon invoice reconciliation, and upload persistence/package handling.
4. Complete Stripe payment UI, Turnstile, PayPal capture/signatures, and recoverable intent handling. Then run the master plan's actual sandbox card/3DS/PayPal tests, real webhook delivery, failure/refund/reconciliation cases, wallets, and conditional Klarna acceptance.
5. Finish Phase 5 account/review end-to-end coverage and its review gate, preserving the current WIP. Proceed to Phase 6 support/content, Phase 7 admin operations, then Phase 9 launch hardening. Keep Phase 8 growth after launch.

Launch still needs final original product assets/content/claims, brand-color decision, legal/accountant sign-off, actual company/invoice data, payment onboarding, carrier rates/accounts, SMTP/Turnstile configuration, backup restore drill, monitoring, security/performance checks, home-server proxy/TLS deployment, real order/refund test, and rollback/runbook. These are recorded requirements, not completed by a passing build.

Document conflicts also need explicit resolution: older phase headers still say “in progress” despite historical completion reports; `NASMEH_FEATURES.md` §16 calls abandoned-cart flows P1 although detailed scope and AGENTS defer ESP flows; accessibility is deferred in one feature section but required by AGENTS; the detailed admin role/2FA scope exceeds the current CUSTOMER/ADMIN model. The master plan's obsolete “no code” header was corrected in this audit. Historical competitor research never overrides the canonical architecture and feature decisions.

## Reproduction and changes made

Keep `DATABASE_URL` pointed at the isolated audit database for tests: the default test script seeds the configured development database. Services must be running, migrations applied, and seed loaded. The following reproduces the expanded suite using only local SMTP and the built-in test provider:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5543/nasmeh_phase3_audit_20260909 \
SMTP_HOST=127.0.0.1 SMTP_PORT=11025 SMTP_USER='' SMTP_PASS='' \
STRIPE_SECRET_KEY='' PAYPAL_CLIENT_ID='' PAYPAL_CLIENT_SECRET='' \
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY='' npx playwright test
```

Audit changes are limited to tests and documentation: two new regression files; exact accessible-name selectors in cart/auth tests; a concise route-specific SSR assertion message; this report and reconciled master/Phase 3 status. Application implementation and the pending Phase 5 migration were not edited. No commit, merge, deployment, or live-provider operation was performed. The temporary smoke container/database were removed; the isolated audit DB is retained for reproduction.

Machine-readable run records are local: `/tmp/nasmeh-phase3-audit-20260909.json`, `/tmp/nasmeh-phase3-skipped-20260909.json`, `/tmp/nasmeh-phase3-merge-20260909.json`; Docker build log: `/tmp/nasmeh-phase3-docker-20260909.log`. The audit report remains the durable result if temporary files are cleared.
