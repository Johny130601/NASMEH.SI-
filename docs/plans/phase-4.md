# Phase 4 — Promotions engine

**Date:** 2026-09-09 · **Status:** in progress · **Scope source:** `docs/GENERAL_PLAN.md` lines 169–191, spec §9/§7.2/§8.2/§14.4, AGENTS §5.3/§8.4

## Goal
Coupon system end-to-end (admin data → PURE engine → storefront), welcome popup, data-driven cross-sell curation. **NOT built ([P2]):** BXGY, GWP, automatic discounts, bulk unique codes, sale mode, campaign presets, deal-SKU ladder, buy-now deep links — enums/fields reserved, ZERO runtime logic.

## Schema (`phase4_promotions`)
- CouponType += `FIXED_PRODUCT` (BXGY stays reserved-only).
- `CouponRedemption`(couponId FK idx, email, orderId **unique**, createdAt) — per-customer limit + idempotency (one redemption per order).
- Order += `couponCode String?`, `couponSnapshot Json?` ({code,type,percentOff,amountOffCents,discountCents}).
- Seed: coupons TEST10 (10 % PERCENT, no limits) + WELCOME10 (10 %, usageLimitPerCustomer 1); Setting `welcomePopup` {active, delaySeconds 55, couponCode WELCOME10, title/body/cta/thankYou (SI copy as data)}.

## lib/promo extension (PURE, `now` injected, zero I/O)
- `coupons.ts`: `CouponInput` (typed, db-shaped), `evaluateCoupon(coupon, lines, ctx{email, hasCodeAlready}, now)` → `{ ok, rejection? } | { ok, lineDiscountCents, orderDiscountCents, freeShipping }`; rejections: not_found/inactive/not_started/expired/min_spend/usage_limit/customer_limit/not_eligible/already_applied.
- TERMS (hard rules): discount base EXCLUDES bundle lines + compareAt-discounted lines; shipping excluded from % math; min spend = cart subtotal pre-discount; no stacking (already_applied).
- `priceCartWithCoupon(lines, settings, coupon, ctx, now)` — deterministic order: line discounts (FIXED_PRODUCT/PERCENT) → order discount (FIXED, capped) → free shipping flag → threshold re-check (discounted subtotal can LOSE free shipping) → totals/VAT recompute. Adds `discountCents`, `appliedCoupon` to PricedCart.
- `resolve.ts` (I/O boundary): code → CouponInput + per-customer usage count.

### Unit matrix (tests/unit/promo-coupons.test.ts)
1. PERCENT 10 % on 10000 → 1000. 2. PERCENT bundle line excluded from base. 3. PERCENT compareAt line excluded. 4. FIXED cart 500 on 3499 → 500. 5. FIXED capped at base (500 on 300 → 300). 6. FIXED_PRODUCT 500 on eligible 1999 line only. 7. FREE_SHIPPING flips shipping to 0 under threshold. 8. min_spend rejection. 9. eligible product list scopes discount. 10. collection eligibility scopes. 11. email eligibility → not_eligible for others. 12. excluded product skipped. 13. not_started/expired/inside window. 14. inactive. 15. usage_limit exhausted. 16. customer_limit exhausted. 17. second code → already_applied. 18. discount drops subtotal below threshold → shipping charged again (re-check). 19. free-shipping code wins over threshold loss. 20. totals always recompute (total = subtotal − discount + shipping; VAT on total).

## Storefront
- `/koda/[code]` end-to-end: format+existence validation → cookie → /cart; invalid → /cart?koda=neveljavna.
- Cart summary: code pill shows −X %/€ + terms sentence (promo.terms copy) + rejection errors (never breaks cart) + remove restores totals (server recompute).
- Checkout summary rail: discount line; **DiscountField** (apply/remove, inline errors per rejection) — same cookie contract.
- `placeOrder`: server re-evaluates (source of truth); ok → couponCode+snapshot+discountCents on Order, `CouponRedemption` (orderId unique) + usedCount increment IN tx; rejected → order placed WITHOUT discount + `couponRejected` flag to UI. Confirmation shows discount line.

## Welcome popup (§9.3)
- `WelcomePopup` (client, mounted in storefront layout): Setting-driven (active/delay/copy/coupon code); suppression: pathname ∈ {/cart,/checkout,/racun}, session flag (once-interacted-per-session), known subscriber (server prop from session email → Subscriber CONFIRMED); bottom sheet mobile / centered desktop (UiModal pattern); submit → Phase 1 `subscribeNewsletterAction` → thank-you state → `applyKodaAction` auto-stores code (visible in checkout/cart) + terms sentence.

## Curation (documented choice)
Per-product `customFields.crossSell` (exists since P2) is THE curation source for PDP (already) AND cart shelf: union of in-cart products' crossSell slugs minus in-cart; fallback to catalog order when empty. No rule engine (P2).

## e2e (promo.spec.ts)
/koda/TEST10 → cart discounted + terms → checkout → order persists snapshot (couponCode, discountCents) + email totals; remove restores; total-limit exhaustion blocks next order's discount; threshold change in DB updates bar copy; popup (delaySeconds 1 via DB): appears on /, absent on /cart /checkout /racun, dismiss → not again, thank-you stores code in checkout, double opt-in email; cart shelf follows crossSell data.

## Gates
lint, unit (matrix above + prior 94), e2e, seed×2, docker smoke; review pass: no [P2] logic leaked.

## Review-boss findings

**Built scope 1–7; NO [P2] logic (BXGY/GWP/automatic/bulk/sale-mode reserved enums only). All gates green (2026-09-09).**

Test results:
- `lint`: green. `test`: 118/118 — full coupon matrix (all 20 enumerated cases incl. terms exclusions, threshold re-check, exact VAT recompute) + prior suites.
- `test:e2e`: 55/55 — /koda/TEST10 → discounted cart + terms → order snapshot (couponCode/type/discountCents 350, exact totals 3539/VAT 638, redemption row, email totals); remove restores (38,89); FAKE99 invalid state; LIMIT1 exhaustion blocks next order's discount (order placed, 0 discount); threshold 10000→"€81" / 2500→"€6" propagation; popup (appears, suppressed on /cart /checkout /racun, dismiss-persists, thank-you stores WELCOME10 visible in cart + DOI email); cart shelf follows crossSell curation.
- Seed ×2 idempotent. Docker: fresh volume → 7 migrations, health 200, /koda 307, uid 1000. Audits PASS.

Bugs found & fixed in the loop:
1. Duplicate input `id="email"` (footer + popup UiInput) broke label resolution — popup input now has explicit unique id; spec selectors scoped.
2. sessionStorage survives `clearCookies` — popup thank-you flow uses a fresh browser context; CMP dismissed there too.
3. Old Phase-3 scaffold assertions updated (code is live; terms sentence shown).
4. Empty-state progress copy had a hardcoded "45 €" — now Setting-threshold formatted (propagation test depends on it).
5. `CouponInput.type` maps reserved BXGY → PERCENT defensively at the resolve boundary (no BXGY logic anywhere).

Extension points left for [P2] (review-verified): CouponInput/LineProductInfo accept rule data; Promotion/FreeGiftRule models untouched; BXGY enum value present with zero runtime branches.

## Review notes (2026-09-09)
- **Usage-at-creation design (documented, no behavior change):** coupon usage increments when the ORDER IS CREATED (PENDING), not when paid. A failed/abandoned payment therefore consumes limited-code usage. Rationale: the spec mandates transactional increment at order creation (GENERAL_PLAN Phase 4 scope 2) and it prevents parallel-session double-spend of single-use codes. The alternative (increment on `paid`) lets the same limited code attach to many pending orders. For the Phase 7 admin coupon form, the note text ships as `promo.adminNotes.usageAtCreation` in lib/copy/promo.ts: *"Omejene kode se porabijo ob ustvaritvi naročila, tudi če plačilo ni uspešno."*
- Popup dismiss aria-label now `promo.popup.closeLabel` ("Zapri obvestilo").
- Stale-cookie masking: on rejection, `StaleKodaClear` (client, action call — cookie writes are illegal during render) clears the stored code so the next attempt evaluates its own error state.
- `percentOff` guard at resolve boundary (`isValidPercentOff`, out-of-range → inactive) until the Phase 7 admin form validates input.

Deferrals: rule-based upsell engine, GWP, BXGY, bulk codes, sale mode, campaign presets, deal-SKU ladder, buy-now links → Phase 8.
