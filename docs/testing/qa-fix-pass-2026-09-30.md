# QA fix pass (2026-09-29 → 2026-09-30)

**Scope:** fix every finding of the [exploratory QA pass of 2026-09-29](exploratory-qa-2026-09-29.md), prove each fix in a real browser against the rebuilt production server, and keep fixing what the verification itself turned up until a round came back clean. Tree: `main` at `8059d02` plus the uncommitted changes this record describes (committed with it).

**Result:**
- Every finding of the exploratory record is **fixed and verified in the browser**, with three exceptions:
  - one needs an owner/legal decision (durable popup suppression across sessions for a subscribed guest, see "Open");
  - one cannot be checked locally: the checkout Klarna recap needs `STRIPE_KLARNA_ENABLED=true` with Stripe keys, gate G1;
  - the deviations the record already listed as owner decisions.
- The verification rounds found **22 more defects** beyond the original list (17 in round 1, 5 in round 2), and the final round found 2 more; all are fixed.
- **Final gates on the final tree (2026-10-01):**
  - `tsc` and `eslint` clean.
  - Vitest **163 files / 1704 tests**.
  - Fresh database at **31 migrations**, no drift, seed idempotent.
  - Production build.
  - Playwright **192 of 192** in both CSP modes, one synthetic `[csp]` report each (the hardening test's own).
  - Docker build and container smoke **19 of 19** on the final tree (image `1066f4b9531c`, rebuilt after the copy-import codemod with `next build` run fresh in the container; the tree before the codemod had also passed 19 of 19).
  - Lighthouse: desktop meets every budget (score 100, LCP 523–598 ms). Mobile scores 95–98. The home page's mobile LCP passes (2.38 s); the product page, cart and checkout stay on the line where they were before this pass. See "Performance".

## How it was run

**1. Fix round 1.**
- Four fix agents, one per area, over disjoint file-ownership lists:
  - catalog, product pages, search and bundles;
  - cart, checkout, account and sign-in;
  - admin operations and admin catalog;
  - support, e-mail, chrome, home and CMS.
- The lead took the security and data items and the shared files: the HTML sanitizer, `app/globals.css`, `lib/seo.ts`, the maintenance cookie, CMS page routes, migrations and seeds.
- A usage limit cut the first agents off twice. A workflow then completed each area from the on-disk partial state.
- Two independent reviewers checked each area (correctness/regression, and spec/finding coverage), and a fix-up agent per area applied the confirmed review items.
- The lead then did the cross-area requests the agents could not (items 1–11 under "Lead changes").

**2. Browser verification 1.**
- Four fresh servers (same build, own database each). Four verifier agents re-ran every finding's original reproduction and a regression sweep of their area.
- Every negative verdict and every new issue went to an independent confirmer that reproduced it from scratch and read the code.
- Result: 100 fixed, 4 partial, 1 not verifiable, plus 13 new issues. All 17 negatives were confirmed real.

**3. Fix round 2.**
- Four agents over new disjoint file sets for the 17 confirmed items, then a reviewer and a fix-up each. The lead fixed the seeded stock claim.
- The full browser suite then exposed a pre-existing accessibility defect: the footer newsletter field had `id="email"`, which duplicated the sign-in, registration, password-reset and `/sledi` fields, so its label named the wrong input. The field got its own id and the distinct label "E-pošta za novice". A regression test now checks 17 pages for duplicate ids. The browser specs that had silently relied on the broken label association now use exact label matches.

**4. Browser verification 2.** Three fresh servers: 18/18 items fixed and 5 new minor or cosmetic issues, all confirmed. The lead fixed them.

**5. Browser verification 3.** One fresh server: 5/5 fixed and 2 new issues, both confirmed and fixed by the lead:
- a cart with only sold-out lines said "Dostava: Brezplačna";
- plain-text mail parts dropped link targets (pre-existing).

## What changed (by finding)

### Security and data (fix before launch)
| ID | Fix | Proof |
|---|---|---|
| S1 stored XSS | New `lib/security/html-sanitizer.ts`: one allow-list parser with two policies. The e-mail policy is unchanged. The new content policy allows no script, no embedded documents, no `class`/`style`/`id`, and same-site or `https` links only. CMS page bodies and product HTML are sanitized on save **and** on render; operator content is styled only by `.content-prose`. AGENTS §8.24 added. | `tests/unit/html-sanitizer.test.ts` (every seeded legal page round-trips unchanged, so `reviewed` is never cleared by a no-op save). Browser: the payload saved through `/admin/strani` and the product editor rendered inert on the storefront and in the admin preview, and SQL-injected raw payloads render inert too. |
| S2 CSV injection | Cells starting with `= + - @` tab or CR are prefixed with an apostrophe; amounts are plain decimal-comma numbers; dates are Europe/Ljubljana. | Unit tests; browser export of `=HYPERLINK(…)`, `+1`, `-1`, `@x` names. |
| D1 anonymisation | The timeline is appended through `lib/orders/timeline.ts`, never replaced. Notes quoting the person's name or phone are scrubbed too. | Unit tests; browser: the order timeline stays an array with all earlier entries. |

### Majors
| ID | Fix |
|---|---|
| M1 | Every 0-byte file part is skipped (`lib/form-files.ts`) in the review, contact, adverse and returns uploads. A review without a photo is accepted. |
| M2 | The confirmation mail shows the discount (code and amount) and the VAT line, so the lines add up; the text part keeps one line per row. |
| M3 | Refund-required orders: the detail page offers the refund of the captured amount through `lib/orders/refunds.ts`; the flag and the banner clear. |
| M4 | `/trgovina` is driven by the Collection records: tabs, banners (desktop/mobile), hide-text, SEO title/description, noindex, canonical and a live `<h1>`. The placeholder banners lost their baked text. |
| M5/M6/M7 | A shared `PURCHASABLE_PRODUCT_WHERE` rule and `lib/bundle/availability.ts`: an inactive bundle, a hidden deal SKU or a bundle whose components cannot fill it is not listed, searched, mapped or sold, and its page answers 404 or sold out. A component's restock now re-arms the bundle's back-in-stock subscriptions (`lib/inventory/stock.ts`), so a sold-out bundle honestly offers "Obvestite me". The alert job re-checks availability by components. |
| M8 | Search reads only human text (title, description, custom-field text), never slugs or JSON keys; title matches rank first. |
| M9 | `sm:`/`xl:` (not defined in this project) replaced by `md:`/`lg:` everywhere; admin tables keep tokens unbroken and scroll inside their cards. |
| M10 | Customer and admin status wording agree: PENDING "Čaka na plačilo". The admin has its own pill. An unpaid order offers "Dokončaj plačilo" on a pay-first confirmation page. |
| M11/M12 | Checkout validation mirrors the server per field and never dead-ends. A signed-in checkout starts from the default address and offers the address book. |
| M13 | The media library accepts MP4/WebM (magic-byte check). `/uploads/*` serves each file's own type with byte ranges (206), so the hero video plays on iOS. |
| M14 | Success cards, and `/sledi` results and errors, are brought into view and focused. |
| M15 | An adverse report's claimed order number reaches the compliance mail and the ticket page. |
| M16 | The utility menu renders. Footer titles come from the menu name. Featured cards are validated with the purchasable rule and show the count the hint promises. |

### Minor and cosmetic
All items of the exploratory record's minor list are fixed; the per-ID evidence is in the verification results (scratchpad `verify-results.json`, `verify2-results.json`, `verify3-results.json`). The notable ones:
- SEO: sign-in returns to the requested page; the home `<title>` and description; the default OG image is now a 1200×628 PNG; the SEO default description applies.
- Accessibility: the sort menu closes; search, "Obvestite me" and the welcome popup trap and return focus and the popup closes on Esc; the 404 countdown can be stopped; rating stars read "Ocena 3,5 od 5".
- Checkout: the cart cap notice states the real cap; free methods show free; the Klarna recap exists in code.
- Accounts: name and password can be changed in `/racun/podatki`; the login limit counts only failures, per address and per client, with a global ceiling.
- Motion: box-shadow, `left`/`top` and 700 ms transitions are gone (AGENTS §8.23); the card lift and button press now ease.
- Support: adverse future dates are refused; errors name the field; `/kontakt` order lookup is rate-limited; staff dates read "D. M. YYYY".
- Maintenance: the unlock cookie is bound to the password hash and its issue time, so changing the password revokes old unlocks.
- Links: the footer "Paketi" and the marquee link moved (migration 30).

### Found by the verification rounds and fixed
- **Cart and checkout:**
  - a line that sells out while in the cart is flagged: `+` is disabled and checkout is blocked at step 1 naming the line; the totals, free-shipping bar and code count only buyable lines;
  - "Vnesite nov naslov" clears the address;
  - a long e-mail no longer widens the phone checkout.
- **Admin:**
  - consent history in words;
  - admin tables at 1440/1280/991/768;
  - the chart's max label stays inside the chart;
  - the ticket page hides the privacy fingerprint;
  - the "Nov izdelek" slug error names the field;
  - the hidden-deal label says what it does.
- **Content and links:**
  - operator links to unavailable products are dropped at render time, and menu, home and bundle saves warn;
  - the seeded "Trenutno razprodano" copy and "RAZPRODANO" badge are gone (migration 31; stock state is computed, never typed);
  - the withdrawal ticket date is Slovenian;
  - a footer sign-up or a newsletter confirmation suppresses the welcome popup for the session.
- **Accessibility:** the `/cart?koda=…` notice leaves the router's address; the duplicate `email` id and the footer label (see above).
- **Mail:** plain-text parts keep their structure and link targets.

## Lead changes outside the agents' areas
1. The sanitizer and its use in `[slug]`, `strani` save and preview (S1); AGENTS §8.24.
2. `@layer base` for element defaults. Before this, headings ignored `text-white`/`font-semibold` utilities (T1-02). `.content-prose` now styles links, lists, tables and images.
3. `lib/seo.ts`: a description only when given (T7-F7); `/og-default.png`.
4. Maintenance cookie `issued.hmac(secret, password hash, issued)` with a server-side 24 h age check (T7-F10).
5. Header featured cards use `PURCHASABLE_PRODUCT_WHERE`; the timeline provider label is the order's own (C2-F18); `/kontakt` status words reuse `account.statuses`; staff mail dates go through `lib/support/detail-format.ts`; `/uploads/*` has byte ranges.
6. Bundle restock arming (`armBundleAlerts`) plus the job re-check; the dead `restockAlert` plumbing is removed.
7. Migrations:
   - `20260930100000_qa_storefront_links` (footer "Paketi", marquee);
   - `20260930110000_qa_seed_stock_claims` (travel strips copy and badge).
   Both are guarded by the exact old seed value. The upgrade path was checked on databases holding the old values (before and after, then a re-run with 0 rows changed), and unit tests keep seed and migration in step.
8. `next.config.ts` `outputFileTracingExcludes` for the three media volumes. File tracing had copied whatever sat in `review-uploads`/`support-uploads` into `.next/standalone`, which is private customer photos on a non-Docker build host. Next 15.5 applies the exclude only on POSIX paths, so on Windows build with the directories empty (the Docker context excludes them).
9. Footer newsletter id and label; the duplicate-id regression test.
10. The all-sold-out cart shipping row ("—") and link targets in plain-text mails.

## Gates (final tree, 2026-10-01)
| Gate | Result |
|---|---|
| `tsc --noEmit`, `eslint .` | clean |
| Vitest | 163 files / 1704 tests passed |
| Fresh database | 31 migrations applied, `migrate diff` no difference, seed ×2 identical counts |
| Playwright, `CSP_ENFORCE` unset | 192 / 192 (database `nasmeh_e2e_20261001`), 1 synthetic `[csp]` line |
| Playwright, `CSP_ENFORCE=true` | 192 / 192 (same database, fresh server process), 1 synthetic `[csp]` line |
| Docker build + container smoke | **19 / 19** on the final tree (image `1066f4b9531c`, built 2026-10-01 after the copy-import codemod): containers healthy, 31 migrations applied in the entrypoint, six job streams, uid 1000, four named volumes writable, restart policy. The first post-codemod rebuild had been stopped for low memory; it passed when run with nothing else open (WSL down, then Docker Desktop alone) |
| Lighthouse | [2026-10-01](lighthouse/2026-10-01/summary.md). **Desktop:** every budget met, performance 100, LCP 523–598 ms. **Mobile:** performance 95–98, CLS 0, TBT 25–84 ms. Mobile LCP (representative run) is 2377 ms on `/`, which is under budget; 2550 ms on the PDP, 2514 ms on `/cart` and 2660 ms on `/checkout`, which are over. `lhci` exits 1 on those three, as it has since 2026-09-15. See "Performance". |

The browser suite grew from 162 to 192 tests; the unit suite grew from 136 files / 1396 tests.

## Performance: a regression found by the fence, and fixed

The first Lighthouse run of the fixed tree (2026-09-30) kept desktop at 100, but mobile LCP had moved up. To separate this pass from run-to-run noise, the last commit (`8059d02`) was built in a separate worktree and both trees were measured back to back: same machine, same database, same cart cookie, 7 mobile runs per template. The medians below are over clean runs only; runs with an observed LCP above 500 ms are discarded, as the stall rule in `scripts/lighthouse/base.cjs` prescribes.

| Mobile LCP, clean median | `8059d02` | fixed tree, before | fixed tree, final |
|---|---|---|---|
| `/` | 2514 ms | 2592 ms | **2445 ms** |
| PDP | 2513 ms | 2668 ms | **2448 ms** |
| `/cart` | 2519 ms | 2612 ms | **2514 ms** |
| `/checkout` | 2515 ms | 2662 ms | **2514 ms** |

**Cause.** This pass added copy text, mostly admin and support messages. Every client component imported it through the `@/lib/copy` barrel, which webpack cannot tree-shake, so all of the Slovenian copy, admin screens included, sat in a chunk every storefront page loads. That chunk grew from 28.8 to 33.2 kB gzipped. The 2026-09-19 diagnosis established that mobile LCP here tracks script evaluation, so the page got slower.

**Fix.** A codemod (91 files) switched every client-reachable file to per-module imports (`@/lib/copy/cart`, …). First-load JS dropped below the last commit:

| Page | `8059d02` | before the fix | final |
|---|---|---|---|
| `/` | 144 kB | 150 kB | 118 kB |
| PDP | 146 kB | 152 kB | 121 kB |
| `/cart` | 146 kB | 151 kB | 121 kB |
| `/checkout` | 147 kB | 154 kB | 125 kB |

AGENTS §8.5 now states the rule, and `tests/unit/copy-imports.test.ts` enforces it.

**Outcome.** The mobile home page passes its LCP budget for the first time since the 2026-09-15 closure. The other three templates are back at the last commit's level, about 15 ms over the budget line on clean runs. The run-to-run stalls this workstation shows can still push a 7-run median past it.

## Open

**Local gates:** none left open; the Docker rebuild on the final tree passed 19 of 19 on 2026-10-01. On this workstation, build images with nothing else open: shut down WSL first (`wsl --shutdown`), then start Docker Desktop alone.

**Owner decisions (not defects)**
- **Durable popup suppression.** A guest who subscribed sees the welcome popup again in a new browser session. Remembering it needs a new persistent first-party cookie, which needs a row in the cookie table and legal review (R-CK-01). Within a session it is suppressed.
- **Klarna recap.** It is in the code but needs Klarna enabled with Stripe keys (gate G1) to be seen.
- **Recorded deviations from the spec, kept:**
  - no product template picker or drag-sort;
  - home section order uses up/down buttons;
  - shipping has one global threshold and flat prices;
  - there are no payment-failed or welcome mails;
  - there are no bulk order actions.
- **Accountant question.** The invoice has no supply date (ZDDV-1 Art. 82) and prints the country as "SI".

## Environment notes
- **Local test environment:** the test payment driver and the Turnstile test token; Mailpit; Postgres 16 on 5543. Real Stripe, PayPal and Turnstile remain gate G1.
- **QA databases:** `nasmeh_qa_*`, `nasmeh_vf*` and `nasmeh_e2e_20260930*` are disposable.
- **Media moved aside:** the QA runs' uploaded test photos were moved out of the project media directories to the session scratchpad before each build (see item 8 above).
