# Legal and GDPR checklist — gate D4 (Phase 9 step 4)

**Date:** 2026-09-14, texts finalised for review 2026-09-15. **Status: draft for gate D4 — nothing here is signed off.** Every sign-off cell is blank on purpose.

Plan: [docs/plans/phase-9.md](../plans/phase-9.md), "Step 4 design — GDPR and legal finalisation (gate D4)", and [GENERAL_PLAN.md §4](../GENERAL_PLAN.md) (D4 legal review and accountant confirmation, D7 abandoned-checkout e-mails, G2 mailboxes, G4 company data).

## Purpose

This document is the local part of gate D4. It maps every legal surface of the store to its legal basis, to the code or route that implements it and to its current state, and it gives the external reviewers (Slovenian e-commerce lawyer, accountant, responsible person / safety assessor, owner) one place to sign each item off. It also records the consent-log audit. The professional review itself, the IRPS provider choice and the accountant's confirmation are external and have not happened.

Sources:

- The per-area legal audit of 2026-09-13 (seven areas: legal pages, cookie table, consent log, statutory forms, checkout and invoicing, data-subject rights, product claims), with its SQL results. The notes live on the workstation, outside the repository.
- The questions raised by that audit and by the step 4 fixes: 131 inventory questions (referenced as `A|I<area>.<n>`) and 172 fix questions (referenced as `<cluster>|<finding-key>`). All of them are condensed in the appendix "Question register".
- The step 4 fixes built on 2026-09-13 (migrations `20260913090000_phase9_order_legal_snapshots` to `20260913120000_phase9_claims_copy`) and the code in the working tree on 2026-09-14.

The step 4 review fixes (2026-09-14 and 15) are in the tree: the withdrawal exception is one phrase in the words of CRD Art. 16(e) on every surface (`lib/copy/legal.ts` `sealedGoodsException`; Odstop od pogodbe §2 rewritten without the extra conditions), the withdrawal receipt acknowledges the notice and states the conditional statutory refund rule, the privacy policy describes the processing the code performs (16 sections, `[v potrditvi]` marks every lawyer input), the seller block above every legal body is rendered from the `company` Setting, and the cookie policy §4 describes the table as it is. The wording quoted below is the wording under review; the data migration carries the same texts to existing databases (LT-4).

## How to use this checklist

**States.** `implemented` — the behaviour exists in code and is covered by tests or evidence below. `draft text` — the text exists but awaits legal review. `placeholder` — the text or setting holds seed data or a stand-in that a business input must replace. `open` — nothing is built yet, or a decision is missing.

**Legal basis.** Instruments are cited as the audit cited them. Slovenian article numbers (ZVPot-1, ZEKom-2, ZEPT, ZDDV-1, ZIsRPS) come from the audit and several are marked unsure there; the lawyer confirms or corrects them as part of the sign-off. Abbreviations: GDPR (Reg. 2016/679), CRD (Dir. 2011/83/EU, transposed in ZVPot-1), ECD (Dir. 2000/31/EC, transposed in ZEPT), UCPD (Dir. 2005/29/EC), PID (Dir. 98/6/EC), ZEKom-2 (electronic communications: cookies, Art. 225, and unsolicited marketing), ZDDV-1 (VAT), ZDavPR (fiscal verification), ZIsRPS (out-of-court consumer dispute resolution, IRPS), Reg. 655/2013 (cosmetic claims), Reg. 1223/2009 (cosmetics), Dir. 2019/771 (sale of goods, commercial guarantees), GPSR (Reg. 2023/988).

**Open questions.** Each row cites register ids (`R-…`, see the appendix) followed by the source references they condense.

**Sign-off column.** The reviewer writes four things: **reviewer** (name and role), **date**, **text hash or version**, **verdict** (`approved`, `approved with changes: …`, `rejected: …` or `not applicable`). The hash or version identifies exactly what was reviewed:

- CMS legal pages: the SHA-256 of the published body. It is the same value `Order.legalAcceptance.pages[].sha256` stores for every order, so a reviewed hash can be matched against orders later:

  ```sql
  SELECT slug, published, reviewed, "updatedAt",
         encode(sha256(convert_to(body, 'UTF8')), 'hex') AS body_sha256
  FROM "ContentPage" WHERE template = 'LEGAL' ORDER BY slug;
  ```

  The query was checked on `nasmeh_e2e` on 2026-09-14: for orders NS-2026-00004 to 00006 the stored hashes equal the current body hashes of `pogoji-poslovanja` and `odstop-od-pogodbe`. Those e2e hashes are not sign-off values; the texts change today.
- Copy rendered from code (checkout notice, e-mail legal block, form notices, cookie banner): the git commit and file path, plus the wording fingerprint where the app stores one (`ConsentLog.version` for marketing choices, `Ticket.privacyVersion`, `Order.legalAcceptance.noticeVersion`; all `t-<12 hex>` from `lib/consent-log.ts` `wordingVersion`).
- Settings (cookie table, company data): the Setting's `updatedAt` and `encode(sha256(convert_to(value::text, 'UTF8')), 'hex')`.

A sign-off covers only the hash it records. Saving a CMS legal page with a changed title, body or template clears its `reviewed` flag automatically; a copy change in code changes its fingerprint. Set `reviewed = true` in `/admin/strani` only after the row is approved and the live hash equals the recorded one.

## Overview

| § | Surface | Rows | Blocking inputs |
|---|---|---|---|
| 1 | Legal text control (all CMS legal pages) | 6 | step 5 production delivery |
| 2 | Pogoji poslovanja and checkout pre-contract information | 10 | lawyer, G4, D5 |
| 3 | Politika zasebnosti | 9 | lawyer, G2, G3 |
| 4 | Politika piškotkov and the cookie table | 6 + 15 cookie rows | lawyer, staging capture, GTM container |
| 5 | Odstop od pogodbe (page, online form, PDF model form, receipt) | 9 | lawyer, G2, G4 |
| 6 | Reklamacije and IRPS | 5 | IRPS provider, lawyer, G2 |
| 7 | 30-dnevno jamstvo vračila denarja | 4 | owner terms, lawyer |
| 8 | Order confirmation as durable medium | 5 | lawyer |
| 9 | Invoicing | 7 | accountant, G4 |
| 10 | Consent log and CMP | 14 | lawyer, owner (GTM, retention) |
| 11 | Newsletter and back-in-stock double opt-in and withdrawal | 9 | lawyer, owner |
| 12 | Privacy notices at collection | 5 | lawyer, D7 |
| 13 | Prijava neželenega učinka | 9 | lawyer, responsible person, G2 |
| 14 | GDPR rights and retention | 10 | lawyer, owner, accountant |
| 15 | Product claims (Reg. 655/2013, Reg. 1223/2009) | 16 | responsible person, lawyer, D2 |
| 16 | Omnibus price-reduction display | 7 | lawyer |

## 1. Legal text control (all CMS legal pages)

The six LEGAL `ContentPage` rows are `pogoji-poslovanja`, `politika-zasebnosti`, `politika-piskotkov`, `odstop-od-pogodbe`, `reklamacije` and `garancija-vracila-denarja`. All are `published = true`, `reviewed = false` in every local database.

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| LT-1 | Unreviewed pages show the draft notice; the reviewed mark is bound to the text (cleared when title, body or template change) | Internal D4 control (no statutory rule) | `prisma/schema.prisma` `ContentPage.reviewed`; `app/admin/(shell)/strani/actions.ts`; notice on `app/(storefront)/[slug]/page.tsx`, `odstop-od-pogodbe/page.tsx`, `reklamacije/page.tsx`, `politika-piskotkov/page.tsx` | implemented (no reviewer/date columns: this checklist is the record) | R-LT-01 (A\|I1.10; c5b-cms-access\|reviewed-flag-not-bound-to-text). Whether an unreviewed draft with the public notice may go live is part of R-LT-03 | |
| LT-2 | Mandatory pages cannot be deleted, renamed or moved off the LEGAL template; unpublishing asks for confirmation | CRD Art. 6 and 8 (information must stay reachable) | `lib/admin/cms-schemas.ts` `SHADOWED_SLUGS`, `LEGAL_PAGE_SLUGS` plus the `legal.links` targets; `components/admin/PageEditor.tsx` | implemented | R-LT-02 (c5b-cms-access\|legal-pages-deletable-renamable) | |
| LT-3 | One mapping of legal paths used by checkout (terms, withdrawal, privacy), the cookie banner (cookies) and the support forms (privacy) | GDPR Art. 12 (easy access) | `lib/settings-schemas.ts` `LEGAL_LINK_KEYS` (complaints key removed), `lib/settings.ts` `getLegalLinks` | implemented | — (c5a-legal-texts-forms\|legal-links-privacy-complaints-unused, fixed) | |
| LT-4 | Draft-text data migrations and the seed never overwrite a reviewed page; an upgraded database reads exactly like a fresh one | Internal control | `prisma/migrations/20260913110000_phase9_legal_drafts` (guarded `reviewed = false`; `tests/unit/legal-drafts-migration.test.ts` keeps it in step with the seed), `prisma/seed.ts` skips reviewed pages | implemented; upgrade-path check 2026-09-15 ([step 4 record](phase-9-step-4-2026-09-15.md)): a database at the previous commit upgraded with the five migrations equals a fresh seed, a page marked reviewed and an operator-edited product survive, a second run updates 0 rows | — | |
| LT-5 | The legal texts reach a fresh production database without the dev seed: `20260915100000_phase9_legal_pages_bootstrap` inserts the five pages when missing (the guarantee page since phase 6), as published, unreviewed drafts with the seed text; the reviewed texts then replace them through the admin (`reviewed = true`) or a later guarded migration | CRD Art. 6/8, GDPR Art. 13, ZEKom-2 Art. 225 (available at opening) | `docker-entrypoint.sh` (migrate deploy); `prisma/migrations/20260915100000_phase9_legal_pages_bootstrap`; `tests/unit/legal-pages-bootstrap-migration.test.ts`; `prisma/seed.ts` never runs on a host (runbook) | implemented (Phase 9 step 5: six legal routes 200 on a fresh database behind the rehearsal proxy) | R-LT-03, R-LT-04 (A\|I1.19, A\|I7.28; c2-cmp\|policy-copy-necessary-list; c1-omnibus\|coupon-bundle-omnibus-scope) | |
| LT-6 | "Last updated" date on every legal route | Evidence of the version shown (no specific rule) | `[slug]/page.tsx` only; the static routes `odstop-od-pogodbe`, `reklamacije`, `politika-piskotkov` show none | open (minor) | R-TC-06 (c4a-checkout\|no-legal-text-versioning) | |

## 2. Pogoji poslovanja and checkout pre-contract information

Route `/pogoji-poslovanja` (`app/(storefront)/[slug]/page.tsx`), body `prisma/seed-legal.ts`. Checkout: `components/storefront/checkout/CheckoutWizard.tsx`, copy `lib/copy/checkout.ts`.

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| TC-1 | Seller identity: name, geographic address, e-mail, registration number, VAT ID | CRD Art. 6(1)(b)-(c); ECD Art. 5 / ZEPT; ZGD-1 (lawyer to confirm) | Terms §2 (`prisma/seed-legal.ts`); footer `components/storefront/chrome/SiteFooter.tsx` and the seller block above every legal body (`lib/copy/legal.ts` `sellerBlockLines`; `app/(storefront)/[slug]/page.tsx` LEGAL template, `odstop-od-pogodbe`, `reklamacije`, `politika-piskotkov`) from the `company` Setting | placeholder (G4); implemented 2026-09-19: the bodies name the seller by reference to the block rendered above them from `getCompany()`, server-rendered, printing `seller.missing` instead of an absent or seed-placeholder identity (`tests/unit/legal-seller-block.test.ts`), so the G4 data reaches every page, PDF and mail from one row | R-ID-01, R-ID-06, R-ID-08 (c4b-confirmation-invoice\|company-data-placeholders, c4b-confirmation-invoice\|company-placeholders; A\|I1.9) | |
| TC-2 | Trader telephone number | CRD Art. 6(1)(c) as amended by Dir. 2019/2161 | `lib/settings-schemas.ts` `companySchema.phone` (optional), admin `/admin/nastavitve/davki-racuni`, footer, confirmation legal block, invoice snapshot | implemented (field); number not decided | R-ID-02, R-ID-05 (c4b-confirmation-invoice\|no-telephone-number) | |
| TC-3 | When the contract is concluded; terms §1/§4 consistent with the order button ("Naročilo z obveznostjo plačila" creates the order, "Plačaj naročilo" pays; confirmation mail only after payment) | CRD Art. 8(2); ECD Arts. 10-11 / ZEPT; OZ | Terms §1, §4; `CheckoutWizard.tsx`; `components/storefront/checkout/ProviderPaymentPanel.tsx` | draft text | R-TC-02 (c5a-legal-texts-forms\|terms-content-gaps; A\|I1.1, A\|I5.1) | |
| TC-4 | E-commerce information: technical steps, correcting input errors, contract language, filing and access to the contract, governing law, reminder of the legal guarantee of conformity | ECD Arts. 10-11 / ZEPT; CRD Art. 6(1)(l) | Terms (absent) | open | R-TC-01, R-TC-06 (c5a-legal-texts-forms\|terms-content-gaps, c4a-checkout\|no-legal-text-versioning; A\|I1.1) | |
| TC-5 | Payment methods and delivery area accurate and stated at the start of ordering | CRD Art. 6(1)(g), 8(3) | Terms §5/§6 point to checkout; `components/storefront/ui/PaymentIcons.tsx` (Klarna behind `STRIPE_KLARNA_ENABLED`); `shipping.methods` (default SI); PDP delivery accordion `lib/copy/pdp.ts` still hard-codes "2–4 delovnih dneh" and 45 € | draft text; delivery copy drift open | R-TC-07, R-TC-11, R-TC-12, R-TC-13 (c4b-confirmation-invoice\|payment-delivery-copy-drift, c5a-legal-texts-forms\|terms-content-gaps; A\|I5.6, A\|I5.7, A\|I6.29) | |
| TC-6 | Total price incl. VAT and delivery, and the order recap, directly before the order button (also on mobile) | CRD Art. 6(1)(a),(e), 8(2); PID | `CheckoutWizard.tsx` review step recap | implemented | R-TC-04 (c4a-checkout\|review-step-total-only; A\|I5.5) | |
| TC-7 | Terms and withdrawal links directly above the order button; notice wording (a statutory right is information, not an agreed term) | CRD Art. 6(1)(h), 8(2); ECD Art. 10(3) | `CheckoutWizard.tsx` review step; `lib/copy/checkout.ts` `review.legal` | implemented (placement); the exception is the shared Art. 16(e) phrase (`legal.sealedGoodsException`) | R-TC-03, R-TC-04, R-TC-05 (c4a-checkout\|legal-links-not-at-button, c4a-checkout\|checkout-legal-note-placement, c4a-checkout\|checkout-agree-to-withdrawal-wording; A\|I1.13, A\|I5.2, A\|I4.6) | |
| TC-8 | Record of which terms and withdrawal texts were in force for each order | CRD Art. 6(9) (burden of proof); ECD Art. 10(3) | `Order.legalAcceptance` {acceptedAt, noticeVersion, pages[key, path, slug, updatedAt, sha256, title, body]} written by `lib/orders/legal-acceptance.ts` in `lib/orders/create.ts`; migration `20260913090000_phase9_order_legal_snapshots` | implemented (each accepted page's title, body HTML and SHA-256 stored with the order; no revision table) | R-TC-03, R-TC-14, R-OC-02 (c4a-checkout\|terms-acceptance-not-recorded; A\|I5.3) | |
| TC-9 | Out-of-court dispute resolution reference in terms §9 | ZIsRPS | Terms §9 (generic, points to Reklamacije) | placeholder (provider not chosen) | R-CO-01 (c5a-legal-texts-forms\|odr-link-stale; A\|I4.10) | |
| TC-10 | Review policy paragraph in the terms | UCPD Art. 7(6) | Absent from terms; disclosure exists on the PDP (§15 PC-16) | open | R-RV-02 (c6-gdpr-rights\|review-verification-disclosure) | |

## 3. Politika zasebnosti

Route `/politika-zasebnosti` (`app/(storefront)/[slug]/page.tsx`), body `prisma/seed-legal.ts`. The body (16 sections; `[v potrditvi]` marks every input the lawyer or the owner must supply) describes the processing the code performs; the rows list what each section must cover and what the lawyer signs.

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| PR-1 | Controller identity and contact | GDPR Art. 13(1)(a) | Privacy §1 | placeholder (G4); the controller is named by reference to the company block rendered above the body | R-ID-01, R-ID-08 (c4b-confirmation-invoice\|company-data-placeholders) | |
| PR-2 | Purposes and legal bases, incl. legitimate interests and whether providing data is required | GDPR Art. 13(1)(c),(d), 13(2)(e) | Privacy §3 | draft text | R-PR-01, R-TC-08, R-MK-08 (A\|I1.2; c4a-checkout\|abandoned-checkout-no-basis-retention, c6-gdpr-rights\|review-request-no-optout) | |
| PR-3 | Recipients and processors: Stripe, PayPal, Klarna, carriers, SMTP and mailbox providers, Cloudflare (Turnstile), Google (GTM/GA4), Meta/TikTok if configured, host and backup storage; processor vs independent controller; DPAs in place | GDPR Art. 13(1)(e), 28 | Privacy §4 | draft text (§12); provider names and DPAs open | R-PR-02, R-PR-06 to R-PR-11 (c5a-legal-texts-forms\|policy-copy-necessary-list, c2-cmp\|policy-copy-necessary-list, c3-marketing\|turnstile-every-page, c3-marketing\|turnstile-preconsent-every-page; A\|I6.28 to A\|I6.35) | |
| PR-4 | Third-country transfers and safeguards | GDPR Art. 13(1)(f), Chapter V | Privacy (absent before the revision) | draft text | R-PR-02 (c3-marketing\|turnstile-every-page) | |
| PR-5 | Retention periods per category, matching what the code does | GDPR Art. 5(1)(e), 13(2)(a) | Privacy §5; `lib/jobs/retention.ts` (auth tokens 30 days after use or expiry, activation data cleared, converted checkout captures deleted and stale ones after 30 days, rejected-review photos removed) | draft text (§15); most periods undecided | R-PR-03, R-DR-08, R-CL-06, R-TC-10 (c6-gdpr-rights\|anonymise-consent-proof, c6-gdpr-rights\|no-retention-purge, c2-cmp\|no-retention-rate-limit, c4b-confirmation-invoice\|abandoned-checkout-kept-after-purchase) | |
| PR-6 | Rights, consent withdrawal, complaint to the Informacijski pooblaščenec, DPO statement, automated decisions | GDPR Art. 13(2)(b)-(d),(f), 15-22, 77 | Privacy §6 (requests by e-mail at P1) | draft text | R-PR-01, R-DR-01 (A\|I1.2, A\|I6.1) | |
| PR-7 | Special-category data from adverse-event reports | GDPR Art. 9, 13, 14 | Privacy (section required, see §13) | draft text | R-AE-01, R-AE-02 (c5a-legal-texts-forms\|adverse-privacy-not-explicit-art9; A\|I4.12, A\|I4.19) | |
| PR-8 | Processing not described before step 4: accounts, reviews (public name, photos), support tickets and photos, back-in-stock alerts, review-request e-mails, checkout step-1 capture, consent log with its pseudonymous consent id, backups, server logs | GDPR Art. 13 | Privacy | draft text | R-PR-01, R-PR-05, R-RV-03, R-DR-09, R-DR-10 (c2-cmp\|consent-log-not-linkable, c6-gdpr-rights\|review-author-full-name, c6-gdpr-rights\|logs-may-carry-emails; A\|I6.27) | |
| PR-9 | Analytics described accurately (GA4 cookies are pseudonymous, not anonymous) | GDPR Art. 13; ZEKom-2 Art. 225 | Privacy §3; banner analytics category and `_ga` row in `lib/copy/cmp.ts` still say "Anonimna statistika" | open | R-PR-04 (c2-cmp\|cookie-table-incomplete; A\|I1.2, A\|I6.32) | |

## 4. Politika piškotkov and the cookie table

Route `/politika-piskotkov` (`app/(storefront)/politika-piskotkov/page.tsx`) renders the CMS body plus the live table from the `consent.cookies` Setting.

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| CK-1 | Policy text: categories, prior consent for non-necessary cookies, Consent Mode default denied, how to change the choice | ZEKom-2 Art. 225; GDPR Art. 7(3), 13 | `prisma/seed-legal.ts` `politika-piskotkov` | draft text; §4 describes the table as it is (category column, provider-level rows for Stripe, PayPal and Turnstile, analytics cookies not called anonymous) | R-CK-09, R-CK-17 (c2-cmp\|policy-copy-necessary-list, c2-cmp\|policy-table-hides-category, c5a-legal-texts-forms\|cookie-policy-typo; A\|I2.2, A\|I1.3) | |
| CK-2 | The table lists every cookie and web-storage key the site uses, and matches reality | ZEKom-2 Art. 225 (the exemption removes consent, not the duty to inform); GDPR Art. 12-13; GENERAL_PLAN Phase 9 item 3 | Setting `consent.cookies` (`lib/settings-schemas.ts` `cookieRowSchema`), seeded from `lib/copy/cmp.ts` `COOKIES`, migration `20260913100000_phase9_cookie_table` (updates only the untouched Phase 7 default), admin `components/admin/ConsentEditor.tsx` | implemented for first-party names; third-party rows name the provider only | R-CK-01, R-CK-02, R-CK-14 (c2-cmp\|cookie-table-incomplete; A\|I2.1, A\|I2.17) | |
| CK-3 | Columns Ime, Kategorija, Ponudnik, Namen, Trajanje | ZEKom-2 Art. 225; GDPR Art. 13 | `lib/copy/cmp.ts` `policy.columns`; page table | implemented | R-CK-02 (c2-cmp\|policy-table-hides-category; A\|I2.1) | |
| CK-4 | Auth.js cookies listed under their https names (`__Secure-`, `__Host-`) | Transparency (ZEKom-2 Art. 225, GDPR Art. 12) | `lib/copy/cmp.ts` rows | implemented; `__Host-authjs.csrf-token` observed over https in the step 5 rehearsal (Secure, HttpOnly); the session and callback cookies need a sign-in with Turnstile keys (staging) | R-CK-15 (c2-cmp\|authjs-cookie-names-dev-only, c2-cmp\|cookie-table-incomplete) | |
| CK-5 | The production table equals a real browser dump at go-live (an admin-edited row is skipped by the migration) | as CK-2 | Step 5 staging, step 6 go-live | open | R-CK-14, R-CK-16 (c2-cmp\|cookie-table-incomplete) | |
| CK-6 | Adding a non-necessary row bumps `consent.version` (re-asks every visitor); the bump is manual | GDPR Art. 7; EDPB 05/2020 | `app/admin/(shell)/nastavitve/actions.ts` bump action; `lib/consent.ts` `parseConsent` | implemented (manual); materiality rule open | R-CK-11, R-CK-13 (c2-cmp\|cookie-table-incomplete; A\|I2.22, A\|I3.4) | |

Cookie table rows as they stand in `lib/copy/cmp.ts` `COOKIES` on 2026-09-14 (the same rows the Phase 9 cookie-table migration writes). Each row is signed separately.

| # | Name | Category | Duration | Set when | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| CT-1 | `nasmeh_consent` | necessary | 12 months | Explicit CMP save; holds categories, version, time and the random consent id | R-CK-04, R-CL-02 (A\|I2.3) | |
| CT-2 | `__Secure-authjs.session-token` | necessary | 30 days (staff 12 h) | Sign-in | R-CK-15 | |
| CT-3 | `__Host-authjs.csrf-token` | necessary | session | Only on a direct `/api/auth` request | R-CK-15 | |
| CT-4 | `__Secure-authjs.callback-url` | necessary | session | Sign-in and sign-out | R-CK-15 | |
| CT-5 | `nasmeh_preauth` | necessary (staff only) | 5 minutes | Between password and second factor | R-CK-12 (A\|I2.10) | |
| CT-6 | `nasmeh_cart` | necessary | 30 days | Guest changes the cart | R-CK-03 (A\|I2.7) | |
| CT-7 | `nasmeh_koda` | necessary | 30 days | `/koda/{CODE}` link or welcome-popup thank-you step | R-CK-03 (c2-cmp\|cookie-table-incomplete; A\|I2.8) | |
| CT-8 | `nasmeh_order_*` | necessary | 30 days | Order placed (one per order) | R-CK-03 (A\|I2.9) | |
| CT-9 | `nasmeh_maintenance` | necessary | 24 hours | Correct password during maintenance mode | — | |
| CT-10 | `nasmeh_welcome_seen` (sessionStorage, not a cookie) | necessary | until the tab closes | Popup dismissed or submitted | R-CK-01 (c2-cmp\|cookie-table-incomplete; A\|I1.3, A\|I2.12) | |
| CT-11 | Stripe.js | necessary | set by provider | Payment step with Stripe | R-CK-03, R-CK-14 (A\|I2.16) | |
| CT-12 | PayPal | necessary | set by provider | Payment with PayPal | R-CK-02, R-CK-14 (A\|I2.17) | |
| CT-13 | Cloudflare Turnstile | necessary | set by provider | First interaction with a protected form | R-CK-05, R-CK-14 (c3-marketing\|turnstile-every-page; A\|I2.15) | |
| CT-14 | `_ga, _ga_*` (Google Analytics) | analytics | 2 years | GTM container tags after consent | R-CK-11, R-PR-04 (A\|I2.13, A\|I6.32) | |
| CT-15 | `_fbp` (Meta) | marketing | 3 months | GTM container tags after marketing consent, if configured | R-CK-11 (A\|I2.14) | |

## 5. Odstop od pogodbe (page, online form, PDF model form, receipt)

Route `/odstop-od-pogodbe` (`app/(storefront)/odstop-od-pogodbe/page.tsx`): CMS body, online form, PDF link, guarantee link.

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| WD-1 | Withdrawal period and how to notify; trader name, postal address, e-mail and telephone in the instructions | CRD Art. 6(1)(h), 9, 11(1), Annex I(A); ZVPot-1 | Page §1 (`prisma/seed-legal.ts`) | draft text; §1 still names info@nasmeh.si (G2); implemented 2026-09-19: the seller block above the body is rendered from the `company` Setting (`app/(storefront)/odstop-od-pogodbe/page.tsx`, `sellerBlockLines`) | R-WD-01, R-WD-12, R-ID-04 (c5a-legal-texts-forms\|withdrawal-page-content-gaps, c5a-legal-texts-forms\|withdrawal-missing-annex-ia-elements; A\|I4.1) | |
| WD-2 | Exception for sealed goods unsealed after delivery, stated the same way on every surface | CRD Art. 16(e), 6(1)(k); CJEU C-681/17 | Page §2; checkout notice `lib/copy/checkout.ts`; PDP delivery accordion `lib/copy/pdp.ts`; form hint `lib/copy/returns.ts`; PDF hygiene note; confirmation legal block `lib/copy/email.ts` | draft text; one phrase in the words of Art. 16(e) on every surface (`lib/copy/legal.ts` `sealedGoodsException`, asserted across eight surfaces by `tests/unit/order-legal-acceptance.test.ts`); §2 rewritten without the "undamaged" condition and the 14-day return sentence | R-WD-02, R-WD-10 (c4a-checkout\|checkout-agree-to-withdrawal-wording, c5a-legal-texts-forms\|withdrawal-page-content-gaps; A\|I1.4, A\|I4.5) | |
| WD-3 | Refund within 14 days of the notice, withholding until goods or proof arrive, standard delivery costs, same means of payment | CRD Art. 13(1)-(3) | Page §3; shared sentence `lib/copy/returns.ts` `withdrawal.success.statutory` (form success, receipt, confirmation) | draft text (anchor corrected 2026-09-13) | R-WD-03 (c5a-legal-texts-forms\|refund-deadline-anchor, c5a-legal-texts-forms\|withdrawal-refund-timing-wording; A\|I1.4) | |
| WD-4 | Consumer's 14-day send-back deadline, return costs, return address, liability for diminished value | CRD Art. 14(1)-(2), Annex I(A) | Page §3 states return costs only | open (lawyer redraft; G2 return address) | R-WD-01, R-ID-04 (c5a-legal-texts-forms\|withdrawal-missing-annex-ia-elements, c5a-legal-texts-forms\|withdrawal-page-content-gaps; A\|I4.1) | |
| WD-5 | Online form accepts any notice: an order number that matches no order is still recorded (linked when it matches); goods not yet received are supported; privacy acknowledgement; Turnstile | CRD Art. 9, 11(1)(b), 11(3), Annex I(B); GDPR Art. 13 | `components/storefront/support/WithdrawalForm.tsx`, `app/(storefront)/actions/returns.ts`, `lib/support/validation.ts` `withdrawalInputSchema`, `lib/support/tickets.ts` | implemented | R-WD-04, R-WD-05 (c5a-legal-texts-forms\|withdrawal-form-rejects-unmatched-order, c5a-legal-texts-forms\|withdrawal-received-date-mandatory; A\|I1.5, A\|I4.2) | |
| WD-6 | Acknowledgement of receipt without delay on a durable medium | CRD Art. 11(3) | `lib/support/delivery.ts`, `lib/email/templates/support-ticket.ts`, `lib/copy/support-email.ts`; SMTP failures retried by the daily job (once a day) | implemented; the receipt acknowledges the notice ("To sporočilo potrjuje njegov prejem") and states the conditional statutory refund rule (`returns.withdrawal.success.statutory`) | R-WD-06, R-WD-11 (A\|I1.5, A\|I4.4) | |
| WD-7 | Model withdrawal form (PDF) with the seller block; refuses to serve (503) when the company Setting is missing | CRD Annex I(B) | `app/(storefront)/odstop-od-pogodbe/obrazec.pdf/route.ts`, `lib/returns/withdrawal-pdf.ts` | implemented; seller data placeholder (G4) | R-WD-09, R-ID-01 (c4b-confirmation-invoice\|pdf-fallback-no-address; A\|I1.6, A\|I4.3) | |
| WD-8 | A withdrawal sent through `/kontakt` (topic RETURN, reason WITHDRAWAL) is treated as a withdrawal notice; the form points to the dedicated form; staff mail footer no longer says the request has no effect | CRD Art. 11(1)(b), 12 | `components/storefront/support/ContactForm.tsx`, `lib/email/templates/support-ticket.ts` ("[ODSTOP]" subject prefix) | implemented | R-WD-07, R-WD-08 (c5a-legal-texts-forms\|contact-form-adverse-and-withdrawal-bypass, c5a-legal-texts-forms\|staff-footer-withdrawal-misstatement; A\|I4.7) | |
| WD-9 | Mailbox named in the body receives withdrawals (body names info@nasmeh.si, the forms send to `support.contact` mailboxes) | CRD Art. 6(1)(c), Annex I | Page §1/§5; `lib/support/settings-schema.ts` | placeholder (G2) | R-ID-03, R-WD-12 (c5a-legal-texts-forms\|withdrawal-page-content-gaps) | |

## 6. Reklamacije (complaints, IRPS)

Route `/reklamacije` (`app/(storefront)/reklamacije/page.tsx`): CMS body plus five buttons (damaged, wrong item, withdrawal, adverse event, guarantee).

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| CO-1 | How to complain, the handling steps and the response promise | ZVPot-1 complaint handling (articles to confirm) | Body §1-§3 (`prisma/seed-legal.ts`); buttons in the route | draft text; response promise not staffed (G2) | R-CO-02, R-CO-04 (A\|I1.7, A\|I4.8) | |
| CO-2 | Statutory conformity information: liability period, notification, remedies in order (repair or replacement, then price reduction or termination), free of charge; troubleshooting not a precondition | Dir. 2019/771 Arts. 10-14 via ZVPot-1 | Absent | open | R-CO-02 (A\|I4.8) | |
| CO-3 | IRPS provider named with the participation statement; no reference to the closed EU ODR platform | ZIsRPS; Reg. 2024/3228 (ODR platform closed 20 July 2025) | Body §4 generic; ODR sentence removed by `20260913110000_phase9_legal_drafts` | placeholder (provider not chosen) | R-CO-01 (c5a-legal-texts-forms\|odr-link-stale, c5a-legal-texts-forms\|stale-odr-link-no-irps-provider, c5a-legal-texts-forms\|odr-link-obsolete; A\|I1.7, A\|I4.10) | |
| CO-4 | Written notice on rejecting a complaint names the IRPS provider and participation | ZIsRPS | No template or procedure | open | R-CO-03 (c5a-legal-texts-forms\|odr-link-stale) | |
| CO-5 | A complaint reason for a defect other than transport damage | Operational (ZVPot-1 handling) | `lib/support/topics.ts` DAMAGED reasons | open | R-CO-05 (A\|I4.9) | |

## 7. 30-dnevno jamstvo vračila denarja

Route `/garancija-vracila-denarja` (`app/(storefront)/[slug]/page.tsx`). The withdrawal page §4 now only points here; the PDP accordion copy was rewritten by `20260913120000_phase9_claims_copy` and no longer says "ni nobenega tveganja".

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| GU-1 | One set of conditions (start date, channel, photo, limit, opened or used products) stated in one place and repeated consistently in advertising | Dir. 2019/771 Art. 17(1) (advertising binds the guarantor); UCPD Arts. 6-7 | Guarantee page (`prisma/seed-legal.ts`); PDP accordion (`prisma/seed-pdp.ts`); PDP badge `components/storefront/pdp/BuyBox.tsx` | draft text; owner terms open | R-GU-01 (c5a-legal-texts-forms\|guarantee-terms-inconsistent, c5a-legal-texts-forms\|guarantee-terms-contradict-and-point-to-withdrawal, c7-claims\|guarantee-inconsistent-conditions, c7-claims\|guarantee-terms-contradict-and-point-to-withdrawal, c7-claims\|guarantee-terms-inconsistent; A\|I1.8, A\|I4.20, A\|I4.21) | |
| GU-2 | Guarantee statement content: guarantor name and address, statutory remedies free of charge and unaffected, claim procedure | Dir. 2019/771 Art. 2(12), 17(2) via ZVPot-1 (whether a satisfaction promise qualifies is unsure) | Guarantee page §4 states statutory rights are unaffected; guarantor absent | open | R-GU-02 (c5a-legal-texts-forms\|guarantee-terms-inconsistent, c7-claims\|guarantee-inconsistent-conditions; A\|I4.20, A\|I7.19) | |
| GU-3 | Statement delivered on a durable medium by delivery at the latest | Dir. 2019/771 Art. 17(2) | Order confirmation carries a pointer to the page, not the statement | open | R-GU-02 (c4b-confirmation-invoice\|order-confirmation-lacks-durable-medium-info; A\|I4.6) | |
| GU-4 | Terminology ("jamstvo", "garancija", "poslovna garancija") and no absolute "no risk" wording | ZVPot-1; UCPD Arts. 6-7; Reg. 655/2013 criterion 4 | Page title "Jamstvo vračila denarja", slug `garancija-vracila-denarja` | draft text | R-GU-03, R-GU-04 (c5a-legal-texts-forms\|guarantee-terms-inconsistent, c7-claims\|guarantee-inconsistent-conditions; A\|I4.21, A\|I7.19) | |

## 8. Order confirmation as durable medium

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| OC-1 | Confirmation e-mail carries the Art. 6(1) information: seller block (name, address, registration, VAT ID, e-mail, phone when set), withdrawal summary with the exception, return costs, refund sentence, legal guarantee and complaints, guarantee pointer; appended after the body so an operator template override cannot remove it | CRD Art. 8(7), 6(1); CJEU C-49/11 (a web page is not a durable medium) | `lib/email/mailer.ts`, `lib/email/templates/order-confirmation.ts`, `lib/copy/email.ts` `orderConfirmation.legal`, `lib/email/templates/render.ts` (`requiredHtml`) | implemented; wording draft (shared Art. 16(e) phrase); the admin preview and the test send append the block with sample data (`lib/email/templates/required-samples.ts`) | R-OC-01 (c4b-confirmation-invoice\|order-confirmation-lacks-durable-medium-info, c4b-confirmation-invoice\|order-confirmation-no-withdrawal-info, c4b-confirmation-invoice\|confirmation-mail-missing-crd-info) | |
| OC-2 | Attachments: invoice PDF, model withdrawal form PDF, PDF of the terms and withdrawal texts as accepted at checkout (printed from the body stored on the order, with its SHA-256; orders placed before the body was stored print the live page with a "changed since acceptance" marker) | CRD Art. 8(7); ECD Art. 10(3) | `lib/email/mailer.ts` (three attachments), `lib/invoice/legal-texts-pdf.ts`, `lib/returns/withdrawal-pdf.ts` | implemented, except the seller block: `generateLegalTextsPdf({ seller })` prints it above the texts, but **open** — `lib/orders/confirmation-delivery.ts` (~line 88) still calls the helper without `seller`, so the attachment carries no seller block yet (the helper deliberately prints nothing rather than "not available" when the key is omitted, because a confirmation is only built with a valid company Setting) | R-OC-02, R-OC-03, R-OC-04 (c4b-confirmation-invoice\|order-confirmation-lacks-durable-medium-info, c4b-confirmation-invoice\|order-confirmation-no-withdrawal-info, c4a-checkout\|legal-links-not-at-button; A\|I1.15, A\|I5.9, A\|I4.6) | |
| OC-3 | Terms and withdrawal versions recorded per order (`Order.legalAcceptance`, see TC-8) | CRD Art. 6(9) | `lib/orders/legal-acceptance.ts`, `lib/orders/create.ts` | implemented. Evidence `nasmeh_e2e` 2026-09-14: 7 of 8 orders carry it (the eighth, NS-2026-42715, is a test fixture inserted directly); stored hashes equal the current body hashes | R-TC-14 (c4a-checkout\|terms-acceptance-not-recorded) | |
| OC-4 | Seller, buyer and footer frozen at invoice issuance; confirmation is not sent (retried by the daily job) while the company Setting is missing or invalid | CRD Art. 8(7); ZDDV-1 | `Order.invoiceSnapshot` via `lib/invoice/snapshot.ts`, `lib/orders/transitions.ts`, `lib/orders/confirmation-delivery.ts` | implemented | R-IN-02, R-IN-10 (c4b-confirmation-invoice\|invoice-regenerated-live) | |
| OC-5 | Timing: sent only after payment, at the latest by delivery; the stockout path cancels a paid order and sends no confirmation | CRD Art. 8(7) | `lib/orders/confirmation-delivery.ts` | open (lawyer) | R-OC-05 (A\|I5.9) | |

## 9. Invoicing (accountant)

Invoice PDF `lib/invoice/pdf.ts` from `lib/invoice/data.ts` and the issuance snapshot; route `app/(storefront)/racun/narocilo/[number]/racun.pdf/route.ts`.

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| IN-1 | Seller identity on the invoice (name, address, registration number, ID za DDV) | ZDDV-1 Art. 82 (per audit) | `invoiceSnapshot.seller` from the `company` Setting; `companyPlaceholderFields()` detects seed values | placeholder (G4) | R-ID-01, R-ID-07, R-IN-09 (c4b-confirmation-invoice\|company-data-placeholders; A\|I5.18) | |
| IN-2 | Sequential numbering: invoice number = order number, allocated at order creation, so unpaid or cancelled orders leave gaps; no yearly reset; year prefix is the calendar year in the store's zone (Europe/Ljubljana, `storeYear`), not the container's UTC clock | ZDDV-1 Art. 82; ZDavPR numbering if it applies | `lib/orders/numbers.ts`, `lib/orders/transitions.ts` | open (accountant) | R-IN-04 (c4b-confirmation-invoice\|invoice-numbering-gaps; A\|I5.19) | |
| IN-3 | Content: tax base per rate, net unit prices, supply date, payment method; full or simplified invoice | ZDDV-1 Art. 82, 83 (per audit) | `lib/invoice/pdf.ts`, `lib/copy/invoice.ts` (VAT line and tax base line) | partially implemented; accountant to confirm | R-IN-01, R-IN-07, R-IN-08 (c4b-confirmation-invoice\|invoice-content-vat-base; A\|I5.20) | |
| IN-4 | Issued invoice kept unchanged for the retention period, including buyer data after anonymisation | ZDDV-1 (believed Art. 141, 10 years); GDPR Art. 17(3)(b) | `Order.invoiceSnapshot` (kept by `anonymiseCustomer`); PDF bytes are not stored | implemented (data frozen); period and PDF storage open | R-IN-01, R-IN-02, R-IN-03, R-IN-10 (c4b-confirmation-invoice\|invoice-regenerated-live, c4b-confirmation-invoice\|anonymise-vs-invoice-retention; A\|I5.21, A\|I6.4, A\|I6.23, A\|I1.2) | |
| IN-5 | Fiscal verification (davčno potrjevanje) for card, Apple Pay, Google Pay, Klarna and PayPal payments | ZDavPR | None (assumed not applicable in `docs/NASMEH_FEATURES.md:62`) | open (accountant) | R-IN-05 (c4b-confirmation-invoice\|invoice-numbering-gaps; A\|I5.22) | |
| IN-6 | Credit note (dobropis) for refunds and withdrawals | ZDDV-1 (tax base correction; article unsure) | `lib/orders/refunds.ts` (no document) | open (accountant) | R-IN-06 (c4b-confirmation-invoice\|invoice-numbering-gaps; A\|I5.23) | |
| IN-7 | Invoice issued at payment vs goods shipped later: advance-payment invoice or supply date | ZDDV-1 | `invoiceIssuedAt` = payment time | open (accountant) | R-IN-07 (c4b-confirmation-invoice\|invoice-content-vat-base; A\|I5.20) | |

## 10. Consent log and CMP

`ConsentLog` model in `prisma/schema.prisma`; CMP in `components/storefront/cmp/`. The audit of the stored rows is in "Consent-log audit (2026-09-14)" below.

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| CL-1 | Every stored choice carries a known kind, a non-empty version and the categories (cookie: boolean analytics and marketing; back-in-stock: product; other kinds: boolean marketing) | GDPR Art. 7(1), 5(2); plan step 4 criterion | `lib/consent-log.ts` `recordConsent` + `consentRecordSchema` (single write path; `tests/unit/consent-log.test.ts` refuses direct `consentLog.create`); no database CHECK constraint | implemented; audit PASS | R-CL-01 (A\|I3.1) | |
| CL-2 | A cookie choice is attributable: random consent id in the httpOnly cookie and in `visitorId`, `userId` when signed in, timestamp; the id chains later changes across versions; the row is written before the cookie, and a refusal is never blocked | GDPR Art. 7(1); ZEKom-2 Art. 225 | `app/(storefront)/actions/consent.ts`, `lib/consent.ts` (`consentIdFromCookie`, `clientConsent` keeps the id out of the page) | implemented | R-CL-02, R-CL-03, R-PR-05 (c2-cmp\|consent-log-not-linkable, c2-cmp\|cookie-consent-unlinkable, c2-cmp\|cookie-before-log; A\|I2.21, A\|I3.2, A\|I6.13) | |
| CL-3 | Version identifies the wording: cookie rows use the `consent.version` Setting, marketing rows a fingerprint of the checkbox or notice text | GDPR Art. 4(11), 7(1) | `lib/consent-log.ts` `marketingVersion` / `wordingVersion` | implemented | R-CL-04 (c3-marketing\|marketing-version-literal, c4a-checkout\|checkout-consent-version-literal; A\|I5.24) | |
| CL-4 | No IP address or user agent stored (columns exist, never written) | GDPR Art. 5(1)(c) | `recordConsent` accepts neither | implemented (decision to confirm) | R-CL-01 (A\|I3.1) | |
| CL-5 | Anonymous consent saves are bounded (240 per 10 minutes per client since 2026-10-03, 120 before; over the limit a grant is refused and a refusal still sets the cookie without a row) | Availability, not a legal rule | `app/(storefront)/actions/consent.ts` | implemented | — (c2-cmp\|no-retention-rate-limit, partially fixed) | |
| CL-6 | Retention period for consent records | GDPR Art. 5(1)(e), 13(2)(a) | None: `lib/jobs/retention.ts` leaves consent rows out | open | R-CL-06, R-DR-05 (c2-cmp\|consent-log-not-linkable, c2-cmp\|no-retention-rate-limit; A\|I3.18) | |
| CL-7 | What each consent version presented (banner text and cookie table) can be shown later | GDPR Art. 7(1) | None (process: snapshot per version) | open | R-CL-07 (c2-cmp\|cookie-consent-unlinkable) | |
| CL-8 | Banner: reject as easy as accept on the first layer, toggles off by default, reopen from the footer, toggles show the stored state, the welcome popup never covers an unanswered banner | GDPR Art. 4(11), 7(3); EDPB cookie banner taskforce | `CmpBanner.tsx`, `CmpOpenButton.tsx`, `components/storefront/WelcomePopup.tsx` | implemented | R-CK-06 (c2-cmp\|reopen-toggles-stale, c3-marketing\|welcome-popup-covers-cmp; A\|I2.19) | |
| CL-9 | Tags only after consent: GTM injected after analytics **or** marketing consent; Consent Mode default denied; the stored choice restored on every page load; `nasmeh_consent` dataLayer event for tags that ignore Consent Mode | ZEKom-2 Art. 225 | `GatedScripts.tsx`, `lib/analytics.ts` `gtmAllowed`, `lib/consent.ts` `consentModeSnippet` | implemented; marketing-only loading is an owner decision pending (see below) | R-CK-08, R-CK-11 (c2-cmp\|marketing-only-consent-never-loads-gtm, c2-cmp\|gtm-marketing-gating, c2-cmp\|consent-mode-not-restored-on-load; A\|I2.13) | |
| CL-10 | Withdrawing a category expires its first-party tracker cookies and reloads the page | GDPR Art. 7(3) | `ConsentProvider.tsx`, `lib/copy/cmp.ts` `CONSENT_CLEAR_COOKIES` | implemented (good practice) | R-CK-07 (c2-cmp\|withdrawal-does-not-clear-cookies; A\|I2.20) | |
| CL-11 | Events pushed before a choice are dropped, not replayed after consent | ZEKom-2 Art. 225 | `lib/analytics.ts` | implemented | R-CK-10 (c2-cmp\|dataLayer-preconsent-replay) | |
| CL-12 | Cloudflare Turnstile loads only when a protected form is used, not on every page view | ZEKom-2 Art. 225; GDPR Art. 6(1)(f), Chapter V | `components/storefront/chrome/useLazyChallenge.tsx`, `TurnstileWidget.tsx` | implemented | R-CK-05 (c3-marketing\|turnstile-every-page, c3-marketing\|turnstile-preconsent-every-page; A\|I2.15, A\|I6.31) | |
| CL-13 | Consent lifetime 12 months, then the banner asks again | GDPR Art. 7; IP RS practice | `lib/consent.ts` `CONSENT_MAX_AGE_S` | implemented | R-CK-04 (A\|I2.3) | |
| CL-14 | Consent records appear in the data-subject export (by user, subscriber, subscription, order number); cookie rows with only a consent id cannot be attributed | GDPR Art. 15, 11(2) | `lib/admin/customers.ts` `exportCustomerData` / `subjectConsents` | implemented | R-DR-04 (c6-gdpr-rights\|export-missing-consents) | |

## 11. Newsletter and back-in-stock double opt-in and withdrawal

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| MK-1 | Sign-up from the footer and the welcome popup records the real source and shows the privacy notice | GDPR Art. 6(1)(a), 7, 13; ZEKom-2 (unsolicited communications) | `app/(storefront)/actions/newsletter.ts`, `components/storefront/chrome/NewsletterForm.tsx`, `WelcomePopup.tsx` | implemented | R-MK-05, R-PN-01 (c3-marketing\|popup-source-footer, c3-marketing\|consent-log-unlinked) | |
| MK-2 | Double opt-in confirmed by an explicit POST from the page (mail scanners opening the link confirm nothing); log row with `subscriberId`, and `userId` for a verified account; confirmation links do not expire (needs a schema column) | GDPR Art. 4(11), 7(1); spec §13.1 | `app/(storefront)/potrdi/[token]/page.tsx`, `components/storefront/TokenActionForm.tsx`, `lib/newsletter/subscriber-consent.ts` | implemented; expiry open | R-MK-01 (c3-marketing\|double-optin-on-get, c3-marketing\|doi-confirm-on-get) | |
| MK-3 | Withdrawal as easy as consent: signed unsubscribe link in the verification mail, `/odjava-novice/[token]`, the account toggle; each withdrawal logged; routes reachable during maintenance mode | GDPR Art. 7(3), 21(2)-(3); ZEKom-2 | `app/(storefront)/odjava-novice/[token]/page.tsx`, `lib/newsletter/unsubscribe-token.ts`, `app/(storefront)/actions/newsletter.ts`, `app/(storefront)/actions/address.ts`, `middleware.ts` | implemented; List-Unsubscribe and a per-message opt-out wait for the ESP (Phase 8B) | R-MK-02, R-MK-11, R-MK-12 (c3-marketing\|newsletter-no-withdrawal (area consent-log), c3-marketing\|newsletter-no-withdrawal (area privacy-rights); A\|I3.12) | |
| MK-4 | Welcome-popup incentive: the WELCOME10 code is applied at submit, before the double opt-in is confirmed | GDPR Art. 7(4) (freely given) | `WelcomePopup.tsx` (`applyKodaAction`) | open (lawyer, owner) | R-MK-04, R-MK-09 (c3-marketing\|popup-source-footer, c3-marketing\|welcome-popup-consent-capture) | |
| MK-5 | Checkout opt-in unticked; a ticked box creates a PENDING subscriber and sends the double opt-in mail; the log row carries the action, order number and `subscriberId` | GDPR Art. 7; ZEKom-2 (existing-customer exception is a lawyer question); spec §13.1 | `lib/orders/create.ts`, `lib/orders/checkout-subscription.ts`, `CheckoutWizard.tsx` | implemented (double opt-in); legal route and send timing open | R-MK-03, R-MK-10, R-MK-12 (c4a-checkout\|checkout-optin-divergence, c4a-checkout\|checkout-consent-version-literal; A\|I3.9, A\|I5.4, A\|I6.9) | |
| MK-6 | Registration opt-in, activation and account preference are logged per user with the wording version | GDPR Art. 7(1), 7(3) | `app/(storefront)/actions/auth.ts`, `app/(storefront)/actions/address.ts`, `lib/orders/post-purchase.ts` | implemented | R-MK-06 (A\|I3.6) | |
| MK-7 | Back-in-stock alert: double opt-in by POST, one-click unsubscribe link in the alert, both logged with `subscriptionId` | GDPR Art. 6(1)(a) or (b) (classification open), 7(3) | `app/(storefront)/actions/backInStock.ts`, `potrdi-zalogo/[token]`, `odjava-zaloga/[token]` | implemented; classification open | R-MK-07 (A\|I3.13) | |
| MK-8 | Review-request e-mail: sent after delivery regardless of the marketing choice, labelled "transakcijska pošta", no opt-out; skips anonymised orders | ZEKom-2; GDPR Art. 21(2) | `lib/jobs/review-requests.ts`, `lib/email/templates/review-request.ts`, `lib/copy/email.ts` | open | R-MK-08 (c6-gdpr-rights\|review-request-no-optout; A\|I6.11) | |
| MK-9 | Promise of "možnost testiranja novih izdelkov" as a sign-up inducement | UCPD Art. 6; GDPR Art. 4(11) (informed) | `lib/copy/footer.ts`, `lib/copy/newsletter.ts`, `welcomePopup` seed in `prisma/seed.ts` | open (left for the owner) | R-MK-13 (A\|I7.20) | |

## 12. Privacy notices at collection

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| PN-1 | Checkout contact step: notice on the use of the e-mail (order and continuing an unfinished purchase) with the privacy link, shown before the address is stored | GDPR Art. 12, 13 | `CheckoutWizard.tsx` contact step; `lib/copy/checkout.ts` `contact.emailNotice` | implemented; wording depends on D7 (owner decision pending) | R-PN-01, R-TC-08, R-TC-09 (c4a-checkout\|privacy-link-missing-at-collection, c4a-checkout\|abandoned-checkout-no-basis-retention; A\|I1.13) | |
| PN-2 | Footer newsletter form, welcome popup and registration show a short notice with the privacy link from `legal.links` | GDPR Art. 12, 13 | `components/storefront/PrivacyNotice.tsx` in `NewsletterForm.tsx`, `WelcomePopup.tsx`, `components/storefront/auth/RegisterForm.tsx` | implemented | R-PN-01, R-MK-06 (c3-marketing\|privacy-link-missing-at-collection; A\|I1.18, A\|I3.11, A\|I3.6) | |
| PN-3 | Contact, withdrawal and adverse-event forms: required acknowledgement with the privacy link; each form's wording version stored on the ticket | GDPR Art. 5(2), 13 | `lib/support/validation.ts` `PRIVACY_NOTICE_VERSIONS`, `lib/support/tickets.ts`, the three form components | implemented | R-PN-02, R-CL-05 (c5a-legal-texts-forms\|privacy-version-shared, fixed; A\|I4.15, A\|I4.19) | |
| PN-4 | Review form tells the author that the first name and initial are published | GDPR Art. 5(1)(c), 13 | `lib/reviews/display.ts`, `lib/copy/reviews.ts`, `components/storefront/reviews/ReviewForm.tsx` | implemented; wording open | R-RV-03 (c6-gdpr-rights\|review-author-full-name; A\|I6.39) | |
| PN-5 | The linked privacy policy actually describes each processing the notices point to | GDPR Art. 13 (layered notice) | See §3 | draft text | R-PR-01, R-AE-02 (A\|I4.19) | |

## 13. Prijava neželenega učinka (adverse events)

Route `/prijava-nezelenega-ucinka` (`app/(storefront)/prijava-nezelenega-ucinka/page.tsx`), form `components/storefront/support/AdverseEventForm.tsx`, action `app/(storefront)/actions/adverse.ts`.

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| AE-1 | Structured report; batch number or an explicit "unknown" (a report is never refused for a missing batch); not-an-emergency note with 112 | Reg. 1223/2009 Art. 23, 11 | `lib/support/validation.ts` `adverseInputSchema`, `lib/copy/adverse.ts` | implemented | R-AE-06 (c5a-legal-texts-forms\|adverse-batch-mandatory; A\|I1.16, A\|I4.11) | |
| AE-2 | Art. 9(2) condition for health data and a notice that matches it (the current text is an acknowledgement that mentions health data, not explicit consent) | GDPR Art. 9(1)-(2), 13, 14; Reg. 1223/2009 Art. 23 | `lib/copy/adverse.ts` `consent`; privacy version `adverse-t-…` on the ticket | draft text | R-AE-01, R-AE-02 (c5a-legal-texts-forms\|adverse-privacy-not-explicit-art9; A\|I4.12, A\|I6.40, A\|I1.2) | |
| AE-3 | Obligor named correctly (responsible person / distributor, not "manufacturer") and the competent authority referral | Reg. 1223/2009 Arts. 4, 6, 23 | Copy is role-neutral until the role is confirmed | open | R-AE-03, R-AE-08 (c5a-legal-texts-forms\|adverse-form-obligor-and-mailbox; A\|I7.22, A\|I7.23) | |
| AE-4 | Report routed to a working compliance mailbox | Reg. 1223/2009 Art. 23 | `lib/support/tickets.ts` to `support.contact.complianceEmail` (`skladnost@nasmeh.test`) | placeholder (G2) | R-AE-09 (c5a-legal-texts-forms\|adverse-form-obligor-and-mailbox; A\|I4.13, A\|I7.23) | |
| AE-5 | Serious undesirable effects triaged and escalated without delay | Reg. 1223/2009 Art. 23(1)-(2) | No "serious" marker or procedure (`lib/admin/tickets.ts` orders by status and date) | open | R-AE-07 (A\|I4.13) | |
| AE-6 | Need-to-know access to health data and photos: ticket pages require `tickets:view` (OWNER, SUPPORT); the photo route requires `tickets:view` and an enrolled second factor | GDPR Art. 5(1)(f), 9, 25, 32 | `app/api/support/attachments/[id]/route.ts`, `lib/admin/permissions.ts`, `app/admin/(shell)/podpora/[id]/page.tsx` | implemented; a narrower compliance role is open | R-AE-10 (c5b-cms-access\|attachment-route-any-staff-role; A\|I4.16, A\|I4.17) | |
| AE-7 | Choosing ADVERSE in the general contact form points to the structured form | Reg. 1223/2009 Art. 23; GDPR Art. 9, 13 | `ContactForm.tsx` | implemented; acknowledgement wording open | R-AE-04 (c5a-legal-texts-forms\|contact-form-adverse-and-withdrawal-bypass; A\|I4.14) | |
| AE-8 | Vigilance records vs erasure: anonymisation today deletes the clinical details and photos of every ticket | Reg. 1223/2009 Art. 11(2), 23; GDPR Art. 17(3)(b),(e) | `lib/admin/customers.ts` `anonymiseCustomer` | open | R-AE-05 (c6-gdpr-rights\|ticket-only-subjects-unreachable, c4b-confirmation-invoice\|anonymise-vs-invoice-retention; A\|I4.18, A\|I6.21, A\|I6.40) | |
| AE-9 | Staff notification carries clinical details by e-mail: mailbox provider security and DPA | GDPR Art. 28, 32 | `lib/email/templates/support-ticket.ts` (photos as authenticated links, not attachments) | open (G2) | R-AE-09, R-ID-03 (A\|I4.13) | |

## 14. GDPR rights and retention

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| DR-1 | Requests handled by e-mail at P1 with a documented procedure and the one-month deadline | GDPR Art. 12(3), 15-22 | Privacy §6; `docs/RUNBOOK.md` has no GDPR section | open | R-DR-01 (A\|I6.1) | |
| DR-2 | Staff export (JSON) of all data about a person: profile, addresses, cart, orders, reviews, tickets (attachment metadata), subscriptions, back-in-stock, checkout captures, coupon redemptions, consent records | GDPR Art. 15, 20 | `lib/admin/customers.ts` `exportCustomerData`; `/admin/stranke/[id]/izvoz.json` and the guest export | implemented | R-DR-02, R-DR-03, R-DR-04 (c6-gdpr-rights\|export-incomplete, c6-gdpr-rights\|export-missing-consents; A\|I6.2) | |
| DR-3 | People without an account or order (newsletter-only, ticket-only, checkout-capture-only) can be found, exported and anonymised | GDPR Art. 15, 17 | `lib/admin/customers.ts` `resolveCustomerSubject` | implemented | — (c6-gdpr-rights\|dsr-no-order-subjects, c6-gdpr-rights\|ticket-only-subjects-unreachable, fixed) | |
| DR-4 | Erasure by anonymisation: e-mail, name, password, addresses, tokens, cart, subscriptions, captures deleted or replaced; ticket e-mail deliveries and notes or refund reasons quoting the address scrubbed; order financials, invoice snapshot, legal acceptance, consent records and review content kept; a withdrawal row appended when the person was opted in | GDPR Art. 17(1), 17(3)(b),(e) | `lib/admin/customers.ts` `anonymiseCustomer` | implemented; reviews, staff notes and vigilance data open | R-DR-05, R-DR-06, R-DR-07, R-AE-05, R-IN-03 (c6-gdpr-rights\|anonymise-leftover-pii, c6-gdpr-rights\|anonymise-consent-proof, c3-marketing\|marketing-email-unlinkable; A\|I6.4, A\|I3.17) | |
| DR-5 | Rectification of account name and e-mail | GDPR Art. 16 | No staff or customer tool | open (not raised as a question; manual at P1) | — | |
| DR-6 | Scheduled retention for rows with no business decision attached | GDPR Art. 5(1)(e) | `lib/jobs/retention.ts` via `POST /api/jobs/daily` (host cron is gate G3, not scheduled yet) | implemented (partial; placeholder 30-day capture window) | R-TC-10 (c6-gdpr-rights\|no-retention-purge, c4b-confirmation-invoice\|abandoned-checkout-kept-after-purchase) | |
| DR-7 | Retention periods still undecided: never-verified accounts, pending subscriptions, back-in-stock rows after the alert or unsubscribe, closed tickets and photos, consent records, orders and invoices | GDPR Art. 5(1)(e), 13(2)(a); ZDDV-1; ZVPot-1 limitation periods | None | open | R-DR-08, R-CL-06, R-IN-02 (c6-gdpr-rights\|no-retention-purge; A\|I6.17) | |
| DR-8 | Backups: 14 daily and 8 weekly copies, unencrypted, with private ticket and review photos; erasures re-applied after a restore | GDPR Art. 17, 32 | `scripts/backup.sh`, `scripts/restore.sh`, `docs/RUNBOOK.md` | open | R-DR-09 (A\|I4.22, A\|I6.27) | |
| DR-9 | Logs hold no e-mail addresses (error class only); log retention stated | GDPR Art. 5(1)(c),(e), 32 | `lib/orders/post-purchase.ts`, CSP report route; `docker-compose.yml` rotation 10 MB × 5 | partially implemented; period open | R-DR-10 (c6-gdpr-rights\|logs-may-carry-emails) | |
| DR-10 | Accountability: who may export and anonymise (SUPPORT holds `customers:gdpr`), an audit trail, the Art. 30 register | GDPR Art. 5(2), 30 | `lib/admin/permissions.ts`; anonymisation leaves a trace only in order timelines | open | R-DR-11 (A\|I6.41) | |

## 15. Product claims (Reg. 655/2013, Reg. 1223/2009)

Gate D4 includes the claims sign-off (GENERAL_PLAN Phase 9 scope 3). Product copy is seed content (`prisma/seed.ts`, `prisma/seed-pdp.ts`), updated in existing databases by `20260913120000_phase9_claims_copy`; the real catalog (D2) replaces it before launch.

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| PC-1 | No study figures without an evidence file; remaining claims are qualitative, marked `*` and resolved in the "*Opombe k navedbam" accordion | Reg. 655/2013 Annex criteria 2-3; UCPD Art. 6 | `prisma/seed-pdp.ts`, `lib/copy/pdp.ts` | implemented (copy); evidence open | R-PC-01, R-PC-02, R-PC-10 (c7-claims\|unsourced-study-figures; A\|I7.3, A\|I7.4) | |
| PC-2 | Mechanism claims match the formula; "brez peroksida" checked against the final formula and the hydrogen-peroxide limit | Reg. 655/2013 criterion 2; Reg. 1223/2009 Annex III entry 12; Dir. 2011/84/EU | Strips copy in `prisma/seed-pdp.ts`, `prisma/seed.ts`, `lib/copy/catalog.ts` | implemented (mechanism text removed); formula open | R-PC-03, R-PC-08 (c7-claims\|strips-mechanism-without-active, c7-claims\|free-from-parabens-sls; A\|I7.1, A\|I7.5) | |
| PC-3 | Free-from claims fair (parabens, SLS, alcohol) | Reg. 655/2013 criterion 5; Commission Technical Document (2017) Annex III | Strips INCI note ("parabenov" removed, "SLS" remains), mouthwash bullet and INCI note ("brez alkohola") | open | R-PC-11 (c7-claims\|free-from-parabens-sls; A\|I7.2) | |
| PC-4 | Gentleness, sensitivity and enamel claims only with tolerance data | Reg. 655/2013 criteria 2-4 | Claims removed from seed copy; product title "Ustna voda za globinsko čiščenje" unchanged | implemented (removal); data and title open | R-PC-04, R-PC-09, R-PC-12 (c7-claims\|sensitivity-enamel-absolute-claims; A\|I7.6) | |
| PC-5 | Mouthwash duration, visible-proof and stain claims supported or removed | Reg. 655/2013 criteria 2-4 | `prisma/seed-pdp.ts` | implemented (removal); evidence open | R-PC-05, R-PC-06 (c7-claims\|mouthwash-12h-breath, c7-claims\|mouthwash-visible-proof; A\|I7.10, A\|I7.11, A\|I7.12) | |
| PC-6 | No permanence claim ("trajno") without durability data | Reg. 655/2013 criteria 2-3 | Serum page copy | implemented; one serum bullet for review | R-PC-13 (c7-claims\|permanent-whitening-claim; A\|I7.8) | |
| PC-7 | Qualifier travels with the claim: the hero cannot be saved with a `*` and no footnote; meta descriptions carry no unresolved `*` | Reg. 655/2013 criterion 6; UCPD Art. 7 | `lib/admin/cms-schemas.ts` `heroClaimLacksFootnote`, `components/storefront/home/HeroSection.tsx` | implemented | R-PC-14 (c7-claims\|unqualified-hero-and-meta-claims; A\|I7.14) | |
| PC-8 | Pregnancy and breastfeeding wording and other warnings from the CPSR | Reg. 1223/2009 Art. 10, Annex I | Strips FAQ (interim precaution) | draft text | R-PC-07 (c7-claims\|pregnancy-faq-wording; A\|I7.7) | |
| PC-9 | No medicinal presentation (borderline wording such as "bakterijski biofilm") | Reg. 1223/2009 Art. 2(1)(a); Dir. 2001/83/EC | Mouthwash copy (the biofilm sentence is no longer in the seed copy) | implemented; lawyer to confirm | R-PC-15 (A\|I7.13) | |
| PC-10 | Tagline, bestseller badge and collection placement are truthful ("Svetel nasmeh, naravno.", "USPEŠNICA", serum under "Beljenje") | Reg. 655/2013 criteria 2, 4-5; UCPD Art. 6(1)(b) | `lib/copy/common.ts`, `prisma/seed.ts` | open (left unchanged for owner and lawyer) | R-PC-16, R-PC-17, R-PC-21 (A\|I7.16, A\|I7.17, A\|I7.9) | |
| PC-11 | No HiSmile copy lines, including translations (project hard rule) | AGENTS.md hard rule; unfair competition (lawyer) | Seed copy, `lib/copy/home.ts`, placeholder SVGs, Phase 7 CMS migration default | implemented | R-PC-19, R-PC-20 (c7-claims\|hismile-copy-translations; A\|I7.25) | |
| PC-12 | Responsible person or manufacturer, and warnings, shown for each online offer | Reg. 1223/2009 Arts. 4, 5, 19; GPSR Art. 19 (applicability to confirm) | No product fields (`prisma/schema.prisma` `Product`) | open | R-PC-18, R-AE-08 (A\|I7.22) | |
| PC-13 | Bundle savings and free-shipping claims computed, not static text | UCPD Art. 6(1)(d) | PDP bundle box (`app/(storefront)/izdelek/[slug]/page.tsx`) | implemented | R-OM-06 (c7-claims\|bundle-static-price-claims, fixed) | |
| PC-14 | INCI list, nominal content and Annex compliance per SKU | Reg. 1223/2009 Art. 19(1)(g), Annexes III-V | Placeholder INCI in `prisma/seed-pdp.ts` | placeholder (D2, responsible person) | R-PC-03 (A\|I7.21) | |
| PC-15 | Seed content never reaches production; `db:seed` is never run against it | Reg. 655/2013; PID Art. 6a (demo price history) | `prisma/seed.ts` (upserts product copy and home settings) | open (process) | R-LT-04 (A\|I7.28) | |
| PC-16 | Consumer reviews: statement on whether and how reviews are verified; moderation and auto-publish threshold disclosed | UCPD Art. 7(6), Annex I points 23b-23c | `components/storefront/reviews/ReviewsSection.tsx`, `lib/copy/reviews.ts` "Kako preverjamo mnenja" | implemented; wording and threshold for review | R-RV-01, R-RV-02 (c6-gdpr-rights\|review-verification-disclosure; A\|I5.17) | |

## 16. Omnibus price-reduction display (Dir. 98/6/EC Art. 6a / ZVPot-1)

| # | Requirement | Legal basis | Where implemented | State | Open questions | Sign-off |
|---|---|---|---|---|---|---|
| OM-1 | Prior price = lowest price applied in the 30 days before the reduction started, anchored to the reduction and kept for its duration; compare-at-only edits do not create a price segment | PID Art. 6a(1)-(2); CJEU C-330/23; Commission Guidance 2021/C 526/02 | `lib/pricing.ts` `priceReduction`, `omnibusPriorPriceCents`, `OMNIBUS_WINDOW_DAYS`; `lib/omnibus.ts` `getPriceReductions`; `lib/price-history.ts` | implemented | R-OM-01, R-OM-02, R-OM-03 (c1-omnibus\|omnibus-window-anchor, c1-omnibus\|omnibus-compareat-row; A\|I5.10) | |
| OM-2 | A reduction is announced (strikethrough) only with a history-backed prior price; the compare-at value is only the switch | PID Art. 6a; UCPD Art. 6 | PDP buy box, `components/storefront/catalog/CatalogCard.tsx`, `app/(storefront)/cart/page.tsx` | implemented | R-OM-04 (c1-omnibus\|strikethrough-without-reference, c1-omnibus\|compareat-unvalidated; A\|I5.11, A\|I5.15) | |
| OM-3 | Every surface that shows a reduction shows the prior price (home, trgovina, search, PDP rails, cart rails; cart strikethrough per unit) | PID Art. 6a | `app/(storefront)/page.tsx`, `trgovina/page.tsx`, `iskanje/page.tsx`, `izdelek/[slug]/page.tsx`, `cart/page.tsx` | implemented | — (c1-omnibus\|cards-missing-omnibus, c1-omnibus\|cart-strike-unit-vs-line, fixed) | |
| OM-4 | Progressive reductions: continuous announced steps keep the pre-campaign reference | PID Art. 6a(5) (whether ZVPot-1 uses the option: to confirm) | `lib/pricing.ts` | implemented; option to confirm | R-OM-05 (c1-omnibus\|progressive-reduction-option; A\|I5.10) | |
| OM-5 | Scope of bundle "prihranite Z %", the WELCOME10 first-order code, public codes and promo badges (AKCIJA, PRIHRANI) | PID Art. 6a; UCPD reference-price rules | Bundle box, `welcomePopup` Setting, `Coupon` rows, `Product.badges` | open | R-OM-06 (c1-omnibus\|coupon-bundle-omnibus-scope; A\|I5.16) | |
| OM-6 | Coupon exclusion follows the same rule as the storefront display | Consistency; UCPD Art. 6 | `lib/promo/coupons.ts` | closed 2026-09-19: `discountableLines` excludes on `line.reduced` — the history-backed gate the shop renders (`withReducedFlags` → `getPriceReductions`), never a bare compare-at; `tests/unit/promo-coupons.test.ts` covers an excluded reduced line, a compare-at line that stays eligible and the flag deciding against a disagreeing compare-at | — | |
| OM-7 | TEST10 and the seeded demo price history never reach production | PID Art. 6a | `prisma/seed.ts` | open (process) | R-LT-04 (c1-omnibus\|coupon-bundle-omnibus-scope; A\|I7.28) | |

## Consent-log audit (2026-09-14)

**Script:** [scripts/consent-audit.sql](../../scripts/consent-audit.sql) (read-only: `SET default_transaction_read_only = on` before the first query, SELECT statements only). Sections: A integrity (version, choices object, per-kind required keys), B counts by kind and version and the cookie version against the Setting, C subject links by kind, dangling links and IP/user-agent minimisation, D withdrawals following grants per subject and stored state against the log, E rows of anonymised subjects.

**Command** (Git Bash, repository root):

```sh
for db in nasmeh_preview nasmeh_e2e; do
  PGPASSWORD=postgres /c/Users/Luka/.nasmeh-tools/pgsql/bin/psql.exe \
    -h ::1 -p 5543 -U postgres -d "$db" -X -v ON_ERROR_STOP=1 \
    -f scripts/consent-audit.sql
done
```

Run at 2026-09-14 08:35 UTC. Both runs exited 0 with `transaction_read_only = on`. Both databases are at 25 of 25 migrations (last `20260913120000_phase9_claims_copy`). Only these two databases were queried: the development database `nasmeh` (in use as a template by another process) and the scratch databases were not connected to. **No production database exists yet**, so there is no real customer data: the results describe the shape the write paths produce on seed and e2e data, not live proof of consent.

| Check | `nasmeh_preview` | `nasmeh_e2e` |
|---|---|---|
| Rows, time span | 1 row, 2026-09-09 20:25 | 125 rows, 2026-09-14 06:51–06:56 (UTC) |
| A1 non-empty version and choices object | PASS (0 empty version, 0 not an object, 0 empty object) | PASS (0 / 0 / 0) |
| A2 cookie rows carry boolean analytics and marketing | PASS (1 row; 0 with `ts`) | PASS (113 rows; all 113 with `ts`) |
| A3 per-kind keys, known kinds | PASS (no non-cookie rows) | PASS (12 non-cookie rows; 0 missing keys; 0 unknown kinds) |
| B1 kind / version (style) | cookie `1` (setting): 1 | cookie `1` (setting): 111; cookie `2` (setting): 2; marketing-checkout `t-e574331923db` (wording): 11; back-in-stock `t-df7578d4a10f` (wording): 1 |
| B2 cookie rows vs `consent.version` = 1 | 1 current, 0 other | 111 current, 2 at version 2 |
| C1 rows without user, consent id, subscriber or subscription | 1 (cookie, legacy shape) | 11 (all marketing-checkout, linked by order number only); cookie 113/113 with consent id; back-in-stock 1/1 with subscription |
| C2 dangling links | 0 | 4 rows whose order no longer exists; 0 subscriber, subscription or user |
| C3 IP / user agent stored | PASS (0 / 0) | PASS (0 / 0) |
| D1 withdrawals following grants | no linked rows | consent ids: 109 subjects, 7 with a grant, 3 withdrawal rows, all after a grant, 0 without one (2 now withdrawn, 5 now granted) — PASS; subscription: 1 subject, 1 grant, 0 withdrawals — PASS |
| D2 stored state vs log | 0 missing in every check | 0 missing (1 confirmed back-in-stock subscription has its row; no confirmed or unsubscribed subscribers; no opted-in users) |
| E anonymised subjects | none (0 users, 0 orders) | none (0 users, 0 orders) |

What the results mean:

- **The step 4 criterion passes.** Every stored choice on both databases carries a non-empty version and its categories (A1-A3), and `lib/consent-log.ts` rejects a row without them, so the property holds by construction for new rows, not only by observation of these rows.
- **`nasmeh_preview`** holds a single row: the pre-step-4 cookie refusal of 2026-09-09 20:25, the same single row the development database held in the 2026-09-13 audit. It has no consent id and no `ts` (legacy shape), so it cannot be attributed. Nothing has been logged there since step 4.
- **`nasmeh_e2e`** holds the rows of one Playwright run this morning. Every cookie row carries a consent id, and chaining works: one consent id carries a version 1 refusal followed by a version 2 refusal after the admin-settings bump test (the id survives the version change), and two consent ids show accept-all followed by narrower choices, which are the three withdrawals after a grant.
- **The missing-subject rows** on `nasmeh_e2e` are 11 guest checkouts with the box unticked (`marketing: false`, `action: not-given`): there is no account and no subscriber, so the order number is the only link, which is the intended design (the export reaches them through the order). Four of those orders were deleted by e2e cleanup, which is the C2 count; production never deletes orders (anonymisation keeps them).
- **Not exercised by this data:** account-linked marketing rows (registration, activation, preference), newsletter double opt-in and withdrawal rows, and anonymisation rows. The e2e specs delete user-linked rows during cleanup and neither database holds an anonymised subject, so the D and E queries for those paths returned empty sets. Their writers are covered by unit tests, not by this audit. Re-run the script on staging after one manual pass through each flow (step 5) and on production after launch.
- **Compared with the 2026-09-13 audit** (`nasmeh_phase9_step2_20260912`): 331 rows, none with any subject link, and every marketing row with the literal version `1`. After step 4, new cookie rows carry a consent id and marketing versions are wording fingerprints.
- **Re-run 2026-09-15** on `nasmeh_e2e` right after the acceptance browser suite (26 migrations, 125 rows): the same shape and every check PASS; details in the [step 4 record](phase-9-step-4-2026-09-15.md).
- **Still open:** no retention for consent rows (CL-6), no per-version snapshot of the banner and cookie table (CL-7), and no database CHECK constraint behind the write helper.

## Owner decisions pending

The first two were deliberately deferred by the owner on 2026-09-14 to the end of step 4.

### D7 — abandoned-checkout capture at checkout step 1

**Facts.** When a shopper continues from the contact step, `captureCheckoutEmailAction` (`app/(storefront)/actions/checkout.ts`) upserts an `AbandonedCheckout` row with the e-mail, the cart snapshot and the checkout key. The notice at that step (`lib/copy/checkout.ts` `contact.emailNotice`) says the e-mail is used for the order and for continuing an unfinished purchase. No code reads the row to continue anything and no recovery e-mail exists (ESP flows are Phase 8B; GENERAL_PLAN §4.1 D7 is open). The row is deleted when the order is paid (`lib/orders/transitions.ts`), by the daily retention job for converted checkouts and after `ABANDONED_CHECKOUT_RETENTION_DAYS = 30` (a placeholder, `lib/jobs/retention.ts`), and on anonymisation; the export includes it.

| Option | Consequence |
|---|---|
| A. Stop the capture | Remove the step-1 upsert and the "unfinished purchase" half of the notice; the retention step and export entry become inert. Nothing to justify in the privacy policy. |
| B. Keep the capture with an honest notice | Reword the notice to what actually happens (stored for a stated period, not used for e-mails); state purpose, legal basis (legitimate interest needs a balancing test) and the period in the privacy policy; confirm the 30-day window. |
| C. Build the reminder | A recovery e-mail to someone who did not buy needs a ZEKom-2 basis (the existing-customer exception is doubtful without a sale), an opt-out, and the ESP work pulled forward from Phase 8B. |

Register: R-TC-08, R-TC-09, R-TC-10, R-PN-01.

### GTM loading on marketing-only consent

**Facts.** `lib/analytics.ts` `gtmAllowed` loads the GTM container when analytics **or** marketing is granted (`GatedScripts.tsx`). With marketing only, Consent Mode sends `analytics_storage: denied`, so Google tags in the container may still send cookieless pings. The step 4 target (load on either consent) was followed against the audit verifier's preference not to change the gating; the question was left for the lawyer. No container is configured (`analytics.gtmId` is empty in every database).

| Option | Consequence |
|---|---|
| A. Analytics-only | Load GTM only after analytics consent. A marketing-only choice then has no effect until analytics is also granted; marketing tags still depend on the container honouring `ad_storage`. |
| B. Either consent, with container rules | Keep loading on either consent and require in the container that GA4 tags fire only when `analytics_storage` is granted (an additional consent check), and that every non-Google tag requires `ad_storage` or the `nasmeh_consent` marketing flag; commit the container export under `docs/` for the D4 review. |

Register: R-CK-08, R-CK-11.

### Other owner decisions

| Decision | Register |
|---|---|
| Guarantee terms: start date, channel, photo, limit, opened or used products | R-GU-01 |
| IRPS provider and participation stance; complaint-rejection procedure; response promise; a "defect" complaint reason | R-CO-01, R-CO-03, R-CO-04, R-CO-05 |
| Trader telephone number; return address (company address or a new field) | R-ID-02, R-ID-04 |
| Launch payment methods (Klarna) and delivery countries | R-TC-11, R-TC-12 |
| Checkout double opt-in mail at placement or at PAID; WELCOME10 before or after confirmation; account toggle display; who owns unsubscribe once an ESP exists | R-MK-09 to R-MK-12 |
| Tester programme, bestseller basis, HiSmile translation rule | R-MK-13, R-PC-20, R-PC-21 |
| Role under Reg. 1223/2009, responsible person, CPNP; compliance-only access to health data | R-AE-08, R-AE-10 |
| Who may mark pages reviewed and who may anonymise; Art. 30 register; log retention | R-LT-01, R-DR-10, R-DR-11 |
| Retention periods (with the lawyer): checkout captures, consent records, tickets, accounts, subscriptions | R-TC-10, R-CL-06, R-DR-08 |
| Store the rendered invoice PDF or its hash at issuance | R-IN-10 |
| Stripe receipt e-mails; Cloudflare DPA; Meta/TikTok at launch; pre-consent event replay | R-PR-08, R-PR-09, R-PR-11, R-CK-10 |
| Staff-only cookies in the public table; consent-version bump rule | R-CK-12, R-CK-13 |

## External inputs

| Input | Gate | Needed for | State on 2026-09-14 |
|---|---|---|---|
| Company data: registered name, seat address, matična številka, ID za DDV, telephone; registry court and share capital if the lawyer requires them | G4 | TC-1, TC-2, PR-1, WD-7, IN-1, OC-1 | Placeholders (`Nasmeh.si, d.o.o.`, `Trg nasmeha 1`, `0000000000`, `SI00000000`, no phone). `companyPlaceholderFields()` detects them; no go-live or health guard yet (R-ID-07). |
| Support and compliance mailboxes, hours, response promise, return address | G2 | WD-9, CO-1, AE-4, AE-9 | `podpora@nasmeh.test`, `skladnost@nasmeh.test`, "Delovni čas bomo objavili ob odprtju trgovine."; legal bodies name `info@nasmeh.si`; no return-address field. Staff recipients are fixed when a ticket is created. |
| IRPS provider and participation statement | D4 (owner and lawyer) | TC-9, CO-3, CO-4 | Not chosen. |
| Slovenian e-commerce lawyer | D4 | Every draft-text row and the lawyer questions in the register | Not engaged in this repository's record. |
| Accountant confirmation of invoicing | D4 | §9 | Not obtained: numbering gaps, content, retention, davčno potrjevanje, credit notes. |
| Responsible person / safety assessor: role and identity, CPNP, CPSR warnings, final INCI per SKU, evidence files for the remaining claims, tolerance data, peroxide status | D4 (with D2) | §13 AE-3, AE-6; §15 | Not provided; product copy is placeholder seed content. |
| Staging HTTPS cookie capture with live keys: Auth.js prefixed names, Stripe, PayPal and Turnstile storage, the GTM container's cookies; production table vs a browser dump at go-live | step 5 (G3), step 6 | CK-2, CK-4, CK-5, CT rows | Partly done in the step 5 rehearsal (https through a local proxy: the consent, maintenance and Auth.js CSRF cookies observed with their prefixed names); Stripe, PayPal, Turnstile and GTM cookies still need live keys on staging. |
| GTM container export and tag list | owner / operator | CL-9, CT-14, CT-15 | No container configured. |
| Launch payment methods, Klarna SI eligibility | D5, G1 | TC-5 | Open. |
| Hosting, CDN in front, off-site backup storage, SMTP and mailbox providers and their DPAs | G3, G2 | PR-3, DR-8 | Open. |
| Real catalog content and media replacing seeds | D2 | §15 | Open. |

## Appendix — Question register

All 303 questions from the audit (131 `A|` inventory questions) and the step 4 fixes (172 `F|` questions), grouped by topic and addressee. Duplicates are merged into one entry that keeps every reference. Where a question was asked before a step 4 fix, the entry says what is now built and asks for confirmation instead. Addressees: **Lawyer** (D4), **Owner**, **Accountant**, **RP** (responsible person or safety assessor), **Process** (a task, not a decision).

### Legal text control and go-live (R-LT)

| ID | To | Question | Refs |
|---|---|---|---|
| R-LT-01 | Owner | Who may set "Pravno pregledana", and what record accompanies the D4 sign-off (reviewer, date, text hash)? This checklist's sign-off column is proposed as that record; reviewedAt/reviewedBy columns would need a schema change and were not added. | A\|I1.10; c5b-cms-access\|reviewed-flag-not-bound-to-text |
| R-LT-02 | Owner | Pages the editable footer-pravno menu links to are protected from delete and rename only when they are fixed legal slugs or `legal.links` targets; a new legal page must be added to one of those (or `LEGAL_PAGE_SLUGS`). Accept? | c5b-cms-access\|legal-pages-deletable-renamable |
| R-LT-03 | Owner | Step 5: how do the reviewed legal texts reach the production database (a fresh migrate-deploy database has only the guarantee page)? Deployed databases need the cookie-policy page updated through admin or the data migration. Is an unreviewed draft with the public notice acceptable at launch? | A\|I1.19; c2-cmp\|policy-copy-necessary-list |
| R-LT-04 | Process | Go-live: confirm the production database is never seeded (the seed backdates Omnibus demo price history behind the serum "AKCIJA" badge, overwrites product copy and settings, creates demo accounts and the TEST10/WELCOME10 coupons); remove TEST10 before launch in any case. | A\|I7.28; c1-omnibus\|coupon-bundle-omnibus-scope |

### Terms and checkout (R-TC)

| ID | To | Question | Refs |
|---|---|---|---|
| R-TC-01 | Lawyer | Complete the pre-contract and e-commerce items missing from the terms: technical steps to conclude the contract (Kontakt / Dostava / Plačilo / Pregled), how input errors are corrected (review step), contract language, whether the contract is filed and accessible, governing law and home-law protection, an explicit ZVPot-1 legal-guarantee reminder beyond "reklamacije". | c5a-legal-texts-forms\|terms-content-gaps; A\|I1.1 |
| R-TC-02 | Lawyer | When is the contract concluded? §1 says placing the order, §4 the confirmation e-mail (sent only after payment); the first button reads "Naročilo z obveznostjo plačila" and creates the order, payment follows on "Plačaj naročilo". Reconcile, and confirm the two-click flow. | c5a-legal-texts-forms\|terms-content-gaps; A\|I1.1; A\|I5.1 |
| R-TC-03 | Lawyer | Is a passive notice directly above the order button enough to incorporate the terms (OZ general-terms rule, ECD Art. 10(3)), or is an explicit checkbox wanted? Is implied acceptance enough? A checkbox would be recorded on `Order.legalAcceptance`, not as a ConsentLog "terms" consent. | c4a-checkout\|legal-links-not-at-button; c4a-checkout\|terms-acceptance-not-recorded; A\|I5.3 |
| R-TC-04 | Lawyer | How close to the button must the Art. 8(2) essentials be? The recap and the terms/withdrawal links are now immediately above it (asked earlier: is a link in the collapsed previous step enough; on mobile, is a total-only line enough when the itemisation sits below). Is a privacy link required at the contact step (now present)? | c4a-checkout\|review-step-total-only; A\|I5.2; A\|I5.5; A\|I1.13 |
| R-TC-05 | Lawyer | Confirm the final review-step wording (terms-acceptance sentence and withdrawal notice; a consumer does not "agree to" the statutory right of withdrawal). | c4a-checkout\|checkout-legal-note-placement; A\|I1.13; A\|I4.6 |
| R-TC-06 | Lawyer | Is keeping versions of legal texts required, and what must the terms say about whether the concluded contract is filed and accessible (ZEPT / ECD Art. 10(1)(b))? | c4a-checkout\|no-legal-text-versioning |
| R-TC-07 | Lawyer | Should the terms state the delivery area? | A\|I5.6 |
| R-TC-08 | Lawyer | Checkout step-1 capture: legal basis for storing the e-mail and cart before an order; is the ZEKom-2 soft opt-in available for a recovery e-mail when no sale took place; purpose, basis and retention in the privacy policy; is the one-line notice adequate? | c4a-checkout\|abandoned-checkout-no-basis-retention; c6-gdpr-rights\|abandoned-checkout-no-basis-retention; A\|I5.8; A\|I6.18; A\|I1.2 |
| R-TC-09 | Owner | D7: will checkout-recovery e-mails ship at all? If not, capturing the e-mail and cart at step 1 is unnecessary: remove or gate it off? (Deferred to the end of step 4.) | c4a-checkout\|abandoned-checkout-no-basis-retention; c6-gdpr-rights\|abandoned-checkout-no-basis-retention; A\|I5.8 |
| R-TC-10 | Owner, Lawyer | Retention window for unconverted AbandonedCheckout rows (placeholder 30 days in `lib/jobs/retention.ts`), stated in the privacy policy with the pre-order capture paragraph. | c4a-checkout\|abandoned-checkout-no-basis-retention; c4b-confirmation-invoice\|abandoned-checkout-kept-after-purchase; c6-gdpr-rights\|no-retention-purge; A\|I5.8; A\|I6.18 |
| R-TC-11 | Owner | Which payment methods launch (D5; Klarna SI eligibility, G1), so the terms, checkout labels and footer icons match? | c4b-confirmation-invoice\|payment-delivery-copy-drift; c5a-legal-texts-forms\|terms-content-gaps; A\|I1.1; A\|I5.7; A\|I6.29 |
| R-TC-12 | Owner | Launch markets and countries served (shipping settings; Slovenia only?). | c5a-legal-texts-forms\|terms-content-gaps; A\|I5.6 |
| R-TC-13 | Process | The PDP delivery accordion (`lib/copy/pdp.ts`) hard-codes "2–4 delovnih dneh" and the 45 € threshold; build it from the shipping settings. | c4b-confirmation-invoice\|payment-delivery-copy-drift |
| R-TC-14 | Owner | ContentPageRevision (append-only body history) is deferred to the backlog; until then the body behind a stored sha256 is recoverable only from backups or seed history. Keep a versioned terms snapshot per order? | c4a-checkout\|terms-acceptance-not-recorded; A\|I5.3 |

### Privacy policy and processors (R-PR)

| ID | To | Question | Refs |
|---|---|---|---|
| R-PR-01 | Lawyer | Complete the Art. 13 items (legitimate interests, transfers, retention periods or criteria, statutory or contractual requirement, automated decisions, DPO statement) and cover accounts, reviews, tickets, adverse-event health data, back-in-stock, review requests, checkout capture, Turnstile, Klarna and the consent log. | A\|I1.2 |
| R-PR-02 | Lawyer | Processors paragraph: add Cloudflare, Inc. (Turnstile, bot protection, strictly necessary or legitimate interest, DPF transfer basis) and Meta/TikTok as consent-only recipients once configured; Stripe and PayPal as processor or independent controller; Klarna as its own controller; verify the claim that DPAs are signed with all of them (not extended to the new names). Review the Cloudflare/Meta/TikTok recipients against the cookie table. | c5a-legal-texts-forms\|policy-copy-necessary-list; c2-cmp\|policy-copy-necessary-list; c3-marketing\|turnstile-every-page; c3-marketing\|turnstile-preconsent-every-page; A\|I6.29 |
| R-PR-03 | Lawyer | "Hramba" must list every category with the period the code applies (auth tokens 30 days after use or expiry; converted checkout captures deleted; rejected-review photos removed). "Privolitve do preklica" does not match the code: consent rows stay after withdrawal and anonymisation, newsletter data is deleted on erasure. | c6-gdpr-rights\|no-retention-purge; c6-gdpr-rights\|anonymise-consent-proof; c2-cmp\|no-retention-rate-limit |
| R-PR-04 | Lawyer | Analytics is described as "anonimna statistika" (privacy policy, banner category, `_ga` row); GA4 cookies are pseudonymous. Change the wording. | c2-cmp\|cookie-table-incomplete; A\|I1.2; A\|I6.32 |
| R-PR-05 | Lawyer | The privacy or cookie policy should mention the pseudonymous consent id stored with each cookie choice. | c2-cmp\|consent-log-not-linkable |
| R-PR-06 | Lawyer | If Meta or TikTok run: disclosure and a joint-controller notice. | A\|I6.33 |
| R-PR-07 | Owner | Name the SMTP provider and the support and compliance mailbox providers (G2) and confirm the DPAs actually exist; confirm retention periods with the accountant. | A\|I1.2; A\|I6.34 |
| R-PR-08 | Owner | Accept Cloudflare's DPA. | c3-marketing\|turnstile-every-page |
| R-PR-09 | Owner | Stripe's own receipt e-mails: turn them off, or disclose them. | A\|I6.28 |
| R-PR-10 | Owner | Host, ISP or CDN in front, and the off-site backup storage provider (G3), for the processor list. | A\|I6.35 |
| R-PR-11 | Owner | Will Meta or TikTok run at launch, and through GTM? | A\|I6.33; A\|I2.14 |

### Cookies and CMP (R-CK)

| ID | To | Question | Refs |
|---|---|---|---|
| R-CK-01 | Lawyer | Must cookies exempt from consent be listed (they are), and must web-storage keys such as the sessionStorage flag `nasmeh_welcome_seen` be listed (it is)? Is that key exempt? | c2-cmp\|cookie-table-incomplete; A\|I1.3; A\|I2.12 |
| R-CK-02 | Lawyer | Do the columns and wording meet ZEKom-2 Art. 225 (is the category column sufficient; are first/third-party or legal-basis columns required)? Third-party payment rows name the provider only: list by provider with a link to the provider's policy, or name each cookie? | c2-cmp\|policy-table-hides-category; A\|I2.1; A\|I2.17 |
| R-CK-03 | Lawyer | Strictly-necessary classification of: `nasmeh_koda` (30-day coupon cookie, also set from a campaign link — necessary or attribution?), `nasmeh_cart` (30-day persistent guest cart, or session/shorter?), `nasmeh_order_*` (is 30 days proportionate?), the Stripe fraud-prevention cookies. | c2-cmp\|cookie-table-incomplete; A\|I2.7; A\|I2.8; A\|I2.9; A\|I2.16 |
| R-CK-04 | Lawyer | Is a 12-month consent validity acceptable for the Informacijski pooblaščenec, or should re-consent come sooner (e.g. 6 months)? | A\|I2.3 |
| R-CK-05 | Lawyer | Turnstile now loads only on form interaction (asked earlier: on every page before consent). Confirm the strictly-necessary exemption for a bot check loaded on interaction, and whether Cloudflare must be named as processor or recipient (row now in the table). | c3-marketing\|turnstile-every-page; c3-marketing\|turnstile-preconsent-every-page; A\|I2.15; A\|I6.31 |
| R-CK-06 | Lawyer | Is a filled primary "Sprejmi vse" next to an outline "Zavrni" acceptable prominence? | A\|I2.19 |
| R-CK-07 | Lawyer | Is active deletion of already-set analytics and marketing cookies on withdrawal required under ZEKom-2 Art. 225 / IP RS practice? It is implemented as good practice. | c2-cmp\|withdrawal-does-not-clear-cookies; A\|I2.20 |
| R-CK-08 | Lawyer | Are Google Consent Mode cookieless pings (tags loaded while a storage signal is denied) acceptable without consent? In particular, GTM loading on marketing-only consent sends pings with `analytics_storage` denied (owner decision pending). | c2-cmp\|withdrawal-does-not-clear-cookies; c2-cmp\|marketing-only-consent-never-loads-gtm |
| R-CK-09 | Lawyer | Review the necessary-cookie wording in the banner and the policy page and sign off the body and the table once it matches a real browser run on the production hostname; the corrected "Svoj izbiro" sentence must not come back in the redraft. | c2-cmp\|policy-copy-necessary-list; c5a-legal-texts-forms\|cookie-policy-typo; A\|I2.2; A\|I1.3 |
| R-CK-10 | Owner, Lawyer | Events from before the choice are dropped. Only if the business wants landing-page attribution back: would replaying them after consent be acceptable? | c2-cmp\|dataLayer-preconsent-replay |
| R-CK-11 | Owner | Supply the live GTM container export and tag list (GA4, Google Ads conversion linker `_gcl_au`, Meta `_fbp`, TikTok `_ttp`) with their categories. Every non-Google tag must require `ad_storage` or the `nasmeh_consent` marketing flag; commit the export under `docs/` for D4. The `_ga` and `_fbp` rows stay unverified until then; adding optional rows comes with a `consent.version` bump. | c2-cmp\|cookie-table-incomplete; c2-cmp\|marketing-only-consent-never-loads-gtm; c2-cmp\|gtm-marketing-gating; A\|I2.13; A\|I2.14 |
| R-CK-12 | Owner | Should staff-only cookies appear in the public table? (`nasmeh_preauth` is listed as staff only, as recommended.) | A\|I2.10 |
| R-CK-13 | Owner | Which changes count as material and trigger a `consent.version` bump (new vendor, new purpose, new policy text)? Bump when the table gains non-necessary rows at launch (runbook item). | A\|I2.22; A\|I3.4 |
| R-CK-14 | Process | Staging over HTTPS with live keys: capture the real third-party storage (Stripe `__stripe_mid`/`__stripe_sid` at the payment step, the PayPal iframe, Turnstile, possibly none) and replace the provider-only rows with names and lifetimes. | c2-cmp\|cookie-table-incomplete |
| R-CK-15 | Process | Staging HTTPS capture of the Auth.js names before sign-off: `__Secure-authjs.session-token`, `__Host-authjs.csrf-token` (only on a direct `/api/auth` hit), `__Secure-authjs.callback-url`. | c2-cmp\|cookie-table-incomplete; c2-cmp\|authjs-cookie-names-dev-only; A\|I1.3 |
| R-CK-16 | Process | Go-live: compare the production `consent.cookies` row (an admin edit makes the migration skip it) with a real browser cookie dump. | c2-cmp\|cookie-table-incomplete |
| R-CK-17 | Process | The seeded policy §4 now lists the columns including the category and says that the payment and bot-protection providers' rows are provider-level; confirm the wording. | c2-cmp\|policy-table-hides-category |

### Consent log (R-CL)

| ID | To | Question | Refs |
|---|---|---|---|
| R-CL-01 | Lawyer | Which fields must a consent record hold to count as proof (subject id, consent text version, timestamp, channel)? Is IP needed at all under data minimisation (not stored)? | A\|I3.1 |
| R-CL-02 | Lawyer | Is version + categories + timestamp + random consent id (+ userId when signed in) enough proof of cookie consent under GDPR Art. 7(1) / ZEKom-2 Art. 225, or more than needed because the id makes rows pseudonymous personal data? Is a per-row link to a device or user required at all? (Asked before the fix as: is an unlinkable aggregate log enough, or is a per-browser consent id expected.) | c2-cmp\|consent-log-not-linkable; c2-cmp\|cookie-consent-unlinkable; A\|I2.21; A\|I3.2; A\|I6.13 |
| R-CL-03 | Lawyer | Note on evidential weight: the id sits in an httpOnly cookie; a visitor who forges the cookie can choose the id their own rows are logged under (never anyone else's rows). | c2-cmp\|consent-log-not-linkable |
| R-CL-04 | Lawyer | Checkout and post-purchase marketing: is the version (now a wording fingerprint) plus the order number enough proof, or must the exact wording shown be kept? | A\|I5.24 |
| R-CL-05 | Lawyer | Is a timestamp plus a per-form privacy version enough evidence for a form's acknowledgement checkbox? | A\|I4.15 |
| R-CL-06 | Owner, Lawyer | Retention period for ConsentLog rows (cookie rows now carry a consent id; marketing rows link to users, subscribers and orders). Suggestion to confirm: the 12-month consent lifetime plus a limitation period after withdrawal. Should withdrawal or anonymisation end retention (`lib/admin/customers.ts` keeps consent records today)? Add a pruning step to the daily job and align the privacy text. | c2-cmp\|consent-log-not-linkable; c2-cmp\|no-retention-rate-limit; A\|I3.18 |
| R-CL-07 | Process | Keep a snapshot of the banner text and cookie table for each `consent.version`, so the log can show what each version presented. | c2-cmp\|cookie-consent-unlinkable |

### Marketing consent (R-MK)

| ID | To | Question | Refs |
|---|---|---|---|
| R-MK-01 | Lawyer | Is a Turnstile-protected explicit POST confirmation enough as double opt-in evidence, or should confirmation links also expire (needs a `confirmTokenExpiresAt` column, a schema change)? | c3-marketing\|double-optin-on-get |
| R-MK-02 | Lawyer | Is the info@ channel plus the self-service unsubscribe route enough before any marketing mail is sent? List-Unsubscribe / List-Unsubscribe-Post and a one-click opt-out per message are proposed as Phase 8B ESP acceptance criteria. | c3-marketing\|newsletter-no-withdrawal (area consent-log) |
| R-MK-03 | Lawyer | Single-checkbox marketing opt-in at registration or checkout without double opt-in, or the ZEKom-2 existing-customer soft opt-in for purchasers, versus spec §13.1 double opt-in (the code follows §13.1: a ticked checkout box starts double opt-in). | c3-marketing\|newsletter-no-withdrawal (area privacy-rights); c4a-checkout\|checkout-consent-version-literal; c4a-checkout\|checkout-optin-divergence; A\|I3.9; A\|I5.4; A\|I6.9 |
| R-MK-04 | Lawyer | The welcome popup couples sign-up with a discount code (operator-editable body) and the code is stored for checkout before double opt-in confirmation: is consent freely given, and is the incentive wording adequate? | c3-marketing\|popup-source-footer; c3-marketing\|welcome-popup-consent-capture |
| R-MK-05 | Lawyer | Should the operator-editable popup text shown at sign-up be recorded with the consent (a Subscriber column or an extra log row at submit)? | c3-marketing\|consent-log-unlinked |
| R-MK-06 | Lawyer | Is the registration checkbox "Želim prejemati e-novice in ponudbe (neobvezno)." specific and informed enough (a privacy notice now sits on the form)? | A\|I3.6 |
| R-MK-07 | Lawyer | Is a one-off back-in-stock alert a transactional service needing no marketing consent, as the copy "Brez vsiljivega marketinga" claims? | A\|I3.13 |
| R-MK-08 | Lawyer | Is the post-delivery review invitation direct marketing under ZEKom-2 / GDPR Art. 21(2)? If it relies on the existing-customer exception: one-click opt-out plus List-Unsubscribe and a different footer than "transakcijska pošta". Must checkout announce review invitations, and does the privacy policy need a purpose and legal-basis entry? | c6-gdpr-rights\|review-request-no-optout; A\|I6.11; A\|I1.2 |
| R-MK-09 | Owner | Issue WELCOME10 only after double opt-in confirmation? | c3-marketing\|popup-source-footer |
| R-MK-10 | Owner | Send the checkout verification mail at order placement (current) or only once the order is PAID, so unpaid orders enrol nobody? | c4a-checkout\|checkout-consent-version-literal |
| R-MK-11 | Owner | Should the account marketing toggle show "on" when a CONFIRMED Subscriber exists for the address? Today it reflects only `User.marketingOptIn`; posting false withdraws both. | c3-marketing\|newsletter-no-withdrawal (area privacy-rights) |
| R-MK-12 | Owner | Will the ESP own unsubscribe (its events then synced back into ConsentLog), or the store? Which store (User flag, Order flag, Subscriber) is authoritative once an ESP is connected? | A\|I3.12; A\|I3.9 |
| R-MK-13 | Owner | Will a tester programme exist at launch ("možnost testiranja novih izdelkov" in the newsletter copy and popup)? | A\|I7.20 |

### Privacy notices at collection (R-PN)

| ID | To | Question | Refs |
|---|---|---|---|
| R-PN-01 | Lawyer | Is the short layered notice at each form (checkout contact step, footer newsletter, welcome popup, registration) plus the footer link sufficient under GDPR Arts. 12–13, and what should the checkout notice say about unfinished-checkout capture? (Asked before the fix: the footer link alone, the newsletter note without a link, the popup with no notice.) | c3-marketing\|privacy-link-missing-at-collection; c4a-checkout\|privacy-link-missing-at-collection; A\|I1.18; A\|I3.11 |
| R-PN-02 | Lawyer | For the contact, withdrawal and adverse-event forms: is a required acknowledgement checkbox or a plain notice the right pattern? | A\|I4.19 |

### Withdrawal (R-WD)

| ID | To | Question | Refs |
|---|---|---|---|
| R-WD-01 | Lawyer | Redraft Odstop od pogodbe §1–3 on the Annex I(A) model: trader name, postal address and e-mail (not "naslov družbe"), telephone if wanted, the 14-day send-back deadline from the notice, where to return goods, return costs, diminished-value liability (Art. 14(2)), the ZVPot-1 article references. Does the current text meet Art. 6(1)(h)? | c5a-legal-texts-forms\|withdrawal-page-content-gaps; c5a-legal-texts-forms\|withdrawal-missing-annex-ia-elements; A\|I4.1 |
| R-WD-02 | Lawyer | The pre-step-4 wording "odpečateni oz. odprti" was wider than the Art. 16(e) exception; every surface (page §2, terms §7, form hint, PDF, PDP, checkout, confirmation, receipt) now uses one phrase in the words of Art. 16(e). Confirm it. Does each product (strips, mouthwash, serum) qualify as sealed for hygiene reasons? Can a bundle be partly withdrawn when some items are unopened? Confirm the exception wording used on the withdrawal page, PDP and checkout. | c5a-legal-texts-forms\|withdrawal-page-content-gaps; c4a-checkout\|checkout-agree-to-withdrawal-wording; A\|I1.4; A\|I4.5 |
| R-WD-03 | Lawyer | Sign off the final refund wording on the page, the form success panel, the receipt e-mail and the confirmation: 14 days from the notice plus the right to withhold until goods or proof arrive. | c5a-legal-texts-forms\|refund-deadline-anchor; c5a-legal-texts-forms\|withdrawal-refund-timing-wording; A\|I1.4 |
| R-WD-04 | Lawyer | May an online withdrawal form verify the order number and e-mail at all, or must it accept any unequivocal statement and verify afterwards (now: accepted and linked when it matches)? May a privacy checkbox be required before a statutory right is used? | c5a-legal-texts-forms\|withdrawal-form-rejects-unmatched-order; A\|I1.5; A\|I4.2 |
| R-WD-05 | Lawyer | Optional: add a sentence to the CMS body that withdrawal is possible before delivery (the form intro says it and the form supports goods not yet received). | c5a-legal-texts-forms\|withdrawal-received-date-mandatory; A\|I4.2 |
| R-WD-06 | Lawyer | Is the receipt e-mail (reference plus statutory note) a sufficient Art. 11(3) acknowledgement on a durable medium, or should it restate what was received and when? | A\|I1.5; A\|I4.4 |
| R-WD-07 | Lawyer | Is the acknowledgement for a withdrawal or cancellation sent through `/kontakt` adequate, or must it match the dedicated form's (RETURN/WITHDRAWAL tickets are now treated as withdrawal notices)? | c5a-legal-texts-forms\|contact-form-adverse-and-withdrawal-bypass; A\|I4.7 |
| R-WD-08 | Lawyer | Confirm the internal staff wording on withdrawal tickets. | c5a-legal-texts-forms\|staff-footer-withdrawal-misstatement |
| R-WD-09 | Lawyer | Approve the wording of the model-form PDF lines, including the added hygiene note. | A\|I1.6; A\|I4.3 |
| R-WD-10 | Owner | Does every product, and each item in the bundle, have a real hygiene seal? | A\|I4.5 |
| R-WD-11 | Owner | Are return instructions sent manually, and within what time? | A\|I4.4 |
| R-WD-12 | Process | The CMS body hard-codes info@nasmeh.si and cannot read `support.contact`, so the operator must keep them in step (the seller block is being rendered from the Setting in the review fixes). | c5a-legal-texts-forms\|withdrawal-page-content-gaps |

### Complaints and IRPS (R-CO)

| ID | To | Question | Refs |
|---|---|---|---|
| R-CO-01 | Owner, Lawyer | Name the IRPS provider(s) and whether Nasmeh.si commits to take part (ZIsRPS), or state that no provider is recognised; put it on `/reklamacije` §4, terms §9 and the written complaint-rejection reply. Exact ZIsRPS disclosure wording; confirm that no national ODR reference remains. | c5a-legal-texts-forms\|odr-link-stale; c5a-legal-texts-forms\|stale-odr-link-no-irps-provider; c5a-legal-texts-forms\|odr-link-obsolete; A\|I1.7; A\|I4.10 |
| R-CO-02 | Lawyer | Write the statutory conformity text and the ZVPot-1 complaint-handling deadlines and remedies wording (articles unsure); is a mandatory remote-troubleshooting step allowed? | A\|I1.7; A\|I4.8 |
| R-CO-03 | Owner | No complaint-rejection reply template exists; the provider and participation notice owed in a written rejection needs a support procedure or a template. | c5a-legal-texts-forms\|odr-link-stale |
| R-CO-04 | Owner | Can a one-working-day response be staffed? The real response promise and mailbox (G2). | A\|I1.7; A\|I4.8 |
| R-CO-05 | Owner | Add a "product does not conform / defect" complaint reason? | A\|I4.9 |

### 30-day guarantee (R-GU)

| ID | To | Question | Refs |
|---|---|---|---|
| R-GU-01 | Owner | One set of guarantee terms, written only on `/garancija-vracila-denarja`: whether the 30 days count from delivery or pickup (the PDP once said "od prevzema"); the single channel (Kontakt topic or e-mail); the photo requirement; limit per customer or per order and how many units; whether opened or used products qualify (the withdrawal-page exclusion of opened products applies only to statutory withdrawal). | c5a-legal-texts-forms\|guarantee-terms-inconsistent; c5a-legal-texts-forms\|guarantee-terms-contradict-and-point-to-withdrawal; c7-claims\|guarantee-inconsistent-conditions; c7-claims\|guarantee-terms-contradict-and-point-to-withdrawal; c7-claims\|guarantee-terms-inconsistent; A\|I1.8; A\|I4.20; A\|I4.21 |
| R-GU-02 | Lawyer | Is a satisfaction money-back promise a commercial guarantee (Dir. 2019/771 Art. 17 via ZVPot-1, article to confirm)? If so: guarantor name and address on the statement (company data is a business input), required content, and delivery on a durable medium (e.g. in the order confirmation). | c5a-legal-texts-forms\|guarantee-terms-inconsistent; c4b-confirmation-invoice\|order-confirmation-lacks-durable-medium-info; c7-claims\|guarantee-inconsistent-conditions; A\|I1.8; A\|I4.20; A\|I4.6; A\|I7.19 |
| R-GU-03 | Lawyer | "Jamstvo" vs "garancija" under ZVPot-1; was "ni nobenega tveganja" acceptable (removed from the PDP copy on 2026-09-13), and may any "no risk" wording stay given the buyer pays return postage? | c5a-legal-texts-forms\|guarantee-terms-inconsistent; c5a-legal-texts-forms\|guarantee-terms-contradict-and-point-to-withdrawal; c7-claims\|guarantee-inconsistent-conditions; A\|I4.21; A\|I7.19 |
| R-GU-04 | Lawyer | Sign off the single harmonised guarantee text once the owner decides the terms. | c7-claims\|guarantee-terms-contradict-and-point-to-withdrawal |

### Order confirmation (R-OC)

| ID | To | Question | Refs |
|---|---|---|---|
| R-OC-01 | Lawyer | Confirm the confirmation wording in `lib/copy/email.ts` `orderConfirmation.legal`: withdrawal summary, Art. 16(e) exception, return-cost sentence from the withdrawal page, legal-guarantee and complaints sentence, guarantee pointer; the final withdrawal text and return-cost rule. | c4b-confirmation-invoice\|order-confirmation-lacks-durable-medium-info; c4b-confirmation-invoice\|order-confirmation-no-withdrawal-info; c4b-confirmation-invoice\|confirmation-mail-missing-crd-info |
| R-OC-02 | Lawyer | Is the durable copy enough — a PDF of the current terms and withdrawal bodies plus the SHA-256 of the versions accepted at checkout, with a note when a body changed since — or must the exact accepted text be stored (a revision table)? Minimum content: full text inline or as PDF, model form attached? Must terms and withdrawal information go out on a durable medium at all (CRD Art. 8(7))? | c4b-confirmation-invoice\|order-confirmation-lacks-durable-medium-info; c4b-confirmation-invoice\|confirmation-mail-missing-crd-info; c4a-checkout\|legal-links-not-at-button; A\|I1.15; A\|I5.9; A\|I4.6 |
| R-OC-03 | Lawyer | Is a parcel insert an acceptable alternative or supplement to the e-mail confirmation? | c4b-confirmation-invoice\|order-confirmation-lacks-durable-medium-info |
| R-OC-04 | Lawyer | Does the checkout pre-contract information already rule out the Art. 10 (extended period) and Art. 14(1) (return costs) consequences? Not claimed either way in code or copy. | c4b-confirmation-invoice\|order-confirmation-no-withdrawal-info |
| R-OC-05 | Lawyer | Is the stockout path, which cancels a paid order and sends no confirmation, acceptable? | A\|I5.9 |

### Invoicing (R-IN)

| ID | To | Question | Refs |
|---|---|---|---|
| R-IN-01 | Accountant | Full or simplified invoice (the 100 € threshold); must B2C invoices carry the buyer's name and address (decides whether `invoiceSnapshot.buyer` is kept through anonymisation for the retention period); are net unit prices per line required; is this layout valid above 100 €? | c4b-confirmation-invoice\|invoice-regenerated-live; c4b-confirmation-invoice\|invoice-content-vat-base; c4b-confirmation-invoice\|anonymise-vs-invoice-retention; A\|I5.20; A\|I6.23 |
| R-IN-02 | Accountant | Retention period and article for issued invoices (believed ZDDV-1 Art. 141, 10 years); must the issued document stay reproducible unchanged; a retention job that deletes snapshots afterwards? | c4b-confirmation-invoice\|invoice-regenerated-live; c4b-confirmation-invoice\|anonymise-vs-invoice-retention; A\|I5.21; A\|I6.23; A\|I1.2 |
| R-IN-03 | Accountant, Lawyer | Which buyer data must survive erasure to keep issued invoices, withdrawal records and complaint records for their statutory periods? | A\|I6.4; c4b-confirmation-invoice\|anonymise-vs-invoice-retention |
| R-IN-04 | Accountant | Are gaps in the invoice series acceptable (order numbers allocated to unpaid or cancelled checkouts, invoice number = order number), or is a separate invoice counter assigned at PAID needed (no schema change)? Per-year reset (the year prefix uses server time, UTC)? | c4b-confirmation-invoice\|invoice-numbering-gaps; A\|I5.19 |
| R-IN-05 | Accountant | Does ZDavPR fiscal verification (ZOI/EOR, premises-device-sequence numbering) apply to Stripe card, Apple Pay, Google Pay, Klarna and PayPal web payments? This contradicts the assumption in `docs/NASMEH_FEATURES.md:62`. | c4b-confirmation-invoice\|invoice-numbering-gaps; A\|I5.22 |
| R-IN-06 | Accountant | Are credit notes (dobropis) required for full or partial refunds and withdrawals? None exist. | c4b-confirmation-invoice\|invoice-numbering-gaps; A\|I5.23 |
| R-IN-07 | Accountant | Is the invoice issued at payment an advance-payment invoice that needs a final invoice or a "datum opravljene dobave" at shipment? Is the supply date the payment date or the shipping date? | c4b-confirmation-invoice\|invoice-content-vat-base; A\|I5.20 |
| R-IN-08 | Accountant | Should the payment method and "Plačano" be printed? | c4b-confirmation-invoice\|invoice-content-vat-base |
| R-IN-09 | Accountant | Are the registry court and share capital needed on the invoice? | A\|I5.18 |
| R-IN-10 | Owner | Store the rendered PDF bytes or their sha256 at issuance (then add them to `scripts/backup.sh`)? The snapshot freezes the data, but a change to `lib/copy/invoice.ts` or the font would still change the rendering. | c4b-confirmation-invoice\|invoice-regenerated-live |

### Company identity and contact (R-ID)

| ID | To | Question | Refs |
|---|---|---|---|
| R-ID-01 | Owner | G4: registered company name, seat address, matična številka and ID za DDV before the first real invoice, entered at `/admin/nastavitve/davki-racuni` (feeds footer, invoice, withdrawal PDF, confirmation). | c4b-confirmation-invoice\|company-data-placeholders; c4b-confirmation-invoice\|company-placeholders; A\|I1.6; A\|I1.9; A\|I4.3; A\|I5.18 |
| R-ID-02 | Owner | Decide the trader telephone number and enter it. | c4b-confirmation-invoice\|no-telephone-number |
| R-ID-03 | Owner | G2: real support and compliance mailboxes, hours and response promise; does info@nasmeh.si stay the legal contact; which address receives withdrawals and complaints; the mailbox provider's DPA and TLS. | A\|I1.17; A\|I4.23; A\|I4.13 |
| R-ID-04 | Owner | G2: the return address. It may be the company address (still a placeholder); if it differs, a return-address field is needed (settings change). | c5a-legal-texts-forms\|withdrawal-page-content-gaps; c5a-legal-texts-forms\|withdrawal-missing-annex-ia-elements; A\|I1.4; A\|I4.1 |
| R-ID-05 | Lawyer | Which ZVPot-1 article transposes CRD Art. 6(1)(c)? Does a disclosed number without staffed phone support (the spec has no phone channel) meet the "contact quickly and communicate efficiently" rule? | c4b-confirmation-invoice\|no-telephone-number |
| R-ID-06 | Lawyer | Are the registry court, share capital (ZGD-1) and ZEPT identifiers required on the site, and is a separate impressum page advisable? | c4b-confirmation-invoice\|company-data-placeholders; A\|I1.9 |
| R-ID-07 | Process | Go-live check that `companyPlaceholderFields(company)` is empty (the helper exists; no `/api/health` guard was added). | c4b-confirmation-invoice\|company-data-placeholders; c4b-confirmation-invoice\|company-placeholders |
| R-ID-08 | Process | The terms and withdrawal bodies hard-coded info@nasmeh.si and "Trg nasmeha 1" with no phone and had to be edited when G4 lands; the seller block is being rendered from the company Setting in the review fixes — verify after G4. | c4b-confirmation-invoice\|company-data-placeholders; c4b-confirmation-invoice\|no-telephone-number |

### Adverse events (R-AE)

| ID | To | Question | Refs |
|---|---|---|---|
| R-AE-01 | Lawyer | Art. 9(2) basis for adverse-report health data: explicit consent (9(2)(a)) or a legal-obligation route under Reg. 1223/2009 Art. 23 with 9(2)(g)/(i) or 9(2)(f). If consent: explicit consent wording with its own version, and `contactPermission` becomes consent evidence. Should the notice cite Art. 6(1)(c) and mention onward notification to the competent authority (JAZMP)? May a report be refused without a batch number (now: never refused)? | c5a-legal-texts-forms\|adverse-privacy-not-explicit-art9; c5a-legal-texts-forms\|adverse-form-obligor-and-mailbox; A\|I1.16; A\|I4.12; A\|I6.40; A\|I1.2 |
| R-AE-02 | Lawyer | A privacy-policy section for product-safety reports: health data, purpose, recipients (compliance mailbox, responsible person, competent authority), retention of ADVERSE tickets, rights, and an Art. 14 note for reports by carers about someone else; link it from the form. Add the ticket and Turnstile sections as well. | c5a-legal-texts-forms\|adverse-privacy-not-explicit-art9; A\|I4.12; A\|I4.19 |
| R-AE-03 | Lawyer | Correct obligor wording ("odgovorne osebe oziroma distributerja" rather than "proizvajalca") once the role is known; should the form point to the Slovenian competent authority? | c5a-legal-texts-forms\|adverse-form-obligor-and-mailbox; A\|I4.12; A\|I7.23 |
| R-AE-04 | Lawyer | Should the contact-form acknowledgement mention health data when ADVERSE is selected; is the generic privacy text enough on that path (the form now points to the structured form)? | c5a-legal-texts-forms\|contact-form-adverse-and-withdrawal-bypass; A\|I4.14 |
| R-AE-05 | Lawyer, RP | Must ADVERSE and withdrawal tickets be kept under Reg. 1223/2009 Art. 23 / GDPR Art. 17(3)(b),(e)? Anonymisation deletes clinical details and photos for every ticket; if they must be kept, scrub only the contact fields. Retention for withdrawal, complaint and adverse records (ZVPot-1 limitation periods; Art. 11 PIF data; whether raw reports feed the safety report). | c6-gdpr-rights\|ticket-only-subjects-unreachable; c4b-confirmation-invoice\|anonymise-vs-invoice-retention; A\|I4.18; A\|I6.21; A\|I6.40 |
| R-AE-06 | RP | How are reports without a batch number handled in the SUE assessment (this changes the documented "batch number required" decision in phase-6.md:90 and GENERAL_PLAN.md:307)? Should age, sex and under-18 use be collected (relevant to the Dir. 2011/84/EU limits)? | c5a-legal-texts-forms\|adverse-batch-mandatory; A\|I1.16; A\|I4.11 |
| R-AE-07 | RP | SUE triage deadline and escalation; which Slovenian body is the competent authority (Ministry of Health, JAZMP or an inspectorate — confirm)? | A\|I4.13 |
| R-AE-08 | Owner | Nasmeh.si's role under Reg. 1223/2009 (manufacturer under Art. 2(1)(d) for an own brand, responsible person under Art. 4, or distributor), so the notice can name it. Who is the EU responsible person and the manufacturer; has the CPNP notification been done? | c5a-legal-texts-forms\|adverse-privacy-not-explicit-art9; c5a-legal-texts-forms\|adverse-form-obligor-and-mailbox; A\|I7.22 |
| R-AE-09 | Owner | The real compliance mailbox (G2, step 6 go-live checklist). Staff recipients are fixed at ticket creation, so tickets filed before the switch keep the .test address. | c5a-legal-texts-forms\|adverse-form-obligor-and-mailbox; A\|I4.13; A\|I7.23 |
| R-AE-10 | Owner | Should ADVERSE tickets and their attachments (likely Art. 9 data) need a compliance-only permission narrower than `tickets:view`, which SUPPORT and OWNER hold? Do SUPPORT staff need to see health data? | c5b-cms-access\|attachment-route-any-staff-role; A\|I4.16; A\|I4.17 |

### Data-subject rights and retention (R-DR)

| ID | To | Question | Refs |
|---|---|---|---|
| R-DR-01 | Lawyer | Is manual handling of access and portability requests by e-mail acceptable at launch if an internal procedure and deadline are documented? | A\|I6.1 |
| R-DR-02 | Lawyer | Art. 15(4): should staff-authored text be in the access copy (account adminNotes and tags are included; internal order notes, ticket internalNote and assignee, refund reasons and the order timeline are excluded)? Should staff e-mails in order timelines be redacted? | c6-gdpr-rights\|export-incomplete; A\|I6.2 |
| R-DR-03 | Lawyer | Must support photos be handed over as files in an access request? The export lists file names only. | c6-gdpr-rights\|ticket-only-subjects-unreachable |
| R-DR-04 | Lawyer | Cookie ConsentLog rows (consent id only) cannot be tied to a person, so no export contains them. Does GDPR Art. 11(2) make this acceptable? | c6-gdpr-rights\|export-missing-consents |
| R-DR-05 | Lawyer | After erasure, should minimal pseudonymous proof of past newsletter consent (subscriberId, confirmedAt, source) be kept, and for how long? Subscriber and BackInStockSubscription rows are deleted; ConsentLog rows stay with the pseudonymous ids (userId set null only if the user row is deleted). | c3-marketing\|marketing-email-unlinkable; c6-gdpr-rights\|anonymise-consent-proof; A\|I3.17 |
| R-DR-06 | Lawyer | After an erasure request, should the person's review be deleted, its photos removed, or its text replaced? Today text and photos stay published and only the account link is removed. | c6-gdpr-rights\|anonymise-leftover-pii; A\|I6.4 |
| R-DR-07 | Lawyer | Should internal staff notes and refund reasons that do not contain the e-mail but may hold other identifiers be blanked as well, or only flagged for staff review? | c6-gdpr-rights\|anonymise-leftover-pii |
| R-DR-08 | Lawyer, Owner | Retention periods not implemented because they need a decision: never-verified CUSTOMER accounts, PENDING newsletter and back-in-stock subscriptions, notified or unsubscribed back-in-stock rows, closed tickets and support photos (consumer-claim limitation periods), ConsentLog rows (not routinely purged), orders and invoices (ZDDV-1), rejected reviews. | c6-gdpr-rights\|no-retention-purge; A\|I6.17 |
| R-DR-09 | Lawyer, Owner | Backups: disclose backup retention in the privacy policy; is the backup tail after erasure (14 daily, 8 weekly) acceptable; approve a re-anonymise-after-restore procedure; must backups be encrypted given the health data and private photos? | A\|I4.22; A\|I6.27 |
| R-DR-10 | Owner, Lawyer | Write a log retention period in days in `docs/RUNBOOK.md` (Docker rotation is size-bound, 10 MB × 5) and decide whether the privacy notice must state it. | c6-gdpr-rights\|logs-may-carry-emails |
| R-DR-11 | Owner | Who may anonymise (SUPPORT holds `customers:gdpr`)? Is an Art. 30 register of processing kept outside the repository? | A\|I6.41 |

### Reviews (R-RV)

| ID | To | Question | Refs |
|---|---|---|---|
| R-RV-01 | Lawyer | Approve the "Kako preverjamo mnenja" wording and placement, and decide whether star-threshold auto-publish (`reviews.autoPublishMinStars` 4 or 5) may stay, since it treats reviews differently by rating (UCPD Annex I 23c). | c6-gdpr-rights\|review-verification-disclosure; A\|I5.17 |
| R-RV-02 | Lawyer | Add a matching review-policy paragraph to Pogoji poslovanja. | c6-gdpr-rights\|review-verification-disclosure |
| R-RV-03 | Lawyer | Public author name (now first name and initial instead of the full name): final wording of the notice, and the privacy-policy entry for public review display (name as shown, text, photos, rating, legal basis, retention). | c6-gdpr-rights\|review-author-full-name; A\|I6.39 |

### Product claims (R-PC)

| ID | To | Question | Refs |
|---|---|---|---|
| R-PC-01 | RP | For each remaining `*` claim, provide an evidence file (sponsor, independence, design, n enrolled vs analysed, dates, endpoints) or confirm the qualitative wording: strips and travel pack "Za svetlejši nasmeh*" / "Za svetlejši nasmeh po 14-dnevnem protokolu*"; mouthwash "Za občutek čistih ust*", "Za svež dah*", "Osveži dah*"; serum "Takojšen učinek*", "Optično svetlejši videz nasmeha*"; homepage hero "za svetlejši nasmeh*". | c7-claims\|unsourced-study-figures |
| R-PC-02 | RP | Do the consumer studies once quoted exist (strips n = 52 with 89 % / 96 %, where 89 % is reachable only with dropouts; mouthwash n = 48; serum sensory evaluation n = 40)? Who conducted them, and does "neodvisni" hold? Numeric results come back only with the report on file. | c7-claims\|unsourced-study-figures; A\|I7.4; A\|I7.9 |
| R-PC-03 | RP | Final INCI list, nominal content and Annex compliance for each SKU (the INCI list is itself a legal statement, Art. 19(1)(g)); the real strips and travel-pack actives and which mechanism claim, if any, can be substantiated (criteria 3–4); Annex IV conditions for CI 17200 and CI 42090 in oral products, the status of CPC, allergen labelling for Mentha Piperita Oil. | c7-claims\|strips-mechanism-without-active; A\|I7.5; A\|I7.21 |
| R-PC-04 | RP | Does the PIF hold tolerance-in-use or enamel data for each product? Only then may "primerno za občutljive zobe" or "nežno do sklenine" return, with a marker pointing to that data. | c7-claims\|sensitivity-enamel-absolute-claims; A\|I7.6 |
| R-PC-05 | RP | Supply the mouthwash consumer test report; does any breath-duration (the former "12 ur") or stain data exist? The INCI lists cetylpyridinium chloride, commonly linked to extrinsic staining: confirm that no anti-stain or whitening-maintenance claim is reintroduced. | c7-claims\|mouthwash-12h-breath; A\|I7.11; A\|I7.12 |
| R-PC-06 | RP | Lab evidence of what the visible mouthwash residue is (removed debris or product precipitate), or confirmation that the "visible proof" demonstration will not be used in any channel (Reg. 1223/2009 Art. 11(2)(d) proof of effect); the source of the "60 %" figure. | c7-claims\|mouthwash-visible-proof; A\|I7.10 |
| R-PC-07 | RP | Safety assessor: replace the interim pregnancy and breastfeeding precaution with the CPSR's warning wording, and supply any other warnings. | c7-claims\|pregnancy-faq-wording; A\|I7.7 |
| R-PC-08 | Lawyer, RP | Re-check "brez peroksida" against the final formula (Annex III entry 12 / Dir. 2011/84/EU; status of alternative oxidisers such as PAP). It appears in the strips SEO title and description, the chip, intro and INCI note, the travel-pack chip and bullet, the hero subtitle, `prisma/seed.ts` descriptions and `lib/copy/catalog.ts` `seoBlock.teaser`. Is it a fair free-from claim when H2O2 is lawful up to 0.1 %? | c7-claims\|strips-mechanism-without-active; c7-claims\|free-from-parabens-sls; A\|I7.1 |
| R-PC-09 | Lawyer, RP | The product title "Ustna voda za globinsko čiščenje" (and the bundle bullet naming it) still carries an unsubstantiated "globinsko čiščenje" efficacy term; left unchanged because the name is catalog/owner data. | c7-claims\|sensitivity-enamel-absolute-claims |
| R-PC-10 | Lawyer | Can a self-reported perception panel support "svetlejši nasmeh" efficacy wording, or only perception wording ("udeleženci so poročali …")? | c7-claims\|unsourced-study-figures; A\|I7.3 |
| R-PC-11 | Lawyer | Free-from claims under the fairness criterion and the 2017 Technical Document Annex III: "SLS" in the strips INCI accordion (asked earlier together with "parabenov", since removed: drop or justify); "brez alkohola" in the mouthwash bullet "Formula brez alkohola" and INCI note "Brez alkohola.". | c7-claims\|free-from-parabens-sls; A\|I7.2 |
| R-PC-12 | Lawyer | Is "občutljivi zobje" wording acceptable as a cosmetic claim, or does it lean towards a medicinal framing (dentine hypersensitivity)? Is "primerno za občutljive zobe" acceptable if supported? | c7-claims\|sensitivity-enamel-absolute-claims; A\|I7.6 |
| R-PC-13 | Lawyer | May the serum bullet "Za trajnejše rezultate: belilni trakci" stay (it compares with the serum's temporary effect)? Alternatives: "Za dolgotrajnejši učinek beljenja: belilni trakci" or neutral wording, with the spec line changed to match. Confirm removal of "trajno" unless durability data exist. | c7-claims\|permanent-whitening-claim; A\|I7.8 |
| R-PC-14 | Lawyer | May the hero carry an efficacy claim ("za svetlejši nasmeh*") at all, and is the "rezultati se lahko razlikujejo" footnote an adequate qualifier there? Is a qualifier in a collapsed accordion or a separate banner close enough to the claim? | c7-claims\|unqualified-hero-and-meta-claims; A\|I7.14 |
| R-PC-15 | Lawyer | Is the "bakterijski biofilm" wording acceptable for a cosmetic mouthwash? (No longer in the seed copy; confirm it should not return.) | A\|I7.13 |
| R-PC-16 | Lawyer | Does the site tagline "Svetel nasmeh, naravno." read as a natural-origin claim? | A\|I7.16 |
| R-PC-17 | Lawyer | Is listing a non-whitening colour corrector (serum) under the "Beljenje" collection acceptable? | A\|I7.9 |
| R-PC-18 | Lawyer | Does GPSR Art. 19 require the manufacturer or responsible person and warnings on each online offer (no product fields exist)? | A\|I7.22 |
| R-PC-19 | Lawyer | Non-blocking: is there residual IP or unfair-competition exposure from the short generic claim structures that remain ("Za svetlejši nasmeh*", a notes accordion under a claims marker)? | c7-claims\|hismile-copy-translations |
| R-PC-20 | Owner | Confirm that a translated HiSmile line counts as a copied line under the project hard rule (conservatively yes). | A\|I7.25 |
| R-PC-21 | Owner | What sales basis supports "USPEŠNICA" and "Naše uspešnice" at launch? | A\|I7.17 |

### Omnibus price reductions (R-OM)

| ID | To | Question | Refs |
|---|---|---|---|
| R-OM-01 | Lawyer | May the prior-price reference (strikethrough and 30-day line) stay unchanged for the whole of a reduction that runs longer than 30 days? The code keeps it fixed, per the Commission's 2021 guidance. | c1-omnibus\|omnibus-window-anchor |
| R-OM-02 | Lawyer | What to show for a product launched already discounted, or with under 30 days of history? The code uses the lowest price over the history that exists and shows nothing when the variant was created with a compare-at (single row). | c1-omnibus\|omnibus-window-anchor |
| R-OM-03 | Lawyer | The price was cut first and the compare-at added in a later save, possibly much later. The code anchors the window at the price cut (literal Art. 6a "application of the price reduction"). Is announcing a reduction for a price already in force for a long time acceptable under UCPD, or should the announcement date bound it? | c1-omnibus\|omnibus-window-anchor |
| R-OM-04 | Lawyer | May any reference price other than the 30-day prior price appear at all (e.g. a separately labelled RRP/PPC)? Keep the admin compare-at only as the switch, relabel it, or replace it with a labelled RRP? After C-330/23 the strikethrough is the prior price (implemented): confirm; may a compare-at ever differ from it? | c1-omnibus\|strikethrough-without-reference; c1-omnibus\|compareat-unvalidated; A\|I5.11; A\|I5.15 |
| R-OM-05 | Lawyer | Confirm the reference-price definition and that Slovenia used the PID Art. 6a(5) option (ZVPot-1 Art. 15 per a secondary source, racunovodstvo.net; check the paragraph against PISRS), and what counts as "neprekinjeno postopno zniževanje" (the code requires every step announced and the announcement never switched off between steps). | c1-omnibus\|progressive-reduction-option; A\|I5.10 |
| R-OM-06 | Lawyer | Art. 6a scope: the bundle line "vrednost {X} — prihranite {Z} %" (and the UCPD reference-price rules for it); the WELCOME10 first-order code ("10 % popusta na prvo naročilo"); public or generic codes such as TEST10; free-text promo badges (AKCIJA on the serum, PRIHRANI on the bundle) — should promo-style badges be limited to variants with a history-backed reduction? | c1-omnibus\|coupon-bundle-omnibus-scope; A\|I5.16 |
