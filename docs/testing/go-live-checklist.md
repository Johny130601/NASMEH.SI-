# Go-live checklist and launch sign-off — Phase 9 step 6

**Date:** 2026-09-15 (prepared). **Status: nothing below is done.** Every evidence cell is blank on purpose; the store goes live when every row of sections A–E has evidence and the sign-off block is filled.

Plan: [docs/plans/phase-9.md](../plans/phase-9.md) step 6 design; the gates are named as in [GENERAL_PLAN.md §4](../GENERAL_PLAN.md) (D2 media, D4 legal sign-off, D5 payment credentials, G1 real-provider acceptance, G2 mailboxes, G3 host cron, G4 company data). The host procedure is the runbook's [Host](../RUNBOOK.md#host) section; `scripts/launch-check.sh <origin>` produces the HTTP evidence for the rows marked *launch-check* in one run (exit code = failures; attach its output to the sign-off).

**How to fill a row.** Evidence is something a second person can re-check: a command and its output, a screenshot path, a provider dashboard reference, a commit hash or the checklist row of the document that carries the sign-off. Unfilled rows block the launch; a row can be marked *not applicable* with a reason (Klarna without SI coverage, for instance).

## A. Host and operations (G3)

| # | Item | How to verify | Evidence | Done by, date |
|---|---|---|---|---|
| A1 | DNS for `nasmeh.si` (and `staging.nasmeh.si`) points at the host; certificates issued and renewing at the proxy | `curl -sSI https://nasmeh.si/api/health` shows the certificate chain (`curl -v`) and `Strict-Transport-Security` | | |
| A2 | Production project up from the tagged release with the proxy file; `IMAGE_TAG` in `.env` names the release | `docker compose -f docker-compose.yml ps` healthy; `docker inspect nasmeh-app-1 --format '{{.Config.Image}}'` = `nasmeh-app:<tag>`; `git rev-parse --short HEAD` = the tag | | |
| A3 | Host `.env` complete (runbook table): public origin, secrets, live keys, `CSP_ENFORCE`, no test flags | review of `.env` against the table; `grep -c NASMEH_E2E .env` = 0 | | |
| A4 | First start done: owner signed in, second factor enrolled, `SEED_ADMIN_PASSWORD` removed from `.env` | app log `[bootstrap] OWNER account created`; `grep SEED_ADMIN_PASSWORD .env` empty; `/admin/ekipa` shows the owner with the second factor | | |
| A5 | Backups: cron line installed, one run on the host, one restore drill on the host | `ls /srv/backups/nasmeh/` shows a dated directory with `manifest.txt`; restore drill output (runbook) | | |
| A6 | Daily job cron installed on the loopback URL and seen once in the log | crontab entry; `/var/log/nasmeh-jobs.log` with a 200 and the six stream counters | | |
| A7 | Uptime checker on `/api/health` with the keyword rule and a working alert route | the checker's page; one forced alert (stop `db`, wait for the page, start `db`) | | |
| A8 | Staging on `staging.nasmeh.si`: maintenance on, indexing off, own secrets | `scripts/launch-check.sh https://staging.nasmeh.si --staging` | | |
| A9 | Log rotation for the cron logs (`logrotate`) and the Docker `json-file` limits in place | `docker inspect nasmeh-app-1 --format '{{.HostConfig.LogConfig}}'`; logrotate stanza | | |

## B. Content and legal (D2, D4, G2, G4)

| # | Item | How to verify | Evidence | Done by, date |
|---|---|---|---|---|
| B1 | Legal pages final and reviewed: every LEGAL page `reviewed = true`, no draft notice on the storefront | *launch-check* (D4 rows); [legal checklist](legal-checklist.md) sign-off cells filled; hashes match (checklist §"How to use") | | |
| B2 | Cookie banner live with the reviewed table; consent version bumped if the table changed after the review | `/politika-piskotkov` table = the reviewed version; `consent.version` in `/admin/nastavitve/trzenje` | | |
| B3 | Company data entered (name, seat, matična številka, ID za DDV, e-mail, telephone); no seed placeholders | *launch-check* (G4 rows: footer, withdrawal PDF); `/admin/nastavitve/davki-racuni` shows no placeholder warning | | |
| B4 | Invoice footer and VAT rate confirmed by the accountant; numbering rule accepted | accountant's note (checklist §9) | | |
| B5 | Real catalogue and media replace the seeds: products, variants, prices, INCI, claims with evidence files, images (D2); the demo coupon `TEST10` and demo price history gone | *launch-check* (product urls in the sitemap); `/admin/izdelki` and `/admin/kuponi` review; `SELECT count(*) FROM "Coupon" WHERE code = 'TEST10'` = 0 | | |
| B6 | Support and compliance mailboxes real and staffed, hours and response promise set (`support.contact`); return address decided | `/admin/nastavitve/podpora`; a test ticket answered from the mailbox | | |
| B7 | Social profiles in the footer menu (`footer-sledite`) point at real profiles | `/admin/navigacija`; the footer links open the profiles | | |
| B8 | Owner decisions from the legal checklist taken (D7 capture, GTM gating, guarantee terms, tester promise, retention periods) | checklist "Owner decisions pending" rows answered | | |
| B9 | Shipping methods, prices and estimates real (D6 carrier accounts); free-shipping threshold and marquee text agree | `/admin/nastavitve/dostava`; a test checkout shows the real methods | | |

## C. Payments (D5, G1)

| # | Item | How to verify | Evidence | Done by, date |
|---|---|---|---|---|
| C1 | Live Stripe keys in `.env`; live webhook endpoint `https://nasmeh.si/api/webhooks/stripe` registered with the events the app handles; signing secret set; a test event delivered and accepted | Stripe dashboard → webhook → recent deliveries 200; app log `[webhook]` line | | |
| C2 | Live PayPal credentials and webhook id; endpoint `https://nasmeh.si/api/webhooks/paypal` verified | PayPal dashboard → webhook simulator delivery 200 | | |
| C3 | Klarna: SI eligibility decided; `STRIPE_KLARNA_ENABLED` matches the decision | `.env`; the payment step shows or hides Klarna accordingly | | |
| C4 | Turnstile live keys; a real form submission passes and a missing token fails closed | `/kontakt` submission with the widget; app log has no `bot_check` for the real submission | | |
| C5 | **G1: the €1 real-card order** placed on the live store, confirmation mail with the three PDFs received, invoice number issued, then refunded from `/admin/narocila/<number>`; the refund visible in Stripe and the order timeline | order number, mail screenshot, Stripe refund id; [phase-3 sandbox checklist](phase-3-sandbox-checklist.md) §8 reconciliation | | |
| C6 | Test-mode remnants absent: no `whsec_e2e`, no sandbox keys, `PAYPAL_ENVIRONMENT=live` | `grep -E "e2e|sandbox" .env` empty except `PAYPAL_ENVIRONMENT` | | |

## D. Search and analytics

| # | Item | How to verify | Evidence | Done by, date |
|---|---|---|---|---|
| D1 | Search Console property verified (`analytics.googleVerification` or DNS) | Search Console shows the property verified | | |
| D2 | Sitemap submitted and read without errors | Search Console → Sitemaps: `https://nasmeh.si/sitemap.xml` success | | |
| D3 | Index switch on, maintenance off (production); `robots.txt` allows | *launch-check* (home, robots) | | |
| D4 | GTM container (if used) contains only tags gated by Consent Mode or the `nasmeh_consent` event; container export committed under `docs/` | container export; a browser pass with all categories denied shows no tag firing | | |

## E. The switch and the first day

| # | Item | How to verify | Evidence | Done by, date |
|---|---|---|---|---|
| E1 | `scripts/launch-check.sh https://nasmeh.si` exits 0 | its output attached | | |
| E2 | A browser pass over the live store (home, catalogue, product, cart, checkout to the payment step, legal pages, sign-in) logs no `[csp]` lines; then `CSP_ENFORCE=true` and `up -d`; launch-check shows "CSP enforced" | `docker compose logs app | grep -c "\[csp\]"` = 0 before and after | | |
| E3 | Backup taken right before the switch (`scripts/backup.sh`) and its manifest noted | manifest path and `orders:` line | | |
| E4 | Rollback plan rehearsed: the previous release tag is known and `docker images nasmeh-app` lists it | the tag; the runbook Rollback section | | |
| E5 | First-day watch: health, `docker compose logs app`, the uptime checker, the first real order's confirmation mail; the daily job's first run at 06:00 | notes with timestamps | | |

## Sign-off

| Field | Value |
|---|---|
| Release | commit `…`, image `nasmeh-app:…` |
| launch-check output | attached (file or paste) |
| Legal sign-off (D4) | checklist rows signed by … on … |
| Accountant confirmation | … on … |
| Payment providers (D5, G1) | Stripe …, PayPal …, €1 order … refunded … |
| Owner's go decision | name, date, time |

After the launch: Phase 8 growth work starts from the backlog (GENERAL_PLAN §6) and the post-launch maintenance window for the framework upgrades (step 1 record).
