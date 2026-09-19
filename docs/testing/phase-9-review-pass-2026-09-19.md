# Phase 9 — the agent review pass, and the repairs it found (2026-09-19)

The [closure record](phase-9-closure-2026-09-15.md) §5 left one local item open: the review pass over the step 4–6 changes never ran, refused twice in one day by the API session limit. This record closes it. The pass covered the four step 4 areas, the steps 5–6 deployment and bootstrap changes, and — as a sixth area — the [2026-09-16 storefront pass](ui-motion-and-hooks-2026-09-16.md), which was written after the closure and committed at the start of this session (`29c20b4`).

**Nothing in this pass was a blocker in production code.** Two defects would have cost real money on a real order, one would have let a staff account read buyer data it should not, one would have run staging on production's credentials, and two told a shopper something untrue. All are fixed.

## 1. How it ran

Three stages, because a review that only reads finds different things from one that also has to make the change compile.

1. **Six read-only reviewers**, one per area, each given the area's files, the grounding documents (AGENTS §8, the step record, the relevant legal-checklist sections) and an instruction to verify every finding end to end through callers and callees, to state the input or state that produces the wrong outcome, and to report a confidence level rather than speculate. They could not edit, build or run tests.
2. **Five fix agents**, one per cluster of files, with **disjoint file ownership** so they could run at once in one working tree. A fix needing a file another cluster owned was not made: it was reported, and I made it afterwards (§4). Each then **re-read its own diff** hunting for breakage it had introduced — changed signatures with un-updated callers, stale assertions, conventions broken — and fixed what it found.
3. **Me**, for the findings that fell between cluster boundaries, the refund work, and the four unit tests whose assertions the fixes made stale.

Ownership was the mechanism that made stage 2 safe, and it is also its cost: across the five clusters, fifteen items came back as "I could not finish this, the last file belongs to someone else" — a PDF caller, a copy key, a component prop, the twin of a repaired query on another page. Section 4 collects those, together with what I found myself while wiring them up.

## 2. What the reviewers found

Counts are findings *reported*; the disposition column says what happened after I read the code myself.

| Area | Reported | Disposition |
|---|---|---|
| Orders, invoice snapshots, customer mail | 6 | 3 should-fix (the two refund defects and the invoice authorization), 2 nits, 1 test gap — all fixed |
| Consent log, CMP, newsletter, back-in-stock | 7 | 4 should-fix, 3 nits — all fixed, the last two (§4 item 11 and the flag note below) after the cluster stage |
| GDPR rights, support, retention | 8 | 2 should-fix, 6 nits — 7 fixed, 1 deferred (B21) |
| Omnibus, pricing, CMS, claims | 6 | 2 should-fix, 4 nits — all fixed |
| Deployment, bootstrap, CSP, maintenance | 10 | 1 staging blocker, 5 should-fix, 4 nits — all fixed |
| Storefront motion and sales hooks | 12 | 4 should-fix, 8 nits — 10 fixed, 2 reported-only (a scroll-reveal edge case behind an operator section order, and the toast's keyboard reach) |

No reviewer found a defect in the money arithmetic, the VAT split, the order-number allocation, the consent write path, the GDPR export's coverage, the Omnibus reference-price rule or the CSP nonce plumbing. Each reviewer's "checked and found correct" list is long and specific; the ones worth keeping are folded into §6.

## 3. The defects that mattered

**A partial refund could book twice and close the order.** `lib/orders/refunds.ts` moved the money, then re-read the order and wrote `refundedCents + amount`. Stripe emits `charge.refunded` the moment the refund exists and reports a cumulative total; PayPal reports per event and the route's "known refund id" skip could not fire, because the id was only written in the step that had not run yet. If either webhook was processed inside that window, a 60 € refund on a 100 € order booked 120 €, clamped to the total, marked the order REFUNDED and cleared the pending-mail flags — and the remaining 40 € could never be refunded through the admin, because `planRefund` then answers `not_refundable`. The window is one short transaction wide, so it is rare; the outcome is a wrong order state and wrong books.

**A refund interrupted after the money moved stuck for ever.** The apply step restocks inside its transaction, and `adjustVariantStockInTx` throws `variant_not_found` for a component variant deleted since the order was placed — which the admin permits, because the deletion guard only refuses variants that are bundle members *now*, while the order line keeps the old id in its JSON snapshot. The transaction rolled back with the money already refunded at the provider, the row stayed PENDING, and from then on every refund or cancellation of that order answered `pending`. No admin or job path completed or failed such a row. The same end state followed any crash between the two steps.

**The fix** makes the three steps resumable. The apply step is now `applyRefundInTx`, idempotent: it re-reads the row under the order lock and does nothing unless it is still PENDING, so a webhook that raced it cannot double-count. The provider's refund id is stored *before* the apply, so a resumed run knows the money moved. `markRefunded` defers with a new `refund_in_flight` outcome while any Refund row for that order is PENDING, and the webhook is answered 409 so the provider retries it — by which time the row is COMPLETED or closed. `resolvePendingRefunds` finishes what is left: a row carrying a provider id is applied, a row without one, past a five-minute in-flight grace, is closed FAILED with a `refund_interrupted` timeline entry telling the operator to check with the provider. It runs in the daily job and before every new refund or cancellation of an order. A deleted component variant is now skipped and noted in the timeline (`restock_skipped`) instead of failing the refund. The refund row carries `finalStatus` (migration `20260918100000_phase9_refund_final_status`) so a cancellation resumed later still ends CANCELLED, not REFUNDED.

**Any staff account could download any buyer's invoice.** `racun.pdf` checked `isStaffRole` only — no permission, no enrolled second factor — so a staff member whom `/admin` itself redirects to the enrolment screen could fetch every invoice by order number: name, address, e-mail, frozen even after an erasure. The packing-slip route next to it already did it right. It now calls `requirePermission("orders:view")` and maps every refusal to 404.

**Staging would have run on production's environment file.** The runbook's staging command passes `--env-file .env.staging`, but that only supplies interpolation values; the service-level `env_file: .env` is a literal path. The staging container would have got the production origin, the production auth and job secrets, and the live Stripe and PayPal keys — so a "test checkout" on staging would have created real charges, and staging sign-in would have redirected to production. The step 5 rehearsal never ran this exact command (it layered env files through an extra compose file), and `launch-check.sh --staging` never checked the origin, so go-live row A8 would not have caught it. The container's env file is now selectable, the runbook command matches, and the staging check asserts the canonical and sitemap URLs carry the staging origin.

**Two things told a shopper something untrue.** An add at the per-line cap flashed green "Dodano", fired the analytics event and showed the confirmation card while the cart was unchanged — `addToCart` clamped silently and the action still answered ok. It now reports the units it really applied, in one statement that holds the row lock, and a capped add renders its own notice with no analytics push and no card. And a bundle's "prihranite X %" was computed from `Bundle.priceCents` while the card showed and the cart charged the bundle *variant's* price, which the product editor let the operator change on its own: editing 49,99 to 59,99 left "prihranite 33 %" next to a price whose true saving was 20 %. The line is now computed from the price actually charged, and the variant editor refuses a price edit on a bundle product, pointing at the bundle editor where both move together.

**The legal pages promised a seller block that no page rendered.** The terms section headed "Identifikacija prodajalca" and the privacy controller section both say the seller's details are "navedeni zgoraj"; the step 4 migration's own comments describe "the company block rendered above the body". No legal route imported `getCompany`, and `lib/copy/legal.ts` declared a `seller` block that only the confirmation mail used. The four legal routes now render it server-side from the company Setting, with an honest fallback while the Setting still holds seed placeholders, and the terms PDF attached to every order confirmation carries the same identity.

## 4. Fixes that crossed a cluster boundary

Made by me after the agents finished. Items 1 to 3 and 11 were reported by an agent that could not reach the file; the rest I found while wiring those up or reading the merged diff.

| # | Fix | Files |
|---|---|---|
| 1 | The legal-texts PDF's only caller now passes the seller, so the attachment carries the identity its own bodies point at | `lib/orders/confirmation-delivery.ts` |
| 2 | The bundle-price refusal got its Slovenian message and the editor page passes `isBundle`, so the price field is read-only on a bundle product | `lib/copy/admin.ts`, `components/admin/VariantEditor.tsx`, `app/admin/(shell)/izdelki/[id]/page.tsx` |
| 3 | The PDP's low-stock dot still carried the old utility class, which the new pseudo-element rule made inert — the dot had stopped pulsing there | `app/(storefront)/izdelek/[slug]/page.tsx` |
| 4 | The **order** list's name search had the same dead path as the customer list: a Prisma JSON filter renders a case-sensitive LIKE, so staff typing "Novak" never found "Janez Novak". One bounded ILIKE statement now feeds matching ids back into the ordinary filter | `lib/admin/orders.ts`, `tests/unit/admin-orders-customers-queries.test.ts` |
| 5 | Media files stayed fetchable by direct URL while the store was locked — the middleware matcher skips file-like paths — so a pre-launch store's packshots and campaign art were public | `app/uploads/[owner]/[ownerId]/[filename]/route.ts` |
| 6 | A payment arriving for an order whose buyer was erased no longer issues an invoice with a scrubbed buyer and queues a confirmation to nobody; it records the money as received and owed, like the post-cancellation case | `lib/orders/transitions.ts` |
| 7 | Four unit tests asserted the behaviour the fixes changed: the bundle percent now floors, the cart action reports its applied quantity, a repeat registration writes its consent row, an adverse report with an unmatched order number is recorded unlinked rather than refused | `tests/unit/catalog-hooks.test.ts`, `cart-backorder.test.ts`, `auth-actions.test.ts`, `contact-tickets.test.ts` |
| 8 | Two browser specs pinned text the fixes changed: the seeded marquee now says "od 45 €" (free shipping applies *at* the threshold, and it is a price claim), and the maintenance gate redirects rather than rewrites, so the URL does change | `tests/e2e/ssr.spec.ts`, `tests/e2e/chrome.spec.ts` |
| 9 | AGENTS §8.23 restated: the .2–.5 s rule is about interaction feedback, ambient and progress animations are the deliberate exception and say so at their declaration, a paint-only property is animated through a scaled pseudo-element, two savings claims never appear on one item, percentages floor, and a confirmation is only shown for something that happened | `AGENTS.md` |
| 10 | The 2026-09-16 record carried three statements that were wrong on the day; corrected in place with a note rather than rewritten | `ui-motion-and-hooks-2026-09-16.md` |
| 11 | `useAuthChallenge` waited for a Turnstile token for ever. With the script blocked — a content blocker, a network that refuses `challenges.cloudflare.com` — the submit button stayed disabled with nothing said, on pages a person may have no other route to: confirming a subscription, activating an account, sending an adverse-event report, signing in. After the same 15 s the capture forms already used, the wait now ends, the reason is announced and the button is live; the server still fails closed, so the attempt gets the form's own error rather than a dead control. Eleven forms inherit it from the hook | `components/storefront/auth/AuthChallenge.tsx` |

## 5. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean, on the tree with all five clusters applied |
| `eslint .` | clean |
| Vitest | **132 files, 1343 tests, all green** (1262 before the pass). The four stale assertions below failed first and were corrected to the new contract, never weakened |
| Fresh database | 28 migrations applied, `migrate diff` reports no drift against the schema, and two consecutive seeds leave identical row counts |
| New unit coverage | refund apply and resume (12 cases), the webhook deferral (3), the client-address key (6), the plain-text mail conversion (5), the capped add (5), the seller block (5), the bundle price guard (4), and 9 new cases for back-in-stock arming, whose action had no unit test at all before |
| Playwright, full suite | **156 passed of 156**, on the rebuilt tree against a fresh database. Two earlier runs each ended with a failure, both corrected rather than excused — see below |
| Docker build and container smoke | image rebuilt from the review tree (221 s); container smoke **19 of 19**, with the entrypoint applying all 28 migrations, both containers healthy, the app running as `node`, the four named volumes mounted and writable, the admin gate redirecting, the job route refusing without its secret and answering with six streams including the new `refundResolution` |
| Lighthouse | desktop meets every budget, performance 100 on all four templates; mobile 96–97 with the same four LCP assertion failures the closure established. Reports under `docs/testing/lighthouse/2026-09-19/`. See below |
| Playwright with `CSP_ENFORCE=true` | **156 of 156**, and exactly one `[csp]` line in the server log — the synthetic report the hardening test posts to its own sink on purpose, byte-identical to the closure run's. No browser-originated violation. This pass changed the middleware and made the global 404 render per request, so go-live row E2's local evidence is re-established on the current tree |

### Lighthouse against the 2026-09-16 run

Same protocol as before: the standalone build in the e2e environment, a signed one-line cart cookie regenerated for the new database, three runs per template, the median asserted. Desktop is unchanged — performance 100 everywhere, LCP 560–607 ms against 558–618 ms. Mobile keeps failing LCP on all four templates for the reason the closure record established and this pass did not touch: the largest text is counted only once its web font renders, and the throttled lab puts the 38 kB font at 2.5–2.7 s. `lhci` exits 1 as before.

| Mobile LCP, ms | 2026-09-16 | 2026-09-19 |
|---|---|---|
| / | 2592 | 2521 |
| /izdelek/belilni-trakci-za-zobe | 2576 | 2763 |
| /cart | 2592 | 2611 |
| /checkout | 2509 | 2522 |

Three templates sit within the 80–160 ms run-to-run spread the closure measured on an unchanged tree. The product page is 187 ms slower, at the edge of it; its Speed Index (2399 ms) lands between the two modes the closure recorded for that metric, which is the same font-arrival bimodality rather than a new cost.

**Total blocking time roughly doubled and is worth naming**: 55–79 ms against 18–46 ms, on a 200 ms budget it still clears with a wide margin. The client JavaScript this pass added is small and confined to the add-to-cart button's notice state and the split-out cart badge. It is recorded here so the D2 re-measurement with real media has a baseline to compare against, not because it threatens a budget.

**The two browser failures, and why only one was a defect in the tests.**

The first full run failed one test: the GDPR flow anonymises a customer whose fixture order is PAID, which the new guard refuses. That is the intended behaviour, so the spec now asserts *both* halves — the refusal while the order is open, and a successful erasure once it is settled — which is stronger coverage than it had.

The second run failed two *different* tests, `admin-settings` and `cmp`, both on the consent banner. Neither is a regression. `lib/rate-limit.ts` is an in-memory map in the server process, and under Playwright no proxy headers are present, so the whole suite shares one bucket: `consent:unknown`, 120 saves per 10 minutes. That run was the third against a server process that had been up through two earlier runs, and the bucket was exhausted. The failures are then exactly what the design prescribes: a consent **grant** over the limit is refused outright (`saveConsentAction` returns `ok: false`, the banner stays open) because a grant must never be stored without its log row, and a **refusal** still sets the cookie but writes no row. Restarting the server and re-running gave 156 of 156. **Protocol: restart the standalone server before every full browser run** — the limiters live in that process.

## 6. Worth keeping from the "found correct" lists

- The legal-acceptance and invoice snapshots are written in the same transaction as the order and the PAID transition respectively, and nothing rewrites them; the confirmation is at-least-once with a stable Message-ID and a lease, and all three PDFs are built before the send.
- `recordConsent` is the only write path (a unit test scans the tree for direct creates); the consent row is written before the cookie, a refusal is never blocked by a failed write, and the httpOnly consent id never reaches a client component.
- The Omnibus reference price is the lowest price in the 30 days before the announcement, anchored at the announcement and fixed while the reduction runs; the percentage is computed once and reused on every surface; a coupon price never renders as an Art. 6a reduction.
- The GDPR export covers every table holding the subject's data; anonymisation keeps what accounting law requires, survives the foreign keys, and can be run twice.
- Every `Variant.priceCents` write goes through the price-history helper in the same transaction. Seeds are idempotent. The guarded data migrations touch only unreviewed rows.
- The CSP nonce is fresh per request, JSON-LD is a data block that needs none, and the payment and challenge hosts are all in the directives.

## 7. What this leaves

Backlog items added, none blocking the launch:

| # | Gap | Fix in |
|---|---|---|
| B21 | The guest customer page and its export carry the e-mail in a GET query, so it reaches proxy access logs. Admin-only and behind the second factor; an opaque short-lived lookup id is the fix | post-launch |
| B22 | `deleteReviewPhotoAction` still unlinks after the database write with no retry path, and the retention sweep only looks at rejected reviews | post-launch, with B21 |
| B23 | The support-photo sweep deletes files older than a day that no attachment row names. The step 3 backup drill deliberately plants exactly such a file (its deviation 4); re-run the drill with that in mind | note on the next drill |

Reported and deliberately not changed: the newsletter and back-in-stock actions no longer re-send a verification mail for a repeat submit inside five minutes (a behaviour change for a legitimate shopper, and the point of the fix); the maintenance gate's allow-list remains a Server Action dispatch surface by design, which the runbook now states; the seeded hero row is still upserted, because the browser suite depends on a re-seed restoring a known hero.

**Two things this pass could not test, stated plainly.** The challenge-timeout fix (§4 item 11) cannot be exercised by the browser suite: the e2e environment supplies a test token, which makes the hook skip the widget entirely, so the suite proves only that the change leaves that path byte-identical. Its logic mirrors the lazy capture controller, which *is* unit-tested. And `NASMEH_E2E` has no boot guard: a host `.env` copied from the e2e environment would accept the fixed, repo-visible test token on every protected form and enable the test payment driver. A `NODE_ENV`-keyed refusal would break the e2e harness, which runs a production build with the flag on purpose. Go-live row A3 already checks for it (`grep -c NASMEH_E2E .env` = 0); that check is the mitigation, and it should stay on the checklist rather than become a boot refusal.

The launch still waits on exactly what it waited on before: the [go-live checklist](go-live-checklist.md), top to bottom. Nothing in this pass changed that list, and two of its rows now have fresher local evidence behind them: E2 (the policy enforced through a full browser run on this tree) and A8 (the staging origin, which `launch-check.sh --staging` now actually asserts).
