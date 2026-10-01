# Exploratory QA pass — "click every path" (2026-09-29)

> **Status 2026-09-30:** every finding below is fixed and was re-verified in a real browser, apart from the owner decisions listed. The fixes, the three verification rounds (which found and fixed 24 further defects) and the gates are in the [QA fix pass record](qa-fix-pass-2026-09-30.md).

**Tree:** `main` at `8059d02` (no code changes in this pass). **Question asked by the owner:** with every step except post-launch done, does every function work as intended when a person actually clicks through it?

**Verdict:** the core paths work end to end — browse → cart → codes → checkout → test payment (success / SCA retry / failure) → order, stock, invoice and mails; accounts, support tickets, tracking, withdrawal, consent, Omnibus, back-in-stock, coupons, CMS, e-mail templates, settings, maintenance, roles and 2FA. The pass found **3 security/data defects to fix before launch, 16 major functional or spec defects, and about 60 minor, cosmetic and UX items**. None of them was caught by the 162 browser tests, because those tests encode the happy paths (for example they only submit reviews *with* a photo).

## How it was run

- **Build:** `next build` (standalone) with the e2e environment, i.e. the local **test payment driver** ("Testno plačilo — uspešno / Simuliraj SCA napako / Simuliraj neuspeh") and the Turnstile test token. Real Stripe/PayPal/Turnstile are gate G1 and were not exercised.
- **Four isolated servers** from the same build, each with a freshly migrated (29 migrations, no drift) and twice-seeded database. Admin tests that change settings (including maintenance mode) could therefore not disturb the storefront tests.
  - A `127.0.0.1:4317` / `nasmeh_qa_20260929` — shared storefront.
  - B `:4318` / `nasmeh_qa_ops` — admin operations and roles.
  - C `:4319` / `nasmeh_qa_cfg` — admin catalog and promotions.
  - D `:4320` / `nasmeh_qa_cms` — admin content and settings.
- **Mail and staff access:** Mailpit caught all mail. OWNER TOTP was enrolled through the real `/admin/2fa` screen on every server; per-tester OWNER staff on A were created through `/admin/ekipa`.
- **Testers:** seven parallel testers drove headless Chromium through Playwright scripts at 1440×900, 768×1024 and 390×844. Each had its own rate-limit bucket (`x-real-ip`). They clicked every control in their area, including error paths, and verified side effects in the database and Mailpit.
- **Lead's own checks:**
  - A live walk-through in Chrome.
  - A link crawl as visitor (43 pages), customer (41) and OWNER (78 admin pages). Every URL returned 200 with no console errors, no failed requests and no horizontal overflow at 1440 and 390.
  - Code verification of every major finding (marked ✔).

## Fix before launch (security and data)

| ID | Finding | Where | Evidence |
|---|---|---|---|
| **S1** ✔ | **Stored XSS.** CMS page bodies and product accordion HTML are stored and rendered unsanitised; `<script>` and `<img onerror>` executed on the storefront and in the admin preview. With `CSP_ENFORCE=false`, as it is now, any MANAGER (content/catalog permission) can run script in an OWNER's session on the same origin as `/admin`. Only e-mail overrides are sanitised (`lib/email/sanitize.ts`). | `app/(storefront)/[slug]/page.tsx:84`, `izdelek/[slug]/page.tsx:216`, `admin/(shell)/strani/[id]/page.tsx:38`, `odstop-od-pogodbe`, `reklamacije`, `politika-piskotkov`; save actions store the body unchecked | T7-F1, T6-04 |
| **S2** ✔ | **CSV formula injection.** A guest named `=HYPERLINK(…)` is exported as a live formula in the staff order export. | `lib/admin/orders.ts:166-169` (quotes, but does not neutralise a leading `= + - @`) | T5-04 |
| **D1** ✔ | **GDPR anonymisation destroys the order activity log.** `timeline: { push: … }` on a Json column stores `{"push":{…}}` instead of appending, so the admin "Časovnica" of every anonymised order is empty. | `lib/admin/customers.ts:454` | T5-09 |

## Major

| ID | Finding | Where | Evidence |
|---|---|---|---|
| **M1** ✔ | **A review without a photo can never be submitted.** It always fails with "Dovoljeni so samo JPG, PNG in WebP." The empty file input arrives as a 0-byte File named `blob`, and the filter skips only `size 0 && name ""`. Most reviews have no photo. | `app/(storefront)/actions/reviews.ts:65` | T3-R1 (6 repros) |
| **M2** ✔ | **The order-confirmation e-mail omits the discount,** so its lines do not add up (34,99 + 19,99 + 0,00 → "Skupaj 49,48 €"). The page and invoice are correct. | `lib/email/templates/order-confirmation.ts:106-131`, `lib/email/mailer.ts:166-170` | C2-F11 |
| **M3** | **Refund-required orders cannot be resolved.** A captured stock-out becomes CANCELLED + `refundRequired`, but its detail page offers only notes, `planRefund` refuses CANCELLED, and the "Naročil, ki čakajo na vračilo denarja" banner can never clear. The step 2 record says to cancel from the detail screen. | `OrderActions.tsx:44,76-77`, `lib/orders/refunds.ts:27,83,334` | T5-07 |
| **M4** ✔ | **`/trgovina` ignores the Collection records.** Tabs are hard-coded (all/beljenje/paketi), a new collection never gets a tab (`?kolekcija=<new>` shows everything), and banners, hide-text, SEO title/description and noindex are never read. The page title is always "Trgovina". Renaming the `paketi` slug silently empties the tab and the header link. | `app/(storefront)/trgovina/page.tsx:13-17,23,76-85` | L11, T1-08, T6-01 |
| **M5** ✔ | **The bundle "Aktiven" switch has no effect.** An inactive bundle is still listed and sold. `Bundle.active` has no reader. | catalog/cart/checkout | T6-05 |
| **M6** | **Bundle availability ignores component stock.** With the serum at 0, the bundle is still listed as InStock and addable; it fails only at "Izdelek ni več na zalogi" when the order is placed. | `lib/catalog.ts:175`, PDP `page.tsx:109` | T6-02 |
| **M7** | **"Skriti akcijski SKU (samo oznaka)" makes a product unbuyable while it stays listed.** The add fails with "Dodajanje ni uspelo." | `lib/cart/visibility.ts:10` | T6-03 |
| **M8** ✔ | **Search relevance.** `customFields::text` matches cross-sell slugs and JSON keys, and results are ordered by `createdAt`. "serum" puts the strips first and the serum third; "trak" returns all 5 products. | `lib/search.ts:47,84` | L7, T1-01 |
| **M9** ✔ | **Admin layout collapses to one column.** `--breakpoint-sm/xl: initial` kills all 23 `sm:`/`xl:` utilities in 15 files: the dashboard is about 3,750 px of full-width cards, and the order/customer/ticket/product/coupon/page detail screens are affected too, as are 2 storefront pages. | `app/globals.css:105,108` | T5-01, L2 |
| **M10** ✔ | **Unpaid orders read "V obdelavi".** Admin lists, detail, customer screens and `/racun` all use the customer wording: PENDING → "V obdelavi", PROCESSING → "V pripravi", REFUNDED → "Povrnjeno". The admin filter/dashboard say "Čaka na plačilo" and "V obdelavi", and the processing mail says "v obdelavi". The account also offers no pay/retry for an unpaid order. | `lib/copy/account.ts:20-28` via `OrderStatusPill` | T5-03, T3-S2 |
| **M11** | **Checkout validation dead ends.** An e-mail without a TLD passes step 1; the quote then fails and the rail says "Za izbrano državo dostava še ni na voljo." with no hint. An invalid phone, a blank name or over-long values only give "Naročila ni bilo mogoče ustvariti", with no field marked. | `CheckoutWizard.tsx:154-168,186-194,268,398-405`, `lib/orders/quote.ts:12` | C2-F8, C2-F9 |
| **M12** | **Signed-in checkout prefills only the e-mail.** Name and the default address are not filled in, and the address book is used nowhere. | `checkout/page.tsx:28`, `CheckoutWizard.tsx:113-115` | T3-S1 |
| **M13** | **The hero video slot is unusable.** The CSP has no `media-src`, so an external video is blocked once CSP is enforced; the media library accepts images only, so a video cannot be supplied without a deploy. | `lib/security/headers.ts`, `lib/admin/media.ts:16` | T7-F5 |
| **M14** ✔ | **Confirmations appear outside the viewport.** The success card of `/kontakt`, `/odstop-od-pogodbe` and `/prijava-nezelenega-ucinka` (with the reference the user must keep) renders above the viewport. The `/sledi` result, error and "Preverjamo…" render below both forms. There is no scroll and no focus move. | `ContactForm.tsx:126-134`, `WithdrawalForm.tsx:52-61`, `AdverseEventForm.tsx:73-80`, `TrackingLookup.tsx:124-136` | T4-F1, T4-F2 |
| **M15** | **An adverse-event report's claimed order number is invisible to staff.** A number that does not match the e-mail is kept only in `details.claimedOrderNumber`; neither the compliance mail nor the admin detail shows it. | `lib/support/tickets.ts:73-78`, `lib/copy/support-email.ts`, `support-ticket.ts:55-64` | T4-F3 |
| **M16** | **Utility-menu edits never appear.** The header and drawer show only the hard-coded "Prijava". | `SiteHeader.tsx` (no `getMenu("utility")`), `MobileDrawer` | T7-F2 |

## Minor bugs

- **Cart and checkout**
  - The cap notice always reads "Največ 5 kosov na naročilo", even for caps of 3 or 1 (`CartLineControls.tsx:86-90`) — C2-F1, T6-06.
  - The checkout rail empties while the e-mail is being typed — C2-F7.
  - Over €45, only the selected shipping method shows 0,00 €; the others show their normal prices — C2-F10.
  - An unknown `/koda` while a code is active shows "Koda ni veljavna." under the active code, and the flag survives reloads — C2-F2.
- **Sign-in and accounts**
  - Sign-in never returns to the requested page: `callbackUrl` is ignored and users always land on `/racun` (`prijava/actions.ts:16`), including from the order mails' "Poglej naročilo" link and the checkout account hint — T3-F1, C2-F12.
  - The login form empties both fields after a failure — T3-F2.
  - A used activation link leads to re-registration, which sends nothing for a verified e-mail — T3-F5.
  - `/racun/podatki` has no way to change name or password, accepts a phone "abc" and SI postal code "0999", and deletes addresses without confirmation — T3-A1.
- **Reviews**
  - An expired or invalid star link shows a bare 400 text page — T3-R2.
  - Oversized photo batches give a misleading error, and the 2 MB/photo cap refuses typical phone photos — T3-R3.
  - The average shows "3.0" instead of "3,0"; "Pokaži več" never becomes "Pokaži manj".
- **Support**
  - The adverse form accepts future dates (`lib/support/validation.ts:149,152`) — T4-F4.
  - Adverse reports are listed under the admin order's withdrawal wording — T4-F5.
  - Generic server errors on the adverse, withdrawal and registration forms — T4-F6, T3-F4.
  - An ADVERSE report sent via `/kontakt` gets a receipt without the safety note — T4-F8.
  - `/sledi` without JavaScript does nothing — T4-F9.
- **Headings and modals**
  - The unlayered `h1,h2,h3` rule overrides Tailwind utilities (`app/globals.css:202-208`): "Naši paketi" renders dark on teal, and the `font-semibold` headings render at 300 — T1-02.
  - The `/trgovina` sort `<details>` stays open after a choice — T1-03.
  - The search overlay, "Obvestite me" modal and welcome popup lack a focus trap/return, and the popup ignores Esc — T1-04, T1-05, T1-10.
- **Catalog display**
  - The product "Opis" is never shown on the PDP, and with no SEO description the meta/og/JSON-LD description carries raw escaped markup — T6-07.
  - Duplicate "RAZPRODANO" badges; the seeded badge persists after restock (and "Razprodano" is hard-coded) — T1-13, T6-09.
  - The PDP rating count shows twice, "(2) (2)" — T1-12.
  - `/iskanje` cards miss badges, stars, unit price and the bundle CTA, and the count reads "1 izdelkov" — T1-06, T1-18.
  - The sticky buy bar lacks unit price and quantity, and covers the footer's last line — T1-11.
  - The home rail shows dead ‹ › arrows over the first card — T1-17.
  - Mega-menu images are blank on first open (lazy loading) — L6.
- **Media library**
  - Images used inside product HTML count as unused and can be deleted (`lib/admin/cms.ts:115-132`) — T6-08.
  - Three 3.6 MB uploads fail on the 10 MB body limit, although the UI advertises "4 MB, 8 at once" — T7-F6.
- **SEO**
  - The home `<title>` is "Nasmeh.si | Nasmeh.si" and the description has 23 characters — L1, T7-F8.
  - The SEO default description is not applied (`lib/seo.ts`) — T7-F7.
  - The default OG image is an SVG, which social platforms don't render — T1-16.
  - The 404 title changes to "Nasmeh.si" after hydration — T1-15.
  - `/trgovina` has no `<h1>` (B24, still open), and its visible heading is baked into the banner image — L8, T1-07.
- **Menus and footer**
  - Footer column titles ignore the menu name — T7-F3.
  - The footer ignores the legal-link mapping — T7-F21.
  - Featured cards are not validated and are cut to 2 — T7-F4.
  - The marquee's seeded link goes to `/checkout`, an empty-cart dead end — T1-19.
  - The footer "Paketi" goes to the bundle PDP while the header one goes to the collection — T1-19.
- **Hero, popup and maintenance**
  - A mobile-only hero video shows nothing (`HeroSection.tsx:58`) — T7-F13.
  - The popup shows on `/prijava` and re-shows each session to a subscribed guest; its admin has no % field or suppression config — T7-F14.
  - Maintenance with an empty message shows no default text — T7-F9.
- **Admin**
  - `%` and `_` act as wildcards in order and customer search — T5-06.
  - The refund "cents" field reads "-2.00" as −2 cents — T5-08.
  - Refusals show generic "Ni uspelo" messages, and the anonymise refusal appears at the notes button — T5-10, T5-11, T7-F22, T6-11.
  - Chart x-labels overlap — T5-02.
  - Image and library deletes have no confirmation, and the post-delete messages are wrong — T6-12.
  - Order numbers and dates wrap in the tables — T4-F11.
  - The CSV totals are text, with UTC dates — T5-05.
- **Hardening**
  - The login limit counts successful sign-ins and is keyed per address from any IP: 10 wrong passwords lock a customer out for 15 min (`lib/auth-credentials.ts:68-70`) — T3-F3.
  - The `/kontakt` order lookup has no rate limit, unlike `/sledi` — T4-F7.
  - A maintenance unlock cookie survives a password change — T7-F10.
- **Conventions**
  - Motion rule (AGENTS §8.23): box-shadow and `left`/`top` are animated directly, and one duration is 700 ms (`RoutineBanner.tsx:16,23`, `CatalogCard.tsx:49`, `CmpBanner.tsx:154`, `UiInput.tsx:45`) — L5.
  - The sort URL slugs `cena-vzpadno` and `cena-padajco` are misspelt; rename them before links spread — L10.
  - Disabled "Google / Facebook — Socialna prijava kmalu" buttons show on every auth page, including forgot-password, although they should stay hidden until configured — T3.

## Spec gaps and decisions for the owner

These are deviations that work as coded but differ from `docs/NASMEH_FEATURES.md`. Some are already recorded.

- Checkout has no Klarna recap (§8.2), untestable while Klarna is off — C2-F13.
- The bundle builder shows "s kodo PAKET20" without the terms sentence (§9.1) — C2-F14.
- The free-shipping bar's "empty" state can never render — C2-F3.
- The routine banner's headline must be baked into the image (§4.4/§15) — L4.
- The product editor has no template picker, drag-sort, auto-slug, list sort or draft preview (§14.2, §14.15) — T6-13.
- Home sections are ordered with up/down buttons, not drag — T7-F17.
- `/kontakt` is noindex (deliberate per `app/sitemap.ts`) — L9.
- Shipping uses one global threshold with flat prices (a recorded step 6 deviation) — T7-F19.
- No payment-failed, withdrawal-confirmed or welcome mails (a recorded step 5 deviation) — T7-F23.
- The invoice has no supply date (ZDDV-1 Art. 82) and prints the country as "SI"; the accountant should confirm — C2-F20.
- Legal and contact placeholders (company identity, hours, IRPS provider) belong to open gates G2, G4 and D4 — T4-F12.

## Coverage (all PASS unless listed above)

- **Tester 1 — storefront:**
  - Header, mega-menu and mobile drawer (keyboard, focus trap).
  - Search.
  - `/trgovina` tabs and the 6 sorts.
  - Card anatomy and computed hooks.
  - 5 PDPs (accordions server-rendered, footnotes, stepper limits, trust row = Setting).
  - Back-in-stock double opt-in.
  - Home.
  - 25 footer links.
  - Newsletter double opt-in and unsubscribe.
  - CMP: Consent Mode v2 default denied with nonce, one row per choice, no IP/UA, zero tags before consent, cookie table.
  - Welcome popup.
  - 404 and the 308 legacy redirects.
  - Legal pages.
  - SEO on 25 URLs.
  - JS-disabled rendering.
  - 3 viewports × 11 pages.
- **Tester 2 — revenue path:** orders NS-2026-00011…16.
  - Every add-to-cart surface and the confirmation card.
  - Caps and the partial add.
  - Bundle builder prices = cart.
  - Cart bar/VAT maths.
  - All codes and exclusions, no stacking, WELCOME10 once per e-mail.
  - Guest checkout.
  - Test-driver success/SCA/failure, double-click idempotency.
  - DB snapshots, component stock deducted once, abandoned-checkout row lifecycle.
  - Mails and the invoice PDF.
  - Merge-on-login 4 + 3 = 5.
  - Cookie/action tampering.
  - Mobile flow.
- **Tester 3 — accounts and reviews:**
  - Registration and activation.
  - Login and its rate limit.
  - Reset without account enumeration.
  - Dashboard and order cards.
  - Staff transitions with mails.
  - Order detail and invoice access control.
  - Address book.
  - The review job, star links, moderation, PDP display and AggregateRating JSON-LD.
- **Tester 4 — support:**
  - 9 topics × 29 sub-reasons → tickets with correct routing and receipts.
  - Photo pipeline (WebP, EXIF stripped).
  - Idempotency.
  - `/sledi` (both modes, carriers, limit).
  - Withdrawal form and PDF.
  - `/reklamacije` and the guarantee page.
  - Admin inbox.
  - Attachment access control.
- **Tester 5 — admin operations:**
  - Dashboard KPIs = DB.
  - Orders list, filters and CSV.
  - Transitions with server validation.
  - Notes.
  - Refunds (partial/full, restock, idempotent).
  - Cancel.
  - Customers, GDPR export (no secrets), anonymise refusal/success.
  - Tickets.
  - Roles: 42 URLs × 3 roles match `lib/admin/permissions.ts`; 9 forbidden Server Actions called directly were all refused.
  - Revoke/reset-2FA/demote, and the single-use recovery code.
- **Tester 6 — admin catalog:**
  - Product create/edit validation.
  - Variants and PriceHistory.
  - Images.
  - Status and visibility.
  - NOTIFY/HIDE, backorder, max quantity.
  - Omnibus: floored %, reference from history, 24 h grace.
  - Restock alerts and manual send.
  - Collections admin.
  - Bundle edit and sale.
  - 4 coupon types with windows, limits and eligibility; QR; redemptions.
  - Media library.
- **Tester 7 — admin content and settings:**
  - 37 screens.
  - Home editor and banners.
  - Marquee, popup, bundle.builder.
  - Pages and the 6 protected LEGAL pages.
  - Navigation.
  - All e-mail templates (sanitised overrides, test-send, broken override still sends).
  - Shipping per country.
  - VAT and company → footer/invoice snapshot.
  - Marketing: GTM only after consent, index switch, consent version re-ask.
  - Maintenance gate.
  - Support settings.
  - Team and own-account 2FA/recovery codes.

**Not exercised:**
- Real Stripe, PayPal, Klarna and Turnstile (gate G1).
- Real SMTP failure and retry.
- HEIC photos.
- Token expiry windows (24 h, 1 h, 30 days).
- Pagination (fewer than 50 rows).
- Non-SI shipping on A.
- Lighthouse (not affected).

## State left behind (disposable QA databases only)

A–D hold test orders, tickets, reviews, subscriptions and QA staff. On B, `customer@nasmeh.si` is anonymised. On C and D, settings were edited and then restored as each tester reports; maintenance is off on D. The development database `nasmeh` was not touched, and no code was changed; this record is the only repository change.
