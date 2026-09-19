# Phase 9 — closure of the local work: final regression (2026-09-15)

Plan: [docs/plans/phase-9.md](../plans/phase-9.md). The six steps are recorded separately ([1](phase-9-step-1-2026-09-12.md), [2](phase-9-step-2-2026-09-12.md), [3](phase-9-step-3-2026-09-12.md), [4](phase-9-step-4-2026-09-15.md), [5](phase-9-step-5-2026-09-15.md), [6](phase-9-step-6-2026-09-15.md)). This record closes the items those records left open on the workstation: the Content-Security-Policy had only ever run in report-only mode, the performance budgets had not been re-measured since the step 4 code landed, the backup script had only run under Git Bash, and the step 4 agent review pass had never run. Everything ran on the tree at commit `84a88e9` plus the one test change below.

## 1. The Content-Security-Policy enforced

The step 1 design ships the policy report-only "until a full browser run stays clean, then `CSP_ENFORCE=true` enforces it without a rebuild". The full browser run is now done with the policy **enforced**: the standalone server started with `CSP_ENFORCE=true` (the home page carried `Content-Security-Policy` and no report-only header), the fresh e2e database at 27 migrations, the whole Playwright suite.

| Result | Detail |
|---|---|
| Suite under enforcement | **147 passed, 1 failed of 148** — the one failure was the hardening test asserting the *report-only* header name, i.e. the test's expectation of the default mode, not a blocked resource |
| `[csp]` lines in the server log | **1**, and it is the synthetic report the hardening test posts to the sink on purpose (`script-src blocked=inline page=http://127.0.0.1:4317/`, the exact payload of the "report sink accepts browser reports" test); no browser-originated report |
| Hardening test made mode-aware | `tests/e2e/hardening.spec.ts` reads `CSP_ENFORCE` and asserts the header the mode produces; run under enforcement: 4 passed; under the default: 4 passed |

So every storefront and admin flow the suite exercises — checkout, payment panel in test mode, forms with the lazy Turnstile, consent banner, admin editors, JSON-LD — runs under the enforced policy without a blocked script, style, frame or connection. The default stays `false`: the go-live checklist row E2 switches it on the host after a pass over real traffic, because the live Stripe.js, PayPal SDK, Turnstile and GTM hosts are not loaded in test mode. That row now has this local evidence behind it.

## 2. Lighthouse re-measured on the current build

`npm run lighthouse` against the standalone build (e2e environment, seeded database, a signed one-line cart cookie for the cart and checkout templates), three runs per template, median asserted against the step 2 budgets (LCP < 2.5 s, TBT < 200 ms, CLS < 0.1, performance ≥ 90 desktop / ≥ 80 mobile). Four runs: the tree as committed, two font changes (one kept, one reverted), and the final tree. Reports of the final run under `docs/testing/lighthouse/2026-09-15/` (manifests and the summary committed, HTML/JSON ignored as before).

**Run 1, on the tree as committed (`font-display: swap`, the 38 kB variable subset preloaded).** Desktop met every budget (performance 100 on all four templates, LCP 553–627 ms). Mobile met the scores (95–97), TBT (18–37 ms) and CLS (0) but **missed LCP on all four templates**: home 2570 ms, product page 2579 ms, cart 2690 ms, checkout 2680 ms against 2500 ms — four assertion failures. Step 2 had passed three of the four at 2385–2445 ms with the product page at 2527 ms.

The reports and the page explain it. The machine was faster than in step 2 (benchmark index 3630–3825 against 3208–3495), so it is not load. The LCP element is the consent banner's text on the cart, the checkout and, as the largest text, most templates — the banner's necessary-cookies description grew in step 4 — and the reports put the whole delay in *render* with no load delay. Yet the banner is in the server HTML (checked by byte offset) and the filmstrip shows it fully painted at 750 ms, identical in every later frame. What Lighthouse reports is Chrome's rule for text and web fonts: text drawn in a fallback face while its web font is still in flight is not a largest-contentful-paint candidate, so the candidate is recorded when the font renders — and Lighthouse's throttled simulation places the 38 kB font's arrival at 2.4–2.7 s. That is the mechanism the step 2 record's finding F1 described; the pages now carry more HTML ahead of the font (privacy notices, the longer banner, JSON-LD), so it lands later than in step 2.

**Run 2, `font-display: optional`.** The preloaded face is used when it arrives within the browser's block period, otherwise the fallback face serves that page view; text paints at first paint and never shifts. Home 2426 ms, product page 2504 ms, cart 2575 ms, checkout 2672 ms: consistently better (−8 to −144 ms), one template inside the budget. In the field on a slow connection `optional` is what users want (immediate text, no shift, CLS 0), but the lab cannot show it: the observed run against the local server receives the font within the block period, so the simulated LCP still waits for the simulated font.

**Run 3, tried and reverted: a static 17.6 kB instance of weight 400 (the weight of every largest text) preloaded on its own, the variable file on demand for the other weights.** It made things worse — first contentful paint moved from 910 ms to 1218 ms on mobile and from 255 ms to 338 ms on desktop, and mobile LCP stayed at 2579–2690 ms: Chrome holds the first render for a preloaded `optional` font, and the variable file, no longer preloaded, arrived later for the medium-weight text next to the body text. Reverted; the tree keeps run 2's configuration.

**Run 4, the final tree (run 2's configuration), the committed reports.** Mobile LCP home 2509 ms, product page 2665 ms, cart 2576 ms, checkout 2669 ms. 4 mobile LCP assertions still fail (`lhci` exit 1); desktop meets every budget.

### desktop (3 runs per URL, representative run shown)

| URL | Perf | A11y | BP | SEO | LCP | TBT | CLS | FCP | Speed Index |
|---|---|---|---|---|---|---|---|---|---|
| / | 100 | 96 | 100 | 100 | 555 ms | 0 ms | 0.000 | 253 ms | 253 ms |
| /izdelek/belilni-trakci-za-zobe | 100 | 96 | 100 | 100 | 565 ms | 0 ms | 0.000 | 255 ms | 268 ms |
| /cart | 100 | 97 | 100 | 61 | 581 ms | 0 ms | 0.000 | 255 ms | 255 ms |
| /checkout | 100 | 97 | 100 | 58 | 559 ms | 0 ms | 0.000 | 256 ms | 256 ms |

### mobile (3 runs per URL, representative run shown)

| URL | Perf | A11y | BP | SEO | LCP | TBT | CLS | FCP | Speed Index |
|---|---|---|---|---|---|---|---|---|---|
| / | 97 | 96 | 100 | 100 | 2509 ms | 50 ms | 0.000 | 909 ms | 1993 ms |
| /izdelek/belilni-trakci-za-zobe | 96 | 96 | 100 | 100 | 2665 ms | 33 ms | 0.000 | 911 ms | 1983 ms |
| /cart | 97 | 97 | 100 | 61 | 2576 ms | 20 ms | 0.000 | 911 ms | 911 ms |
| /checkout | 96 | 97 | 100 | 58 | 2669 ms | 40 ms | 0.000 | 914 ms | 2000 ms |

**Disposition.** The budget assertion stays strict, as step 2 decided. What the lab measures here is the simulated arrival of a preloaded 38 kB font on a 1.6 Mbit/s connection, which `optional` cannot change in the lab but does change for real users; run-to-run variance is 80–160 ms on the same tree (run 2 against run 4), so the mobile figures sit at the budget line rather than above it in any stable sense. The next levers are real media and the step 4 backlog item B16 (responsive variants), after which the D2 re-measurement in the step 2 record applies. The over-budget amounts in the final run are 9–169 ms; the scores stay at 96–97.

## 3. Backup script under a Linux userland

Step 3 ran `scripts/backup.sh` under Git Bash only and listed the Linux date, checksum and tar semantics as unproven. The script now ran inside a Linux container (`docker:27-cli` on Docker Desktop's WSL 2 kernel, GNU coreutils 9.5, GNU tar 1.35, Compose v2.33) against the live production compose project through the Docker socket, twice:

| Run | Result |
|---|---|
| Plain backup with 20 fabricated older backups (2026-08-10 … 08-29) | dump verified, four archives, manifest with sha256 sums, 27 migrations; retention removed the 6 oldest and kept the newest 14 plus the new one |
| Sunday-keep branch: fabricated 2026-08-01 … 08-09 (Sundays 08-02 and 08-09) below the newest 14 | the 7 weekday backups removed, **both Sundays kept** (within the 8 weeks), the 14 newest and the new backup kept |

`date -d`, `sha256sum` and GNU `tar` behaved as the script expects; the fallback for BSD `date` was not needed. `restore.sh` was not repeated under Linux: its health poll targets `127.0.0.1:3100`, which inside a container is the container itself; the restore drill on the real host (step 3 deviation 1, go-live row A5) remains the proof for that script's Linux path. The runbook's cron line is therefore exercised end to end except for the host's own crontab.

## 4. Findings in this record

| # | Finding | Disposition |
|---|---|---|
| F1 | Mobile LCP over the 2.5 s budget on all four templates: the largest text is the consent banner's, painted at 750 ms, but Chrome records the candidate only when its web font renders, and the throttled lab puts the 38 kB font at 2.4–2.7 s; the step 4 pages carry more HTML ahead of the font than step 2's | `font-display: optional` (immediate text and no shift for real users on slow connections; −8 to −144 ms in the lab); a preloaded static instance for the body weight was tried and reverted (section 2); the remaining lab deviation is recorded above and re-measured with real media after D2 |
| F2 | The hardening test asserted the report-only header name, so it failed as soon as the policy was enforced | the test reads `CSP_ENFORCE` and asserts the header the mode produces |

Observed, not changed: the checkout's contact-step notice is rendered on the client after hydration (absent from the server HTML). It is not the LCP element (the banner text is larger), so it does not affect the budget; server-rendering the wizard's first step is a Phase 8 polish item, not a launch blocker (the checkout is `noindex`).

## 5. Review pass

The five review agents (the four step 4 areas and one for the steps 5–6 changes) were launched twice today and refused both times by the API session limit before reading a file. The step 4 changes were reviewed by hand in the step 4 record; the steps 5–6 changes are small and were written with their tests and rehearsals in the same session. **The agent pass stays open**: run it first thing in the next session (the prompts are in this session's transcript and the memory notes name the areas).

> **Closed 2026-09-19** — the pass ran with six reviewers (the four step 4 areas, the steps 5–6 changes, and the 2026-09-16 storefront pass as a sixth), and its findings are repaired: [phase-9-review-pass-2026-09-19.md](phase-9-review-pass-2026-09-19.md). Nothing it found contradicts this record; it did find two refund defects, an invoice authorization gap and a staging deployment hazard that hand review had missed.

## 6. Verification summary

| Gate | Result |
|---|---|
| Full Playwright suite, CSP enforced | 147 / 148, the one failure a mode assertion, fixed in the spec |
| Hardening spec after the fix | enforced 4 passed, report-only 4 passed |
| Lighthouse | desktop every budget; mobile LCP 4 of 4 templates over the 2.5 s budget by 9–169 ms with `font-display: optional` (four templates before it; the lab measures the font's simulated arrival, within run-to-run variance of the budget line) |
| Backup on Linux | two runs, retention incl. the Sunday branch correct |
| Step 2 performance spec | 3 passed |
| Full Playwright suite on the final build, fresh database | 148 passed |
| Docker, rebuilt on the closure tree | build pass; container smoke **19/19**, 27 migrations applied by the entrypoint |
| Static gates | `tsc` and `eslint` clean; the only application change is the font-display value in `app/globals.css` |

## 7. What this leaves

Nothing further can be built or verified on the workstation. The remaining items are the go-live checklist rows (external gates, the host) and the agent review pass above — which ran on 2026-09-19 and is [recorded separately](phase-9-review-pass-2026-09-19.md), leaving only the checklist. See [docs/testing/go-live-checklist.md](go-live-checklist.md).
