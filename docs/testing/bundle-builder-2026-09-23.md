# Bundle builder (`/sestavi-paket`) — commit record, 2026-09-23

**Scope:** growth-phase work pulled forward by the owner's 2026-09-20 direction (spec §14.6 tags the build-your-own wizard `[P3-later]`; the offer ladder and "Paket & Prihrani" are Phase 8A in [GENERAL_PLAN.md](../GENERAL_PLAN.md) §Phase 8). Built in the 2026-09-20 session, left uncommitted, verified and committed on 2026-09-23. It is not a launch item and changes no go-live row.

## What it is

- **Storefront page `/sestavi-paket?izdelek=<slug>`** (`app/(storefront)/sestavi-paket/page.tsx`, `components/storefront/bundle/BundleBuilder.tsx`): one centred module — quantity offers of the product's own variant (1 / 2 / 3 units by default), optional add-on products, a live summary and one submit. The offers are **quantities of the existing variant**: no multipack SKUs, no new products, no `Bundle` row.
- **Pricing is a lookup, never a calculation** (`lib/bundle/quote.ts`, pure, `now` injected): every selectable combination is priced by the same engine the cart, the checkout quote and order creation use (`priceCartWithCoupon`, falling back to `priceCart` when the code is rejected) over the whole prospective cart, the shopper's existing lines included. The client renders the quote for the current selection; the discount share is floored from the engine's cents (AGENTS §8.23).
- **Submit is intent only** (`addBundleToCartAction` in `app/(storefront)/actions/cart.ts`): variant ids and units; caps, stock and visibility are re-read on the server; `ensureCartLines` (`lib/cart/server.ts`) raises each line to at least the selection in one write and never lowers a line, so a repeated submit is a no-op and a product the PDP already added is absorbed. A line stopped short by its cap is reported as `capped`, and a submit where the product itself did not land is not a success. The coupon named by the Setting is applied only when the shopper carries no code (one code per order).
- **PDP handoff**: a *clean* add from the buy box or the sticky bar continues to the builder (`nextHref`); a clamped or refused add still reports in place, as §8.23 requires. Bundle PDPs never hand off.
- **Configuration is data** (`bundle.builder` Setting: `enabled`, `offerUnits`, `addOnSlugs`, `couponCode`, `subscriptionRow`), declared in `lib/settings-schemas.ts`, read through `getBundleBuilder()` in `lib/settings.ts`, edited at `/admin/vsebina/paket` (actions gated by `requirePermission("content:manage")`; the disallowed roles are refused in `tests/unit/admin-cms-actions.test.ts`).
- **Migration 29** `20260920100000_bundle_builder_setting` inserts the row into an existing database with an **empty** `couponCode` (a deployed database has no demo coupon; a code the cart cannot apply would price a discount the order could not honour); the seed writes the same row with `PAKET20` and seeds that coupon (20 %, minimum spend the cheapest offer, no limits). `tests/unit/bundle-builder-seed.test.ts` keeps seed and migration in step.
- **Tokens:** `--radius-panel: 1.125rem` added to `app/globals.css` and AGENTS §8.6 (the builder's full-width panels; components take the token).
- Copy in `lib/copy/bundle.ts` and `lib/copy/admin.ts`; `GUEST_CART_MAX_LINES` names the cookie ceiling the writers respect.

## Gates run on this tree (2026-09-23)

| Gate | Result |
|---|---|
| `eslint . && tsc --noEmit` | clean |
| Vitest | **136 files / 1396 tests passed** (132 / 1343 at the 2026-09-19 review pass; the four new files carry 58 tests: `bundle-add-action` 15, `bundle-builder-copy` 19, `bundle-builder-quote` 17, `bundle-builder-seed` 7) |
| Fresh database `nasmeh_e2e_20260923` | `migrate deploy` applies **29** migrations; `migrate diff` against the schema: no difference; seed ×2 idempotent (identical counts after each run: Coupon 3, Setting 31, Product 5, Variant 5, Menu 7, ContentPage 6) |
| Browser, touched specs, standalone build on 4317 | `bundle-builder.spec.ts` 6/6, `cart.spec.ts` 9/9, `hooks.spec.ts` 6/6, `pdp.spec.ts` 7/7 — **28 passed in 42 s**, log `~/.nasmeh-tools/e2e-logs/bundle-commit-20260923.log` |
| Production-build navigation timing (same day, same tree) | click to new content 73–141 ms across six storefront navigations, first byte 103–133 ms on full loads; the builder page renders in ~100 ms server-side with 55 statements / 23 ms of database time |

**Not run for this commit:** the full browser suite, the Docker build and container smoke, Lighthouse. The change touches no layout, font, image or checkout bundle; the storefront chrome is unchanged. The next full acceptance run covers it. `docker-smoke.ps1` (session scratchpad) asserts the migration count and must read **29**.

> **Covered 2026-09-25** — [full acceptance run](full-acceptance-2026-09-25.md). The full suite found five stale Phase 3 fixtures (`phase3-checkout-quote.spec.ts`, `phase3-customer-acceptance.spec.ts`) that still waited for the in-place "Dodano ✓" the PDP handoff replaced; the add itself worked. Repaired in the test files, then 162 of 162 in the default mode and 162 of 162 with the policy enforced; Docker build and container smoke 19 of 19 at 29 migrations. Lighthouse not re-run, for the reason above.

## Notes and follow-ups

- The PDP handoff calls `router.push` and then `router.refresh()` so the header's cart badge is current on arrival; the refresh re-renders the page being left as well. One wasted server render per handoff, no visible delay — worth replacing with a targeted badge update when the cart chrome is next touched.
- The shop page `/trgovina` renders no `<h1>` (found while measuring; backlog **B24**). Not part of this change.
- The Setting's `addOnSlugs` is empty in the seed and the migration; the loader (`lib/bundle/load.ts`) then offers up to three in-stock, buildable products from the product's own collections, and an operator's list replaces that fallback.
