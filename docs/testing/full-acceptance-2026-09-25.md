# Full acceptance run on the bundle-builder tree — 2026-09-25

**Scope.** The [bundle-builder record](bundle-builder-2026-09-23.md) committed `5fe8a74` with its four touched browser specs and said the next full acceptance run would cover it. This is that run. It was made to answer the owner's question whether everything before the launch phase is done and tested, so it ran the whole gate set on `main` at `5fe8a74` as committed, found the full browser suite red on five stale fixtures, repaired the two spec files, and re-ran the suite in both policy modes. **No production code changed**; the diff is two test files, this record, the ledger and a pointer in the bundle-builder record.

Harness: the workstation of [GENERAL_PLAN.md §2.1](../GENERAL_PLAN.md) (portable Node 22, Postgres 16 on 5543, Mailpit, Docker Desktop), the standalone build made with the e2e environment, one server per browser run started fresh (the in-memory rate limits live in the server process, review-pass protocol), and a fresh database per full run.

## 1. First run, the tree as committed

| Gate | Result |
|---|---|
| `eslint . && tsc --noEmit` | clean |
| Vitest | **136 files / 1396 tests passed** (the bundle-builder record's count, reproduced) |
| Fresh database `nasmeh_e2e_20260925` | `migrate deploy` applies **29** migrations; `migrate diff` against the schema: no difference; seed ×2 idempotent (identical counts after each run: Coupon 3, Setting 31, Product 5, Variant 5, Menu 7, ContentPage 6) |
| Docker build and container smoke | `docker compose build` succeeds (`nasmeh-app:latest`, image `39ef5e29…`); smoke **19 of 19** on the production compose file: both containers healthy, `/api/health` with `"db":"up"` on Node 20, eight public routes 200 with the home SSR markers in the initial HTML, `/admin` anonymous → 307 to `/prijava?callbackUrl=%2Fadmin`, the daily job 401 without its secret and 200 with it answering all six streams plus the retention counters, the app running as `node`, the four named volumes mounted and writable, the entrypoint's `migrate deploy` at **29** migrations, restart policy `unless-stopped`; torn down with `down -v` |
| Playwright, full suite (default mode) | **157 passed, 5 failed of 162** in 4.9 min — section 2 |
| Lighthouse | not run: nothing since the 2026-09-19 measurement touched the storefront chrome, a layout, a font, an image or the checkout bundle (AGENTS §8.20), and the 2026-09-19 diagnosis shows a figure taken on a busy workstation is wrong |

## 2. The five failures: one cause, stale fixtures

Every failure is the same step: click "Dodaj v košarico" on a product page, then wait for the buy box's in-place "Dodano ✓" confirmation. Since the bundle builder, a **clean** add — the asked units landed, the builder enabled, the product not a bundle — hands the shopper on to `/sestavi-paket?izdelek=<slug>` instead (`AddToCartButton` `nextHref`: `router.push`, the button stays busy until the navigation commits). The page snapshots Playwright captured at the moment of failure show the builder rendered with the header badge at 1: the add landed and the handoff worked. The bundle-builder commit rewrote `pdp.spec.ts`, `cart.spec.ts` and `hooks.spec.ts` for this and ran those, but two Phase 3 files also add from the product page and were not in that run:

| Test | File |
|---|---|
| guest quote keeps shipping, TEST10, VAT and the accepted order in sync | `tests/e2e/phase3-checkout-quote.spec.ts`, through its `startCheckout` helper |
| a ticked checkout opt-in starts the newsletter double opt-in | same helper |
| a price changed after review requires explicit confirmation of a refreshed quote | same helper |
| adding the same item twice while signed in increments the stored quantity | `tests/e2e/phase3-customer-acceptance.spec.ts` |
| guest purchaser receives private confirmation, can verify an account, and keeps a new cart on revisit | `tests/e2e/phase3-customer-acceptance.spec.ts` (two adds) |

Every other file passed on this first run — `checkout.spec`, `cart.spec`, the 13 webhook-acceptance cases, the account, returns, tracking, CMP and admin suites — so the checkout path itself was not affected; only the button state the fixtures waited for was gone.

**Repair, test files only.** `startCheckout` and a new `addFromBuyBox` helper assert what now happens: the URL is the builder for the fixture's slug, the builder module for that slug is visible, and the header badge shows the units the cart holds. The repeat-add test asserts the badge climbing 1 → 2 across two handoffs (a one-unit repeat under the cap is a clean add and hands off again) before it checks the stored line. The private fixture products (unlisted, in no collection) render the builder with the product's own offers and no add-ons, which the re-run confirms. Nothing was weakened: the old assertion proved a button label; the new ones prove the navigation, the rendered builder and the cart count.

## 3. Re-runs after the repair

| Run | Database | Result |
|---|---|---|
| the two files alone | `nasmeh_e2e_20260925b` | **8 of 8** in 26 s |
| full suite, default mode (report-only policy) | `nasmeh_e2e_20260925c`, fresh; server started fresh | **162 of 162** in 5.0 min; the server log holds exactly one `[csp]` line, the synthetic report the hardening test posts to the sink on purpose (`script-src blocked=inline page=http://127.0.0.1:4317/`) |
| full suite, `CSP_ENFORCE=true` | `nasmeh_e2e_20260925d`, fresh; server started fresh; the home response carried `Content-Security-Policy` and no report-only header | **162 of 162** in 4.9 min; again exactly one `[csp]` line, the same synthetic report, no browser-originated violation |
| `eslint . && tsc --noEmit` over the tree with the edited specs | — | clean |

Go-live row E2's local evidence therefore stands on the bundle-builder tree; the previous evidence came from the review-pass tree, before `/sestavi-paket` and its client module existed.

## 4. What this run does not change

- **The launch gates.** D4, D5/G1, D2, G2, G4 and the host (G3) are what they were: rows of the [go-live checklist](go-live-checklist.md). Payments have still never run against a real Stripe or PayPal sandbox (the [sandbox checklist](phase-3-sandbox-checklist.md) is not executed); Klarna eligibility for Slovenia is undecided.
- **Lighthouse.** Last measured on 2026-09-19 (desktop every budget; mobile LCP on the budget line, seven-run median configured since). Not re-run here.
- **Open pre-launch code items.** B24 (`/trgovina` without an `<h1>`, small) and B8 (Turnstile elevation of the checkout e-mail check, tied to D5) stay open in the [backlog](../GENERAL_PLAN.md#6-known-gap-backlog-code-analysis-2026-09-09).
- **The rule this run illustrates** (GENERAL_PLAN rule 11): a commit that runs only its touched specs is not covered until the next full run, and a behaviour change on a shared surface (the product page's add) can leave fixtures elsewhere stale. The bundle-builder record said so; this run is the one it deferred to.

Harness note: `run-e2e.ps1` writes its logs through `Tee-Object`, so they are UTF-16; the per-file tallies above were read with PowerShell, not `grep`.
