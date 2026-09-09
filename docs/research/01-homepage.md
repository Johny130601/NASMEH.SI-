# Hismile.com — Homepage Teardown (Research Slice 01)

**Date captured:** 2026-09-09 (live site, captured with headless Chrome + raw HTML/JS analysis)
**URLs:** `hismileteeth.com` (the live brand domain — note: `hismile.com` itself resolves to `127.0.0.1` in public DNS, i.e. unused/parked by the brand). Geo-detection from a Slovenian IP auto-redirects to **`eu.hismileteeth.com/?rdr=1`** (EUR, "Europe" region). Regional storefronts: `hismileteeth.com` (AU), `us.`, `uk.`, `eu.`, `ca.`, `int.` subdomains.
**Viewports captured:** Desktop 1440×900 and mobile 390×844. Screenshots saved in `docs/research/screenshots/01-homepage/`.

> Method note: the site is a **client-side rendered Vue app** (custom Shopify theme "Hismile Vite", built with Vite). View source shows only `<div id="app">`; all findings below come from the fully rendered DOM (headless browser, scrolled to trigger lazy sections), the theme's JS bundles, and embedded `window.*` data payloads.

---

## 1. Homepage at a glance — section order

The homepage is surprisingly **short** (~2,100 px desktop before footer). Full top-to-bottom order:

| # | Section | Component (theme class) | Purpose |
|---|---------|------------------------|---------|
| 1 | Announcement marquee (scrolling ticker) | `ui-marquee background-pink` | Sitewide offer awareness |
| 2 | Utility bar (region, login, help) | `secondary-nav` | Trust/localization |
| 3 | Header nav (logo, mega-menus, Bundle & Save, cart) | `header` / `d-nav` | Navigation + bundle push |
| 4 | Hero (split: copy + autoplay video + promo banner overlay) | `section-hero` | New-product launch + offer |
| 5 | "Shop our best sellers" product carousel | `PageSectionCatalog` / `home-container catalog` | Social proof + 1-click add-to-cart |
| 6 | Magenta "Shop our bundles" banner | `home__sale-banner` | AOV push |
| 7 | Full-width clickable bundle image banner | `home-container` (image link) | Hero-bundle push (Affordable Whitening Set) |
| 8 | Footer (email capture, link accordions, payment icons, region, legal) | `footer` | Email capture + trust |

**Overlays on top of all of this:** cookie consent bar (bottom sticky), 10%-off welcome modal (timer-triggered), per-product "back in stock" email modals (hidden until a sold-out variant is selected).

**Notable absences on the homepage:** no customer reviews/star ratings, no before/after gallery, no press/logo bar, no UGC/Instagram feed, no quiz, **no site search anywhere in the header** (verified: zero `search` markup in the rendered body). Social proof lives on PDPs, not the homepage. The homepage is a pure *merchandising + offer* machine.

---

## 2. Screen-by-screen breakdown

### Screen 0 — Above-the-fold composition (desktop)
Screenshot: `desktop-01-above-fold.png`. The first viewport contains, top to bottom: marquee → utility bar → nav → hero (left copy, right video). The cookie bar floats over the bottom. Everything from marquee through nav is **one sticky block** (`position: sticky`, z-index 10) — the ticker, utility bar and nav all stay pinned while scrolling.

### 2.1 Announcement bar — scrolling marquee
- **Content:** a single message, `FREE GIFT WITH ANY PURCHASE`, duplicated ~14× into an infinite CSS marquee (animation duration 28 s).
- **Style:** full-width, brand magenta (`--brand-pink`), white bold uppercase text.
- **Behavior:** the whole bar is an `<a href="/collections/products">` — clicking anywhere on the ticker goes to the all-products collection.
- **Pattern:** kinetic text = urgency/novelty; one message only (no rotation of multiple offers). The offer is a **gift-with-purchase (GWP)**, not a discount — protects price integrity.

### 2.2 Utility / secondary bar
- Left: **region selector** — globe icon + label ("Europe"); a styled `<select>` overlay with options: *Australia & New Zealand, United States, United Kingdom, Europe, Canada, International*.
- Right: **Log in** (→ `/account/login`) and **Help centre** (→ `/pages/help`), each with a small line icon.
- Light gray/white background, small type. This bar is also inside the sticky header.

### 2.3 Header / navigation (desktop)
- **Layout:** logo (left, lowercase "hismile" wordmark) → nav links (left-aligned next to logo) → cart icon (far right). No search icon, no account icon here (login lives in the utility bar).
- **Nav items:**
  1. **SHOP ⌄** — mega-menu (hover-triggered, fades in over the hero). Contents (screenshot `desktop-02-shop-megamenu.png`):
     - Left link list: *Shop all products* (`/collections/products`), *Shop best sellers* (`/collections/best-sellers`), *Shop bundles* (`/collections/bundles`), *V34 Whitening Strips*, *V34 Colour Corrector Serum* (`/products/colour-corrector`), *Flavoured Toothpaste*.
     - Right: **two featured-product media cards** with lifestyle/packshot creative: *iD Stain Whitening Mouthwash* ("NEW" badge, "WHITEN & FRESHEN" art) → `/products/id-stain-mouthwash/`, and *Exfoliating Tooth Wipes* ("BRUSH AWAY THAT FUZZY FEELING", "Infused with HYDROXYAPATITE") → `/products/exfoliating-tooth-wipes`.
     - Pattern: mega-menu doubles as a **launch billboard** for the two newest products.
  2. **EXPLORE ⌄** — smaller mega-menu: *Hismile Professional* link + one media card "Learn about Hismile Professional" (B2B/professional line) → `/pages/hismile-professional`.
  3. **BUNDLE & SAVE** — direct link to `/collections/bundles`, styled in **magenta with an asterisk/star icon** (only colored nav item — the AOV play is visually privileged).
  4. **Cart icon** (line-art bag) — see §2.7.
- Mobile header: hamburger (left), centered logo, cart (right). The drawer mirrors desktop: Shop accordion (same links + the 2 media cards), Explore accordion, plus a pink "sale"-styled link (`m-nav-link__sale`).

### 2.4 Hero (`section-hero`)
- **Layout:** split hero. Left ~45%: headline + subcopy + CTA on white. Right ~55%: autoplay video. A promo banner image is overlaid at the bottom of the video.
- **Copy (current rotation, EU):**
  - H1-style title: **"Wipe away stains with Tooth Wipes"**
  - Subcopy: *"Engineered with hydroxyapatite and xylitol to lift the day's build-up off your teeth."* (ingredient-led, mechanism explained in one sentence)
  - CTA: black pill button **"Shop now"** → `/products/exfoliating-tooth-wipes/`
- **Media:** `<video autoplay loop playsinline preload="none">` (Shopify CDN mp4, ~1.19:1, object-fit cover) — **UGC-style content**: a woman holds up a used tooth wipe with visible yellow gunk. Raw "creator ad" aesthetic rather than polished studio video — the same style as their paid-social creative.
- **Overlay banner** (`section-hero__bottom-banner`): purple/purple-blue strip baked into an image: **"FREE MYSTERY GIFT WITH ANY PURCHASE"** + gift-box illustration with "?" marks — echoes the marquee, ties the hero to the sitewide GWP offer.
- **Mobile:** stacks vertically — video/banner on top, then title, subcopy, full-width "Shop now" (screenshot `mobile-01-above-fold.png`).
- **Pattern:** the hero is a *product-launch slot*, not a brand statement. Headline formula = **verb-led outcome + product name** ("Wipe away stains with Tooth Wipes"). Subcopy formula = *ingredient + mechanism + benefit*.

### 2.5 "Shop our best sellers" carousel (`PageSectionCatalog`)
Screenshot: `desktop-03-best-sellers-bundles.png` (top half).
- **Header row:** H2 **"Shop our best sellers"**, gray subcopy *"Explore our range of fan-favourites"*, plus a white pill **"Shop all >"** → `/collections/products`.
- **Body:** horizontal-scroll carousel (no arrows on desktop — scroll/swipe; ~3.5 cards visible at 1440px, ~1.2 cards on mobile to signal scrollability).
- **Products shown (EU prices):**

| Product | Price (EU) | Price (AU, from data) | Card extras |
|---|---|---|---|
| iD Stain Whitening Mouthwash | €19.99 | AU$24.99 | — |
| Tooth Armour Toothpaste Serum | €19.99 | — | — |
| V34 Whitening Strips | €35 | AU$39.00 | — |
| Affordable Whitening Set | €54.99 | — | bundle |
| Watermelon Toothpaste | €11 | — | 4 visible flavour swatches + "+4" overflow → PDP |
| Barbie Electric Toothbrush | €19.99 | — | 4 visible colour swatches + "+6" overflow → PDP (licensed collab) |

- **Product card anatomy (top→bottom):**
  1. **Badge chip:** "FREE MYSTERY GIFT" pill above/over the image + a **sticker overlay baked into every card image** ("MYSTERY GIFT FREE with any purchase" starburst graphic, separate 200×200 badge PNG also layered).
  2. Packshot image (plain light-gray studio background).
  3. Title (single line, links to PDP).
  4. **Price in magenta**, rendered as three spans: currency code ("EU") + symbol ("€") + amount — explicit-currency formatting for international shoppers.
  5. **Variant selector:** circular/rounded image swatches for multi-variant products; sold-out variants get a `sold_out` disabled state; overflow renders as a "+N" button linking to the PDP.
  6. Black full-width pill **"Add to cart"** (direct ATC from the homepage — frictionless).
- **Hidden per card:** a **back-in-stock modal** ("We'll let you know / when it's back!" + "Leave us your email, and we'll remind you when this product is back in stock." + email form `sold-out-email-{SKU}`) — email capture even for sold-out demand.
- Data layer caps purchase at `maxCartQuantity: 5` per product.

### 2.6 Bundle push — two stacked sections
Screenshot: `desktop-03-best-sellers-bundles.png` (bottom half) + `desktop-04-bundle-banner.png`.
1. **Solid magenta banner** (`home__sale-banner`): centered white H2 **"Shop our bundles"** + underlined white text link **"Shop now"** → `/collections/bundles`. Full-bleed brand color block as a visual "interrupt" between the carousel and the next section.
2. **Full-width clickable image banner:** the entire creative is **one image wrapped in `<a href="/products/affordable-whitening-set">`** (desktop asset 2200×1077, separate mobile creative). Baked into the image: headline **"Your everyday whitening routine, sorted."**, subcopy *"An easy way to stay consistent with whitening at home."*, a **fake black "Shop Now" button graphic**, product stack (Tooth Armour + V34 strips + iD mouthwash with yellow **"FREE\*"** callout and "+" device), and legal footnote: *"\*iD Stain Whitening Mouthwash free, when purchased in the Affordable Whitening Bundle. Value based on purchasing items individually at standard prices. T&C's apply."*
   - Pattern: headline = routine/outcome ("routine, sorted"); the offer is a **free-product bundle anchor**; legal fine print included directly in creative; whole banner clickable (fake button inside image increases CTR without building a real component).

### 2.7 Cart icon behavior
- The header cart icon is a plain link to **`/cart`** — there is **no mini-cart drawer** on the homepage.
- `/cart` is an SPA route (screenshot `desktop-05-empty-cart.png`). **Empty-cart state:** left panel *"Looks like your cart is empty."*; right summary card **"Your cart (0)"** with total ("EU€0"), a black **"Shop all products"** pill, and a **payment-icon row** (Visa, Mastercard, Apple Pay, Google Pay, PayPal, Afterpay, Klarna).
- Below the empty state, the cart page still renders a **"Shop our best sellers"** carousel with the same FREE MYSTERY GIFT-badged cards — even the empty cart is a merchandising surface.

### 2.8 Footer
- **Email capture block (top of footer):** headline **"Want the chance to / trial our new products?"** + *"Sign up for the latest news, exclusive offers, and the chance to trial new and unreleased products."* + email input with a circular **arrow submit button** (no visible "submit" text; form id `footer-form`). Hook = *product-trial exclusivity*, not a discount (the discount hook is reserved for the popup).
- **Link columns** (accordions on mobile, flat columns on desktop):
  - **Shop:** View all products, Bundles, V34 Colour Corrector Serum, PAP+ Whitening Strips, Hismile Toothpaste.
  - **Support:** Help centre (`/pages/help/`), Contact us (`/pages/contact-us`), Log in / Sign up.
  - **Explore:** Hismile Professional.
  - **Follow:** Instagram, Facebook, Youtube, TikTok, LinkedIn (all external, incl. LinkedIn — B2B credibility).
- **Payment icons:** Visa, Mastercard, Apple Pay, Google Pay, PayPal, Afterpay, Klarna (SVG row).
- **Bottom row:** region selector (repeated), Terms and Conditions (`/pages/terms-conditions/`), Privacy Policy (`/pages/privacy/`), **"© 2026 Hismile Pty Ltd. All Rights Reserved."**
- No trust badges, no review stars, no address in the footer.

---

## 3. Popups & overlays — exact mechanics

### 3.1 Cookie consent bar (`ConsentSticky`)
- Bottom sticky bar, dark translucent background: *"By using our website, you agree to the use of first and third party cookies as outlined in our Privacy Policy."* + **Accept** (solid white/black pill) + **Decline** (plain text button). On mobile both buttons stack full-width.
- **Logic (from theme JS):** shown only if `sessionStorage.cookieModalHasBeenShown` is unset and `allowCookies` ≠ true — i.e. **session-scoped, custom-built**, not a CMP like OneTrust. Both Accept and Decline dismiss it and write the session flags.
- It overlays (and slightly obscures) footer content until answered — impossible to miss but easy to dismiss.

### 3.2 Welcome discount modal (`UiWelcomeModal`, id `welcome-modal`)
- **Trigger logic (decompiled from `MainView-*.js`):**
  - Opens via **`setTimeout` after 55 seconds** on a page; re-armed on every route change.
  - **Suppressed** on `/cart` and `/account` paths, if the visitor already interacted this session (`sessionStorage.has_interacted_with_welcome_modal`), or if the store already has the visitor's email (`userEmailAcquired`).
  - Position: **bottom sheet on mobile, centered modal on desktop**.
- **Content:** H3 **"Want 10% off your first order?"** — the percentage is **dynamic**: the theme fetches a region-specific discount code from `api.hismileteeth.com/api/klaviyo-info/{region}` (fallback code `WELCOME10`), then validates it against `api.hismileteeth.com/api/discount-array/{region}` to display the real value (fallback 10).
- Body copy: *"Join the smile care community for the latest news, exclusive offers, and the chance to trial new and unreleased products."* (same "trial new products" hook as the footer — consistent messaging).
- Email input labeled "Please enter your email..." → **"Sign up"** (black pill) / **"Maybe later"** (text button). After submit: 1 s spinner → "thank you" state with mail icon; the code is stored to `sessionStorage.active_discount` (auto-applied at checkout).
- All email forms (modal, footer, back-in-stock) share one component (`contact-form gtag-form`) feeding **Klaviyo** (AU list id `PQCZkH`; forms also fire GA events via the `gtag-form` class).

### 3.3 Region / geo system
- First visit: a **Cloudflare worker** (`country-code-redirect-worker.hismileteeth.com`) detects country and JS-redirects to the right regional storefront (Slovenia → `eu.hismileteeth.com`, URL gets `?rdr=1`). Shopify's own `/browsing_context_suggestions.json` is fetched as a fallback/signal.
- Cookies: `slCCodes`, `dontRedirect`, `localization`, `cart_currency`. Manual switch via the header/footer `<select>`.
- **Implication for Nasmeh.si:** from Slovenia we were silently served the EU store in EUR with EU-specific products/prices and EU-specific creative — all content is regionalized, same theme everywhere.

---

## 4. Tech stack observed (homepage-relevant)

- **Platform:** Shopify, **multi-store per region** (`hismile.myshopify.com`, `hismileeu.myshopify.com`, `hismileus.myshopify.com`), all running the same **custom Vite + Vue 3 SPA theme ("Hismile Vite")** — client-side rendered, lazy sections via IntersectionObserver (`lazyload-component`), code-split components (`PageSectionHero`, `PageSectionCatalog`, `UiMarquee`, `UiModal`, `UiStickyBar`…). Theme deployed the same day we crawled (branch name `refactor/geo-tiktok-pageview-tracking 09/09`). Served via **Cloudflare**.
- **Email/SMS:** Klaviyo (onsite js, list-based forms; company id differs per region store).
- **Other apps:** Oxi Social Login, Social Snowball (referrals), Rakuten (affiliate), Sign in with Shop / Shop Pay, Shopify subscriptions enabled, Shopify MCP endpoint exposed at `/api/mcp`.
- **Pixels/data (cookies seen):** Meta (`_fbp`), TikTok (`_ttp`, `ttcsid`), Snapchat (`_scid`), Pinterest (`_pin_unauth`), GA4 + legacy UA, Klaviyo `__kla_id`, Rakuten. Custom front-end API at `api.hismileteeth.com` (regional discount codes, Klaviyo config).
- Page data ships in giant inline `window.*` arrays (`productArray`, `displayProducts`, `bundleProducts`, `nestedProducts`, `collectionArray`, `pageArray`) — e.g. `nestedProducts` contains **Mystery Gift A/B/C** variants (AU$29 / AU$15 / …, used for the free-gift tiers) and `bundleProducts` contains a **"Hot Deal – iD Stain Whitening Mouthwash" at AU$5.00 (max qty 1)** — a classic cart-threshold/upsell item.

---

## 5. Persuasion patterns to adapt for Nasmeh.si

1. **Offer architecture = GWP first, discount second.** Sitewide "FREE GIFT WITH ANY PURCHASE" (marquee + hero banner + every product-card badge) creates urgency without margin erosion; the % discount is gated behind email signup (popup after 55 s).
2. **One message, everywhere.** The same offer repeats in marquee, hero overlay, and product badges — repetition instead of multiple competing promos.
3. **Homepage = launch + bestsellers + bundle.** Hero promotes the newest product with UGC-style video; carousel merchandises 6 heroes with direct Add-to-cart; two bundle sections push AOV. Nothing else.
4. **Product cards as mini-PDPs:** variant swatches with "+N" overflow, sold-out states with back-in-stock email capture, direct ATC, badge overlays baked into card images.
5. **Copy formulas:** headline = outcome-verb + product ("Wipe away stains with…"); subcopy = ingredient + mechanism + benefit; email hook = "trial new and unreleased products" (community/exclusivity); bundle headline = "routine, sorted".
6. **Fake-button image banners** for promos (whole image clickable, CTA baked in) — cheap to produce, fast to ship, but text is unselectable/untranslatable — a tradeoff to consider for an SI/EU store.
7. **Sticky everything:** ticker + utility + nav stay pinned; cookie bar stays until answered.
8. **Explicit currency display** ("EU €19.99") and regional storefronts — relevant if Nasmeh.si sells beyond Slovenia.
9. **Deliberate omissions:** no search, no reviews, no press bar, no quiz on the homepage — traffic is expected to land on PDPs/collection pages from ads; the homepage is a routing + offer layer. (Worth deciding consciously whether we copy this or add social proof, since a new Slovenian brand has less recognition than Hismile.)
10. **Anti-friction details:** black pill CTAs everywhere (one button style = one action), magenta reserved for offers/prices/"Bundle & Save", consistent 3-email capture points (popup, footer, back-in-stock) all feeding one ESP.

**Do NOT copy:** brand names, product names (V34, PAP+, iD Stain, Tooth Armour…), exact copy lines, creatives, or the magenta-heavy brand identity wholesale — document patterns only.
