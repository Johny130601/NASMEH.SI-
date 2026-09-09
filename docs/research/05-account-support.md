# HiSmile Research 05 — Customer Account, Login/Register & Support Surfaces

**Research date:** 2026-09-09
**Method:** Direct fetch + raw-HTML analysis + de-minified front-end JS bundles (Vue SPA chunks), public API endpoint checks, DNS records, web search. Because the storefront is a client-rendered SPA, most concrete detail below comes from reading the actual shipped Vue components (quoted class names, copy and endpoints are verbatim from their bundles).

---

## 0. Critical orientation: the domain is NOT hismile.com

- `hismile.com` currently has its DNS A record set to `127.0.0.1` (null-routed / parked — confirmed via Cloudflare and Google DoH, i.e. it is set at the authoritative DNS, not a local block).
- The live store is **`hismileteeth.com`** (Shopify IPs `23.227.38.x`) with regional subdomains:
  - `hismileteeth.com` → Australia & New Zealand (AU, AUD)
  - `us.hismileteeth.com` → United States (USD)
  - `uk.hismileteeth.com` → United Kingdom
  - `eu.hismileteeth.com` → Europe (EUR)
  - `ca.hismileteeth.com` → Canada
  - `int.hismileteeth.com` → International / rest of world
  - `dev.hismileteeth.com` → staging (referenced in code)
- Kuwait & Saudi Arabia redirect to a separate distributor store `hismile.online`.
- Each region is a **separate Shopify store** with its own shop ID (extracted from the account dashboard code):

| Region | Domain | Shopify shop ID |
|---|---|---|
| AU | hismileteeth.com | 9164078 |
| US | us.hismileteeth.com | 15259766 |
| UK | uk.hismileteeth.com | 15259782 |
| EU | eu.hismileteeth.com | 15259806 |
| INT | int.hismileteeth.com | 15259812 |
| CA | ca.hismileteeth.com | 11509858404 |
| DEV | dev.hismileteeth.com | 25025300 |
| B2B "Professional" | (Shopify-hosted) | 59101053090 |

---

## 1. Tech stack (relevant to account/support)

- **Shopify-hosted headless storefront**: Shopify serves the HTML shell + server-injected data, but the whole UI is a **Vue 3 SPA** (`<div id="app">`, Vite-built bundles like `theme-CwMsJ38v.js`, vue-router with routes `/`, `/cart`, `/account/:handle?/:id?/:token?`, `/collections/:handle`, `/products/:handle`, `/pages/:handle/`, `/password`, `/challenge`, catch-all 404).
- Server injects per-page state into `window.*`: `shopAttributes` (domain, region, currency, klaviyoList, paymentProvider), `productArray`, `collectionArray`, `pageArray` (all CMS pages with content!), `customerAttributes` (logged-in customer), `displayProducts`, `bundleProducts`, `global_free_gift`, `global_legal_notice`.
- **Custom backend API**: `https://api.hismileteeth.com` with (at least):
  - `GET /api/klaviyo-info/{REGION}` → welcome & abandonment discount config (public; see §10)
  - `GET /api/discount-array/{REGION}?code=X,Y` → validates discount codes (403 without proper headers)
  - `GET /api/shopify-order/{REGION}?order=...&email=...` → guest order lookup (see §6)
- Third-party scripts loaded on every page (verbatim list from the AU shell):
  - `ecom-app.rakutenadvertising.io/rakuten_advertising.js` + `tag.rmp.rakuten.com/125603.ct.js` — **Rakuten Advertising** affiliate attribution
  - `social-login.oxiapps.com/api/init?...&shop=hismile.myshopify.com` — **Oxi Social Login**
  - `static.klaviyo.com/onsite/js/L7gAyy/klaviyo.js` — **Klaviyo** (company ID `L7gAyy` on AU; region-specific list IDs: AU `PQCZkH`, US `KF439k`, EU `QdNC3R`; five `klaviyo-site-verification` DNS TXT records suggest multiple Klaviyo accounts)
  - `api.socialsnowball.io/js/referral.js` — **Social Snowball** referral/affiliate
  - Shopify **hCaptcha** on all customer forms ("Protected by hCaptcha" — login, register, recover, contact, comments)
  - Shop Pay / shop.app component loaders incl. `init-customer-accounts`, `shop-login`, `shop-user-recognition`, `shop-cart-sync`
  - GTM (`googletagmanager.com/gtm.js`), Shopify trekkie analytics
- Fonts: CircularXX (body) + PulpDisplay (headings); brand pink (`--brand-pink`) is the signature color.
- Email infrastructure: Google Workspace MX (no dedicated helpdesk MX); support addresses are plain Gmail-routed mailboxes (see §8).

---

## 2. Multi-region / multi-currency / language

### 2.1 Region selector (footer + header secondary nav)
Component `UiRegionSelector`: a styled native `<select>` showing flag icon + region name + chevron. Six hardcoded options:

| Label | Code | URL |
|---|---|---|
| Australia & New Zealand | AU | `https://hismileteeth.com?rdr=1` |
| United States | US | `https://us.hismileteeth.com?rdr=1` |
| United Kingdom | UK | `https://uk.hismileteeth.com?rdr=1` |
| Europe | EU | `https://eu.hismileteeth.com?rdr=1` |
| Canada | CA | `https://ca.hismileteeth.com?rdr=1` |
| International | INT | `https://int.hismileteeth.com?rdr=1` |

Selecting one does a full `window.location.href` navigation to that store with `?rdr=1` appended (suppresses the geo-redirect, see below). There is **no in-session currency switching** — currency is per-store (AUD/USD/GBP/EUR/CAD + INT default).

### 2.2 Automatic geo-redirect (custom Cloudflare Worker)
A dedicated module (`useRedirect-*.js`) runs before first paint:
1. Hides the page (`document.documentElement.style.opacity="0"`) until geo resolves to avoid a flash of wrong store.
2. Country detection chain: `slCCodes` cookie (30-day) → `https://country-code-redirect-worker.hismileteeth.com/` (Cloudflare Worker, 1.5 s timeout) → Shopify `/browsing_context_suggestions.json` (4 s timeout) → `window.shopifyLocalization.isoCode` fallback.
3. Full country→store map is hardcoded (AU/NZ→AU; US/UM→US; GB→UK; CA→CA; 45 European countries incl. **Slovenia (SI)→EU**; KW/SA→`hismile.online`; everything else→INT).
4. Redirect preserves path + query + hash and appends `rdr=1`; after a redirect it sets `dontRedirect=true` (sessionStorage + 30-day cookie) so users are never bounced twice.
5. Never redirects: Googlebot, `shopifypreview.com`, URLs containing `rdr=1`, `/cart` paths, correct hostname already, or DEV region.

### 2.3 Language
**English only.** All regional stores serve `<html lang="en">`; there is no language selector, no translated content (EU store included). Localization = currency, payment provider, region-specific pages and Klaviyo list only.

### 2.4 Regional content differences (from per-store `pageArray`)
- US store has an extra page `amazon-us` (dedicated "shop us on Amazon" landing, template `PageAmazonUs`) and `flavoured-toothpaste`; no `careers`, no `zippay`.
- Footer "Exclusive Discounts" column (Students & Graduates / Key Workers / Social Impact) renders **only** for regions AU, US, UK (+DEV).
- "Hismile Careers" footer/nav link renders only for AU.
- Payment provider attribute: Afterpay (split 4) on AU and US shells (Klarna/Zip assets also present in bundles; Zip has an AU page `/pages/zippay`).

---

## 3. Login / Register flows

All account routes are SPA templates under `/account/:handle?/:id?/:token?`:
`login`, `register`, `reset`, `activate` (+ `?view=orders` on the dashboard). Shopify Liquid renders hidden error-holder forms (`#login-form-errors`, `#register-form-errors`, etc.); the Vue app reads server-side errors/success messages out of those divs after a failed/successful POST.

### 3.1 Login (`/account/login`) — component `AccountLogin.vue`
Layout, top to bottom:
1. Title **"Login"**
2. Subtext: "Don't have an account? **Sign up**" (router link to register)
3. **Social login block** (`SsoLogin.vue`) — an iframe injected by **Oxi Social Login** (`social-login.oxiapps.com/widget?site=hismile.myshopify.com`). The widget renders three buttons (fetched the widget HTML directly):
   - **"Sign in with Facebook"**
   - **"Sign in with Google"**
   - **"Sign in with Amazon"**
   (Apple/Twitter/LinkedIn assets exist in the app package but are not enabled.)
4. Divider: **"Or"**
5. Classic Shopify credential form POSTing to `/account/login` (`form_type=customer_login`): **Email address** (`autocomplete="email"`), **Password** (`autocomplete="current-password"`), both required.
6. **"Forget your password?"** link — toggles the inline recovery panel (also deep-linkable via `#recover`).
7. Full-width submit button **"Login"**.
8. Form protected by **Shopify hCaptcha** (`data-shopify-captcha="true"`, `window.Shopify.captcha.protect`).
9. The Liquid form carries `data-login-with-shop-sign-in="true"` → Shopify can additionally surface **"Sign in with Shop"** (Shop Pay) on these forms, and shop.app `shop-login`/`shop-user-recognition` modules are preloaded.
10. If already logged in → redirect to `/account`.

### 3.2 Forgot password (inline panel, `ForgetPassword.vue`)
- Title "Forget your password?", copy: "Enter your email and we'll send you a link to reset your password."
- Single email field → POST `/account/recover` (hCaptcha protected); error and success boxes rendered from server response; "Back to Login" link.

### 3.3 Register (`/account/register`) — component `AccountRegister.vue`
1. Title **"Sign up"**, subtext "Already have an account? **Login**"
2. Same Oxi social-login iframe + "Or" divider (i.e. social **sign-up** is supported via the same three providers; `data-login-with-shop-sign-up="true"`).
3. Form POSTs to `/account`: **First name**, **Last name** (two half-width fields), **Email address**, **Password** (`autocomplete="new-password"`), **Confirm Password** (client-side only, `setCustomValidity("Passwords do not match")`).
4. **Pre-checked marketing checkbox**: "Yes, I want to receive the latest discounts and news from Hismile. Unsubscribe anytime." (`customer[accepts_marketing]`)
5. Full-width **"Signup"** button; hCaptcha protected.
6. After submit: success state — **"We've just sent a confirmation email. Please confirm your email address to activate your account."** → email-verification (double opt-in) flow.

### 3.4 Reset & Activate (`AccountReset.vue`, `AccountActivate.vue`)
- Standard Shopify token flows (`/account/reset`, `/account/activate` with hidden `id`+`token`): Password + Confirm Password (client-side match validation), hCaptcha, full-width submit ("Reset password" / "Activate Account"), server error/success boxes.

**Takeaway pattern:** social login FIRST (top of page), classic email/password second below an "Or" divider, passwordless-ish options via Shop; everything else (recover/reset/activate) is plain Shopify with hCaptcha. No magic-link/passwordless email login on the custom storefront itself (that lives in the Shopify customer-accounts portal, §5).

---

## 4. Account dashboard (`/account`) — deliberately minimal

Component `AccountDefault.vue`. The entire logged-in "my account" is ONE screen:

- Greeting header: **"Hi, {firstName}"**
- Three menu rows (link-list style with chevron icons):
  1. **"My orders"** → `/account?view=orders` (inline view, with "← Back" button)
  2. **"Manage subscriptions"** → **external** link to Shopify's hosted customer-accounts portal: `https://shopify.com/{SHOP_ID}/account/pages/e85ad72a-1b9d-4038-8e07-a4d61164ed72` (shop ID resolved per region from the table in §0 — deep link to a subscription-management page inside Shopify New Customer Accounts)
  3. **"Contact support"** → `/pages/contact-us`
- **"Logout"** link → `/account/logout`

Notably **absent** from the custom dashboard: address book, payment methods, loyalty points, referral hub, wishlist, profile/settings editing, order tracking numbers, returns initiation. (Addresses etc. live only in the Shopify-hosted customer accounts portal.)

### 4.1 Order history (`AccountOrders.vue` + `AccountOrderCard.vue`)
- List of **accordion cards**, one per order. Header: **order number** (e.g. `AU1234567`), purchase date formatted as *"9th of September 2026"*, and a **status pill**:
  - unpaid/unknown → financial status text, red ("negative") pill
  - paid + shipped → "Shipped", green ("positive")
  - paid + not shipped → shipping status text, amber ("warning")
- Body: line items matched by SKU against the catalog to show **product thumbnail + title + "x{qty}"**; only first 3 items shown, then a **"Show more"** button.
- Shipping block: **"Shipped by {shipping method}"** and **"To {recipient name} (from {company}) based in:"** followed by address lines (address1, address2, city, province+zip, country).
- **No carrier tracking number/link is shown in the account** — status only.
- Empty state: "No orders to display".

### 4.2 Customer data plumbing
- Server injects `window.customerAttributes = { profile: { id, firstName, lastName, email, phone, dob, city, street, zip, country }, attributes: {}, recentOrders: [], tags: [] }` (Liquid-rendered on every page).
- The SPA's customer store tracks `isLoggedIn`, `loginType`, `recentOrders`, `tags`, `profile`; analytics events enrich with `phone_e164` (libphonenumber), `shopify_cid`, logged-in state.
- Header secondary nav switches on `isLoggedIn`: **"My account"** (→ `/account`) vs **"Log in"** (→ `/account/login`).

---

## 5. Subscriptions & membership

- **"Manage subscriptions" is outsourced entirely** to Shopify's New Customer Accounts portal (`shopify.com/{shopId}/account/...`) — the passwordless (email + one-time code) hosted experience where Shopify surfaces subscription app extensions, addresses, payment methods. Hismile's own SPA does zero subscription UI beyond the deep link.
- **Club Hismile — ENDED August 2025** (per current Terms & Conditions): a paid monthly membership with member pricing ("Club Prices"), exclusive products/flavours and monthly toothpaste credits; cancel/pause anytime; expired credits lost. The Terms still document it but flag it ended — so **there is currently no active loyalty/membership/points program on the storefront** (no LoyaltyLion/Smile.io/Yotpo-loyalty code anywhere in the bundles).
- Discount code plumbing (used by cart + welcome modal): codes validated through `api.hismileteeth.com/api/discount-array/{region}`; validated codes stored in sessionStorage (`active_discount`, `checked_discounts`); a `discount_code` cookie makes the top announcement bar switch from the promo marquee to **"Code: {CODE} applied 🎉"** (truncated to 25 chars).

---

## 6. Guest order lookup (no login required)

On `/pages/contact-us`, component `AccountOrderLookup`:
- Inputs: **Email address** + **Order number**, button **"Find order"** (loading state "Searching…").
- Order numbers are **region-prefixed** (`AU`, `US`, `UK`, `EU`, `INT`, `CA`); the prefix routes the query: `GET api.hismileteeth.com/api/shopify-order/{REGION}?order={n}&email={e}`.
- Placeholder/hint format: `{REGION}1234567`; validation error "Not a valid order number".
- On success, the order renders as the same `AccountOrderCard` accordion used in the account dashboard, and a **"Select your order"** dropdown appears if the email has multiple orders — this doubles as the support form's order-context picker.

---

## 7. Reviews system — there is NONE on-site

- Exhaustive search of all JS bundles, home page, and PDP HTML: **no Okendo, Yotpo, Judge.me, Loox, Stamped, Junip or any review widget**; no star-rating UI, no review counts, no "write a review" flow, no photo reviews.
- What they do instead: **static screenshots of Amazon reviews** embedded as ordinary content images on PDPs (alt texts literally read "Amazon reviews", "5 star Amazon review"). US store also has the `/pages/amazon-us` landing page funneling to Amazon.
- Off-site reputation: Trustpilot pages for `hismileteeth.com` (≈2.6/5, ~21k reviews) and `us.hismileteeth.com` (~3.4/5, ~67k reviews per Trustindex) — and Hismile staff actively reply to Trustpilot reviews (signed with first names, e.g. "Georgia"). ProductReview.com.au listings exist for individual products (mostly negative sentiment).
- **Implication for Nasmeh.si:** this is a gap we can beat — a real review platform (Judge.me/Okendo with photo reviews) would differentiate us immediately.

---

## 8. Support surfaces

### 8.1 Help Centre landing page — `/pages/help` (component `PageHelp.vue`)
Surprisingly small: title **"The Hismile Help Centre"**, subtitle **"Most popular questions"**, then exactly **5 accordions** (hardcoded in the bundle):
1. **"Tracking says delivered"** — check property/neighbours → contact carrier → contact us with case/reference number.
2. **"Returns Policy"** — the full 30-day change-of-mind policy (see §9).
3. **"My order status is unfulfilled"** — "allow 1-4 business days processing time"; excludes weekends/public holidays.
4. **"How does the V34 work?"** — usage instructions for the hero product (2 pumps, brush 2 min, expel, use after regular toothpaste).
5. **"Can I edit or cancel my order?"** — contact us ASAP with order number + email; no guarantees once placed.

Every accordion body ends with: **"Not finding what you are looking for? Contact us"** (→ `/pages/contact-us`), and the page repeats that CTA in a padded block at the bottom.

### 8.2 Help-centre & shipping blogs (SEO content silos)
- Shopify blog `blogs/help-centre` with **146 FAQ articles** ("Can I use X if pregnant or breastfeeding?", "Can I use X with veneers/caps/implants/bridges?", "Are your products vegan", "Can I edit or cancel my order", product-usage questions per SKU…).
- Shopify blog `blogs/shipping` with **27 region/warehouse articles** (`au-warehouse-*`, `us-warehouse-united-states-mainland`, `pnc-*` European fulfillment lanes, `countries-we-don-t-ship-to`, `disrupted-countries`, `auspost-standard-shipping`).
- **Quirk:** the SPA router has no `/blogs` route — these URLs return correct server-side `<title>`/meta (SEO shells) but render the SPA "Page not found" view ("The page you requested does not exist… automatically redirected to the home page in 10 seconds"). They are effectively crawl fodder, not a usable help center. The real help UX is `/pages/help` + contact page + AI bot.

### 8.3 Contact page — `/pages/contact-us` (component `PageContact.vue`, template `contact`)
The support hub, built as a guided triage flow. Header: **"How can we help you today?"**

**Step 1 — topic grid** (icon cards, each with a custom icon):
| Topic | Sub-options / notes |
|---|---|
| Track order | requires order lookup |
| Change order | requires order lookup |
| Cancel order | sub-reasons: Change of mind, Mistaken order, Order taking too long, Purchased elsewhere, Wrong details entered, Didn't add discount code |
| Return order | requires order lookup |
| Order is wrong | message: "In the next step, please attach a photo showing everything you did receive and the parcel/box it came in." |
| Order is damaged | same photo-attach pattern |
| Product advice | — |
| Report adverse event | dedicated injury form (below) |
| Other | "Please select another category if it would relate better as they'll be seen by the right team." |

**Step 2 — order context:** the guest order lookup (§6) with "Select your order" dropdown.

**Step 3 — description:** free text, validation "Please describe your enquiry" (>10 chars).

**Submission mechanism (surprising):** the form does **not** POST to a ticketing backend. It composes a **`mailto:`** link:
- to **`help.orders@hismileteeth.com`**
- subject `Contact - {Topic} - {Sub-reason}`
- body `Order Number: {n} Description: {text}`
and navigates `window.location.href` to it (i.e. opens the user's mail client). The receiving mailbox is presumably piped into a helpdesk, but there is no Gorgias/Zendesk/Intercom widget anywhere on site.

**Adverse event report** (`FormInjuryReport`, FormKit schema-driven form, route `/pages/report-adverse-event`):
- Header: "Adverse event report regarding a product"; subheader "Do not submit this form for order tracking or updates."
- Sections: reporter details (incl. "Are you a medical practitioner?"), purchaser details ("Same as above" auto-fill), product details (**product name, batch number** — hint "Printed on product container" — purchase date, place of purchase: Online store / Retail store / Marketplace, country, "I have receipt or proof of purchase"), injured-person details (DOB, date of injury, medical treatment received? type: nurse/paramedic/other, cause of injury — "Note: we will require a medical report or records later"), privacy consent checkboxes ("Box must be ticked to submit.").
- Submit → `mailto:help@hismileteeth.com?bcc=legal@hismileteeth.com&subject=Contact - Adverse event report` with a numbered 25-field plain-text body.
- This is a **regulatory-compliance surface** (cosmetics adverse-event reporting) — relevant for Nasmeh.si since whitening cosmetics need the same diligence in the EU.

### 8.4 AI support chatbot — **Botpress** (component `ContactBot` on the contact page)
- Loads `https://cdn.botpress.cloud/webchat/v3.6/inject.js` + two config scripts from `files.bpcontent.cloud` (dated Apr/May 2026).
- Card copy: **"Need help? We've got you."** / "Chat with our AI assistant for instant support with orders, products, and more - available 24/7." / button **"Start Chat"**.
- Advertised capabilities list ("How we can help:"): **Track my order · Returns & refunds · Product questions · Account support · Report adverse event** (deep link).
- Fallback line: **"If we can't solve it, our team help@hismileteeth.com will step in."**
- The bot is **commerce-capable**: it can add products/bundles to the cart mid-chat (dedicated cart-add handlers and error strings: "Could not find this product to add", "This product is currently sold out", "Could not add bundle to cart", "Maximum quantity of this product is already in cart", "Failed to add to cart").
- Custom privacy overlay before chat starts: "Please note that all communications will be used in accordance with our privacy policy" with Agree / "Do not Agree" buttons (styled in brand pink).
- Listens to Botpress lifecycle events (`webchat:initialized`, `webchat:opened`, `webchat:closed`).

### 8.5 Contact channels summary
- **AI chat** (Botpress, 24/7, on contact page)
- **Structured mailto forms** (contact topics → `help.orders@`; adverse events → `help@` + bcc `legal@`)
- Direct emails found in code/schema/policies: `help@hismileteeth.com` (general), `help.orders@hismileteeth.com` (orders), `returns@hismileteeth.com` (faulty-product claims), `legal@hismileteeth.com` (adverse events bcc), `privacy@hismileteeth.com` (privacy officer), `partnerships@hismileteeth.com` (ambassador/affiliate program)
- Stated support hours (contact page legacy copy): response "within one business day, during business hours (8am - 4pm, Australian Eastern Standard Time)"
- **No phone support, no WhatsApp, no social-DM support links.**
- Social profiles (footer "Follow"): Instagram `instagram.com/hismile`, Facebook `facebook.com/hismileteeth`, TikTok `@hismile`, YouTube (channel UCr6dTGuQg2e3U_J3xEh3IqQ), LinkedIn.

---

## 9. Policy pages (from `/pages/terms-conditions`, template `terms-privacy`, sticky table-of-contents nav)

### 9.1 Returns Policy (change of mind)
- **30 days** from purchase date; products **unused, unopened, original packaging**.
- Must **contact Customer Support first** with **photos of unopened products** + valid proof of purchase from hismileteeth.com, and **wait for approval** before sending anything back.
- **No prepaid return labels**; original shipping cost excluded from refund.
- Return must have a **tracking number** shared with the team.
- Refund to original payment method after warehouse inspection. Discount value from promotional offers is not refunded.

### 9.2 Faulty product claims — 3-stage process
1. **Troubleshooting** — email `returns@hismileteeth.com` with name, order number, contact info, issue.
2. **Photo/Video assessment** — photos/video of the fault + **LOT/Batch number** from packaging; assessed within **14 business days**; successful claim → replacement product.
3. **Physical assessment** — product returned to Hismile for inspection where needed.
Claims can be declined for misuse/neglect; statutory consumer guarantees acknowledged.

### 9.3 Shipping & delivery policy (order terms)
- Contract complete when parcel is **scanned as delivered**; risk passes to customer on delivery (or on the date delivery "would have occurred" if delayed).
- **No address changes / no redirection after the Order Confirmation email.**
- Lost/stolen after risk transfer → customer must resolve with the carrier; no replacement/refund; replacement orders at customer's expense.
- **Authority to leave** parcels by default; unsafe locations may be redirected to a collection point.
- Help page adds: **1–4 business days dispatch processing** (longer in sales peaks), delivery windows exclude customs clearance delays.
- Detailed per-lane dispatch/shipping time tables live in the (SEO-only) shipping blog articles — split by AU warehouse, US warehouse, and European "PNC" fulfillment lanes.

### 9.4 Other policy nuggets
- **Digital gift cards**: emailed alphanumeric codes, redeemable at Hismile online stores, **3-year validity**, not replaceable if lost, not exchangeable for cash.
- **SMS marketing terms** (TCPA + GDPR sections): checkout phone number = consent to order notifications incl. abandoned-cart reminders + marketing texts, **max 30 msgs/month**, consent not a condition of purchase, STOP to opt out.
- Privacy page: rights enumerated (GDPR-style), privacy officer `privacy@hismileteeth.com`; discloses Rakuten Advertising data sharing.
- Email Disclaimer page exists as a standalone page.

---

## 10. Marketing-capture & program pages (account-adjacent)

- **Welcome modal** (`UiWelcomeModal`): shown once per session (sessionStorage), suppressed on `/cart` and `/account` paths; email input "Please enter your email…"; on submit fetches `api.hismileteeth.com/api/klaviyo-info/{region}` for the current code — **fallback WELCOME10; AU currently returns `HELLO10` (10% off)** — validates it via the discount API, then shows a "thankyou" state. Same endpoint exposes the abandonment ladder: **`CART10` (10%) cart-abandon step 1, `CART15` (15%) cart-abandon step 2 and browse-abandon**. Standard terms: "excludes bundles, already discounted items, subscription or membership fees, delivery fees, gift cards… cannot be used with other offers".
- **Footer newsletter** (`FooterForm`): title **"Want the chance to trial our new products?"**, copy "Sign up for the latest news, exclusive offers, and the chance to trial new and unreleased products.", single email field ("Please enter your email…"), form id `footer-form`, source `footer-signup` → Klaviyo (region-specific list IDs).
- **SMS signup page** `/pages/sms-signup` (template `sms-landing-page`, Klaviyo onsite form territory; SMS terms embedded in T&Cs).
- **Discount-verification pages** (AU/US/UK only) — **Student Beans** embeds (`cdn.studentbeans.com/third-party/all.js`): `<beansid-landing-page slug="hismile" territory="au">` for `/pages/student-discounts`, `slug="hismile-offers"` for `/pages/social-impact-discounts`; `/pages/key-workers-discounts` same family.
- **Affiliate / ambassador:**
  - `/pages/hismile-affiliate-program` = a full-viewport **Social Snowball** iframe (`api.socialsnowball.io/register-form/18563/{uuid}` — two form UUIDs ship, likely per region/program) with auto-height messaging.
  - `api.socialsnowball.io/js/referral.js` loads sitewide (post-purchase referral popups etc.).
  - **Rakuten Advertising** runs alongside (network affiliate attribution).
  - Terms contain a full **"Hismile Ambassador and TikTok Affiliate Programs"** agreement (last updated 26 Nov 2025): personal ambassador link + commission, permitted/prohibited uses, non-disparagement, contact `partnerships@hismileteeth.com`.
- **Careers** `/pages/careers` (AU only): brand/culture page with Vimeo culture-video modal ("What's it like to work at Hismile HQ?", "See what we're up to at our Gold Coast HQ."), values ("Challenge the norm", "Seek discomfort"), then **"View current job opportunities"** → shortlink → **Employment Hero** job board (`employmenthero.com/jobs/organisations/hismile-lho3b/`).
- **Hismile Professional** `/pages/hismile-professional` (B2B): landing page for dental professionals; when you're on it the nav gains a **"Professional Login"** item → bit.ly shortlink → **Shopify B2B customer-accounts auth on a separate store** (shop ID 59101053090, i.e. a Shopify B2B/wholesale storefront with passwordless login).
- **No standalone content-marketing blog** (the only blogs are the help-centre and shipping silos above). Brand storytelling lives in PDP/landing content, not an editorial blog; there is no dedicated "About us / our story" page in the page array (closest: careers + professional pages; the `global` page simply redirects to `/`).

---

## 11. Small but instructive details

- **Announcement bar** swaps to "Code: {CODE} applied 🎉" when a `discount_code` cookie is present (marquee otherwise).
- **Cookie consent** (`ConsentSticky`): session-only sticky bar — "By using our website, you agree to the use of first and third party cookies as outlined in our Privacy Policy" + full-width **Accept** (white) and **Decline** (text-style) buttons; stored in sessionStorage (not a real CMP — EU stores included).
- **404 page**: "Page not found. The page you requested does not exist. If you would like to continue shopping please click here. You will be automatically redirected to the home page in 10 seconds."
- **Order-number convention**: `{REGION}{number}` e.g. `AU1234567` — elegant multi-store trick worth copying for a multi-market setup.
- **Legacy store subdomain** `shop.hismileteeth.com` is now just a Bitly branded short domain.
- Gift cards have SPA routes (`/gift_cards/:id?/:token?`).
- Klaviyo is used for both email (lists per region) and SMS (TCPA/GDPR terms, sms-signup landing).

---

## 12. What Nasmeh.si should copy vs. improve

**Copy (proven patterns):**
1. Combined login/register screen with **social login on top** (Google/Facebook/Amazon via a Shopify app like Oxi) and classic email+password below an "Or" divider; pre-checked marketing checkbox; email-verification after signup.
2. **Minimal account dashboard**: greeting "Hi, {name}", three rows (My orders / Manage subscriptions / Contact support), logout — defer addresses/payments to Shopify's customer-accounts portal instead of building it.
3. Order cards as accordions: order number, friendly date ("9th of September 2026"), colored status pill, first-3-items + "Show more", "Shipped by {method}".
4. **Region-prefixed order numbers** + guest order lookup (email + order no.) on the contact page — kills the #1 support ticket type without login.
5. Guided **topic-based contact triage** (icons per topic, sub-reasons, photo-attach instructions for wrong/damaged orders) that routes to the right mailbox/queue.
6. **AI chat with commerce actions** (Botpress can add to cart) + explicit human fallback email.
7. `/pages/help` as a **curated top-5 FAQ** ending every answer in a Contact-us CTA, rather than a sprawling help center.
8. Region selector as full store switch (subdomain per region) with redirect-suppression param and never-redirect-twice cookie logic — if/when Nasmeh.si goes multi-market.
9. Welcome modal suppressed on `/cart` and `/account`; discount state surfaced in the announcement bar ("Code applied 🎉").
10. Regulatory surfaces: adverse-event report form with batch-number capture and legal bcc — directly applicable to EU cosmetics compliance.

**Improve on (their weaknesses):**
1. **Add real product reviews** (they have none — only Amazon screenshots; Judge.me/Okendo with photos would be an instant trust win).
2. **Real help center**: their 146-article FAQ blog 404s in the SPA — build a searchable, categorized help center (or at least render the articles).
3. **Real ticketing** instead of mailto: forms (their "contact form" literally opens the user's mail client).
4. **Loyalty/referral in-account**: they ended Club Hismile and have no points; a Smile.io-style points widget + referral hub inside the account is whitespace.
5. Show **carrier tracking links** in the account order card (they show status only).
6. Cookie consent that is actually a CMP for EU (theirs is cosmetic).
7. Slovenian + English localization — they run English-only everywhere; localized support content would be a differentiator in SI/EU.
