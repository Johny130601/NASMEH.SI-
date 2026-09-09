# Phase 3 — Cart, checkout & orders

**Date:** 2026-09-09 · **Status:** Repaired locally; real-provider sandbox acceptance pending · **Scope source:** `docs/GENERAL_PLAN.md`, Phase 3; spec §7/§8; AGENTS §5.2–5.4; research 03

## Current acceptance — repairs, 2026-09-09

The [repair record](../testing/phase-3-repairs-2026-09-09.md) follows the [independent audit](../testing/phase-3-audit-2026-09-09.md) and supersedes historical completion claims below. Lint, 319 unit tests and all 80 browser tests pass, with no skips or retries. Private order access, post-purchase claiming/cart cleanup, logged-in increments, aggregate/locked inventory, atomic webhook handling, refunds, signed checkout quotes, invoice discounts/fonts and media packaging are repaired. Refer to the repair record for Docker validation.

Stripe Payment Element, PayPal buttons/server capture/official verification, production Turnstile and owned pending-payment recovery are now implemented. **Phase 3 is not accepted until real-provider sandbox tests pass.** Credentials are absent, so 3DS, wallets, PayPal delivery and reconciliation are still unexecuted. Follow the [sandbox checklist](../testing/phase-3-sandbox-checklist.md); Klarna remains disabled until SI buyer eligibility is confirmed. The remaining sections preserve original implementation history and are not current implementation specifications.

## Phase split
- **3a (this run):** scope items 1 (cart domain), 2 (promo pricing core), 3 (/cart page), 4 (/koda scaffold), 12 partial (view_item/add_to_cart/begin_checkout events; `purchase` lands with 3b).
- **3b (next run):** scope items 5 (checkout), 6 (payments Stripe/PayPal/Klarna), 7 (webhooks), 8 (order creation + stock), 9 (legal/Turnstile/abandoned capture), 10 (confirmation + invoice), 11 (guest lookup), 12 (purchase event).

## 3a — Cart domain + pricing core + cart page

### lib/cart
- `codec.ts` (PURE): guest cookie `nasmeh_cart` = `base64url(JSON {v,lines:[{variantId,quantity}]}).hmac-sha256(secret)`; zod line schema (variantId string, qty int 1–99); `signGuestCart`/`verifyGuestCart` (forge→null). Secret injected → unit-testable.
- `merge.ts` (PURE): `mergeCartLines(dbLines, guestLines, maxByVariant)` → merged [{variantId, quantity}] with cap re-applied (guest 5 + db 5 → 5).
- `server.ts` (I/O): read/write guest cookie; DB cart CRUD; `getCartLines(userId)` → unified lines; `mergeGuestCartIntoUserCart(userId)` (tx: upsert items capped, clear cookie).
- Server Actions `actions/cart.ts`: add/update/remove — zod `{variantId, quantity}` ONLY (never prices; unknown keys like client-sent priceCents stripped/ignored); auth() chooses DB vs guest path; returns {ok, count}.
- Merge trigger: Auth.js `events.signIn` in lib/auth.ts → merge. loginAction redirectTo → "/racun" (was /admin; customer-friendly).

### lib/promo (PURE, zero I/O, `now` injected)
- Types in `lib/promo/types.ts`: CartLineInput {variantId, quantity, title, sku, priceCents, compareAtPriceCents, vatRatePercent, maxCartQuantity, isBundle, bundleComponents?[{title,quantity}]}, PromoSettings {vatRatePercent, freeShippingThresholdCents, shippingCostCents}.
- `lib/promo/priceCart.ts`: lines pricing from snapshots (bundle price = variant price; components listed for display), subtotal, shippingCents (0 when empty OR subtotal ≥ threshold else settings.shippingCostCents), vatBreakdown reuse, total, freeShipping {reached, remainingCents (ceil), progressPercent (5 % floor on empty)}.
- NO coupon math (Phase 4 extends THIS engine).

### Cart page & wiring
- SiteHeader badge: server-computed count (guest cookie / DB cart) shown when >0.
- AddToCartButton (client island) on CatalogCard; BuyBox live ATC (uses stepper qty); StickyBuyBar live ATC; all push add_to_cart + router.refresh.
- `/cart` page per §7.1: header (N = total qty) + total; ShippingProgress (3 states, 5 % floor, ceil remaining, threshold Setting); Klarna row; CartLineItem rows (image/title/sku/price/compare-at+omnibus line when discounted/bundle component list/qty stepper cap with "Največ 5 kosov na naročilo"/trash); cross-sell "Ljudje tudi kupujejo" (products not in cart, quick ATC); checkout block "Na blagajno" (begin_checkout push) + PaymentIcons (extracted shared); empty state + best-sellers rail. NO coupon box.
- `/koda/[code]`: zod format check ^[A-Z0-9\-]{3,24}$ → cookie `nasmeh_koda` → redirect /cart; cart summary shows "Aktivna koda" pill + remove + note "aktivira se v fazi 4".

### Analytics (lib/analytics.ts PURE + client push)
- `buildViewItemEvent/addToCartEvent/beginCheckoutEvent` → GA4-ish {event, ecommerce:{currency, value, items:[{item_id, item_name, price, quantity}]}}. Client `pushEvent` (dataLayer push; no-op without GTM/consent — documented). view_item on PDP mount (client TrackViewItem), add_to_cart in ATC handlers, begin_checkout on cart→checkout click.

### Settings/seed
- +`shipping.standardCostCents` 390; +CUSTOMER seed user (customer@nasmeh.si / SEED_CUSTOMER_PASSWORD default "Customer123!") for merge e2e.

### Copy
lib/copy/cart.ts (header, progress 3 states, klarna, cap message, empty, cross-sell, checkout block, koda note), analytics keys where needed.

### Tests
- Unit: promo matrix (bundle expansion totals, €44.99 vs €45.00 boundary, VAT exactness, cap on merge via mergeCartLines 5+5→5, empty cart, mixed bundle+single); codec (round-trip, forge→null, wrong secret→null, bad shape→null); merge (sum below cap, cap, new lines); analytics event shapes.
- e2e cart.spec: PDP ATC + sticky ATC → badge → steppers (cap 5 + message, minus disabled at 1) → remove → progress states (empty/in-progress 19,99/reached 49,99 bundle; exact 44,99/45,00 boundary covered in Vitest) → cross-sell quick ATC → koda scaffold (store+show+remove) → merge-on-login (guest 3 lines → login customer → merged, cookie cleared, DB rows) → tamper (forged cookie → ignored/empty).
- Gates: lint, unit, e2e, seed×2, docker smoke.

## 3b — Checkout, payments, orders, invoices (this run)

**PSP credentials (D5) absent → provider abstraction + test driver.** Verified NOW: full purchase flow incl. webhooks/signatures/stock/invoice via test driver; pending D5 sandbox: live Stripe (SCA/3DS2, wallets, Klarna SI), live PayPal, live webhook delivery.

### Schema (`phase3b_checkout`)
- `ProcessedEvent`(provider, eventId uniq, type) — webhook idempotency.
- `AbandonedCheckout`(email, cartSnapshot Json, recoveryToken uniq) — step-1 capture (emails Phase 8).
- `Counter`(key @id, value Int) — atomic order-number sequence `NS-{year}-{seq:05}`; invoice number = order number (documented).
- Order += phone, shippingMethod, paymentProvider, invoiceNumber? uniq, invoiceIssuedAt, paidAt, stockDeducted (guard), marketingOptIn.

### lib/payments
- `types.ts` PaymentProvider {createIntent({orderNumber,totalCents,email}) → {provider,intentId,clientSecret?,approvalUrl?}}; `stripe.ts` (stripe SDK PaymentIntent, automatic_payment_methods; Klarna via env STRIPE_KLARNA_ENABLED; only when STRIPE_SECRET_KEY), `paypal.ts` (Orders v2 REST via fetch, only when PAYPAL_* keys), `test.ts` (only isTestMode(): intentId test_pi_*, outcomes success/sca_fail/failure simulated through the REAL webhook route with REAL signatures).
- `webhook-verify.ts`: stripe-style HMAC `v1=HMAC_SHA256(secret, "{ts}.{body}")`, timing-safe; used by BOTH providers (documented: PayPal swaps to their verify-webhook-signature API at D5). Signature verified BEFORE parsing.

### lib/orders + invoice
- `numbers.ts`: nextOrderNumber (Counter in tx) → NS-2026-00042 (unit-tested format).
- `create.ts`: placeOrder — zod form, server-priced cart (lib/promo), stock pre-check, tx: Order PENDING + snapshot items/addresses/totals/VAT + timeline[created], payment intent via provider; idempotent on recoveryToken.
- `transitions.ts`: markOrderPaid (ProcessedEvent guard → tx: status PAID+paidAt, stock check (bundle→components; insufficient → CANCELLED "ni zaloge", clear error, NO decrement), single stock decrement, stockDeducted=true, invoice number+timeline) → post-tx: confirmation email + PDF invoice (only on actual transition); markPaymentFailed (stays PENDING, timeline, retry path); markRefunded.
- `lib/invoice/data.ts` (buildInvoiceData — unit-tested totals) + `pdf.ts` (pdfkit → Buffer; %PDF magic asserted).
- Email: renderOrderConfirmationEmail + sendOrderConfirmation (PDF attachment) via Phase 0 mailer.

### UI
- `/checkout` server (empty-cart guard + summary rail: items/subtotal/shipping/"vključen DDV 22 %"/total/Klarna recap) + CheckoutWizard client: Kontakt (email + checkEmailExistsAction → "imate račun? prijavite se", marketing opt-in UNCHECKED, captureCheckoutEmailAction on continue) → Dostava (phone/name/street+no./city/4-digit postal/country SI+EU list; shipping methods radio from Setting shipping.methods with prices/estimates; free ≥ threshold re-priced server-side) → Plačilo (provider radio stripe/paypal/test; T&Cs+withdrawal links; Turnstile) → Pregled (review + "Naročilo z obveznostjo plačila"). placeOrderAction → inline pay panel (test buttons / Stripe Element when keys / PayPal button when keys) → /potrditev/[orderNumber].
- `/potrditev/[orderNumber]`: PAID → NS number, summary, delivery estimate, tracking explainer, TrackPurchase (CMP-gated), CreateAccountForm (post-purchase, password → CUSTOMER user + order linked); PENDING → "čakamo na potrditev plačila"; CANCELLED → clear error.
- `/sledi` replaces stub: email+order number → lookupOrderAction → status/tracking (Phase 6 page backend).
- Seed: `shipping.methods` [PS standard 390 2–4 dni, PS express 690 1–2 dni, GLS 490 2–3 dni].

### Webhooks
- `/api/webhooks/stripe` + `/api/webhooks/paypal`: raw body → signature verify → ProcessedEvent insert (unique → early 200) → transition handlers (safe to receive twice).

### Tests
- Unit: nextOrderNumber format/sequence, buildInvoiceData totals, webhook signature (valid/invalid/tampered-ts), placeOrder price integrity (client-sent totals ignored).
- e2e checkout.spec: full guest purchase (email capture asserted) → pay success → NS- on confirmation → Mailpit confirmation email + invoice PDF attachment → guest lookup; SCA-fail → retry → success; PayPal test flow; webhook idempotency (2× same event → ONE transition/decrement/email) + invalid signature → 400 + no state change; stock-out at confirm → CANCELLED clear error.
- Gates: lint, unit, e2e, seed×2, docker smoke.

## Review-boss findings — 3b (2026-09-09)

**Historical 3b report (scope items 5–12): claimed Phase 3 complete/all gates green. Superseded by the independent acceptance status above.**

Test results:
- `lint`: green. `test`: 87/87 (order numbering, invoice data totals, webhook signature valid/tampered/wrong-secret/stale, + all prior).
- `test:e2e`: 47/47 — full guest purchase (abandoned capture asserted, exact snapshot totals incl. free-shipping case, stock −2 once, confirmation NS-, Mailpit confirmation email with PDF invoice attachment, guest lookup), SCA-fail → retry → paid, webhook idempotency (same event twice → already_processed, stock unchanged, exactly 1 email), invalid signature → 400 + no state change, stock-out at confirm → CANCELLED clear error + no decrement, PayPal webhook path (signed COMPLETED → paid, duplicate → already_processed, garbage sig → 400).
- Seed ×2 idempotent. Docker: fresh volume → 6 migrations, health + /checkout 200, uid 1000, pdfkit data present in image. Audits PASS.

Bugs found & fixed in the loop (all real):
1. **Shared useTransition** — email-blur check disabled the continue button mid-click → handler never fired (separate `startEmailCheck` transition).
2. **placeOrder cleared the cart** → action re-render swapped checkout to empty-cart state → wizard unmounted mid-payment (cart now cleared by `ClearCartOnPaid` on the confirmation page; cookie writes need an action — page-level write was illegal).
3. **pdfkit AFM data missing in standalone** — fixed via `serverExternalPackages: ["pdfkit"]` + `outputFileTracingIncludes` (verified in image).
4. Test-side fixes: free-shipping math expectation, strict-mode announcer collision, stale next-server kills (process renames itself — kill by port/PID).

**D5-pending verification (needs sandbox credentials):** live Stripe card + SCA/3DS2 + Apple/Google Pay (Payment Element code path exists, hidden without keys), Klarna SI coverage (`STRIPE_KLARNA_ENABLED` flag), live PayPal Smart Buttons (Orders v2 implemented, approval redirect untested), provider-side webhook registration + real signatures (PayPal currently shares the HMAC scheme — swap to verify-webhook-signature API), PSP dashboard reconciliation, SCA-failure card matrix, Klarna e2e, **reconcile PSP intent creation OUTSIDE the DB transaction when live credentials land** (comment in lib/orders/create.ts).

## Review-round 3 (review fixes, 2026-09-09)
- Reviewer-verified fixes committed: invoice PDF now carries the seller/company block (`buildInvoiceDataWithCompany`), `secure` cookie flag in production on consent/maintenance/koda/guest-cart cookies.
- MINOR #1: `variantIsPurchasable` guard (lib/cart/visibility.ts) — cart actions + hydration reject non-ACTIVE and hiddenDeal variants (deal-SKU cuid guessing). Unit + e2e (draft→button gone + action rejects; hiddenDeal→rejects).
- MINOR #2: `checkEmailExistsAction` behind fixed-window per-IP in-memory rate limit (lib/rate-limit.ts, 10/min, uniform response; Turnstile-elevation → Phase 9). Unit tests.
- MINOR #3: no refactor — comment in lib/orders/create.ts + D5-pending line above.
- Gates after fixes: lint ✓, unit 94/94 ✓, e2e 48/48 ✓.

## Review-boss findings

**3a built (scope items 1–4 + events); all gates green (2026-09-09).**

Test results:
- `lint`: green. `test`: 77/77 — promo matrix (bundle expansion, €44.99/€45.00 boundary, VAT exactness incl. shipping, empty, mixed), codec (round-trip/forge/wrong-secret/bad-shape→null), merge (5+5→5, sums, bundle cap 1), analytics event shapes.
- `test:e2e`: 42/42 — ATC from PDP/sticky/catalog card → badge; steppers (cap 5 + message, minus disabled at 1); remove → empty state; progress bar empty/in-progress (19,99 → "Samo še €26", 44 %) / reached (bundle, 100 %); bundle contents under line; cross-sell quick ATC; /koda store→pill→remove + invalid; merge-on-login (guest 2 lines → customer login → DB rows, cookie cleared, badge from DB); tamper (forged cookie → rejected, empty render).
- Seed ×2 idempotent (users 2, settings 10). Docker: fresh volume → 4 migrations, health + /cart 200, uid 1000. Audits PASS.

Bugs found & fixed in the loop:
1. **AUTH_URL trust (would have broken login in prod):** Auth.js v5 server-action `signIn` resolves absolute redirects against AUTH_URL (localhost:3000) — browser navigated to a dead origin → connection error. Fixed with `trustHost: true` in auth.config + AUTH_URL/NEXT_PUBLIC_SITE_URL set to the e2e origin in playwright.config env.
2. Guest-cart state doesn't persist across Playwright contexts — each cart test self-seeds via UI.
3. ATC click → immediate navigation aborted the Server Action mid-flight (same class as the CMP race) — tests now wait for "Dodano ✓".
4. /koda pill only renders with items — test seeds cart first.
5. Old Phase-2 test asserted disabled ATC — updated to live-ATC behavior.

Notes for 3b: /checkout 404 expected until then; koda cookie is a scaffold (no validation/discount); purchase event + order pipeline land with payments.
