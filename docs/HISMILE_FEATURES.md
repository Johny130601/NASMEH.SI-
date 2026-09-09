# HISMILE_FEATURES.md — Complete Feature List of hismileteeth.com

**Purpose:** a build-grade specification of every feature on HiSmile's live storefront (`hismileteeth.com` + regional subdomains), compiled exclusively from the seven research dossiers in `docs/research/01–07` (all captured 2026-09-09). Precise enough to build a functional clone.
**Scope note:** `hismile.com` is parked (DNS null-routed to `127.0.0.1`); the live store is `hismileteeth.com` (Shopify Plus, shop ID 9164078) with regional storefronts on `us.`, `uk.`, `eu.`, `ca.`, `int.` subdomains. Features below describe the live storefront as rendered from an EU/Slovenian IP unless region differences are noted.
**Priorities** (build-relevance for a clone): **[P0]** = core, build first · **[P1]** = high-value, build second · **[P2]** = optional/later · **[Skip]** = deliberately absent or not worth cloning (see final section).

**Architecture context that shapes everything below:** Shopify Plus backend (6 separate regional stores) + a fully custom client-rendered Vue 3 SPA theme ("Hismile Vite", Vite build) mounted on `<div id="app">`; page data ships as inline `window.*` payloads (`productArray`, `displayProducts`, `bundleProducts`, `nestedProducts`, `collectionArray`, `pageArray`, `shopAttributes`, `customerAttributes`, `global_free_gift`, `global_theme`); a custom backend at `api.hismileteeth.com` serves promo config; a Cloudflare Worker does geo-routing. Cart/checkout are standard Shopify (`/cart.js`, `/cart/add.js`, `/checkout`).

---

## 1) Global / chrome

### 1.1 Announcement & header

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 1.1.1 | **Scrolling offer marquee** | Single message (currently `FREE GIFT WITH ANY PURCHASE`) duplicated ~14× into an infinite pure-CSS marquee (~28 s loop; duplicated flex tracks translating `-100% − gap`). Full-width brand-magenta band, white bold uppercase text; the entire bar is an `<a href="/collections/products">`. One message only — repetition, not rotation. | [P0] Cheapest sitewide offer surface; message/link must be admin-editable. |
| 1.1.2 | **Marquee ↔ discount-code swap** | When a `discount_code` cookie exists, the marquee is replaced by `Code: {CODE} applied 🎉` (code truncated to 25 chars). | [P1] Confirms code application without opening cart. |
| 1.1.3 | **Sticky header block** | Marquee + utility bar + main nav are one `position: sticky` block (z-index 10) that stays pinned; the header itself hides on scroll-down and returns on scroll-up (`translateY(-100%)→0`, .35 s). Header heights: 56 px mobile / 64 px desktop, white bg + 1 px hairline. | [P0] |
| 1.1.4 | **Utility / secondary bar** (desktop only) | Light-gray 2.5 rem bar above nav. Left: region selector (globe icon + styled native `<select>`, 6 options — Australia & NZ, United States, United Kingdom, Europe, Canada, International). Right: **Log in** (→ `/account/login`, swaps to **My account** → `/account` when logged in) and **Help centre** (→ `/pages/help`). | [P0] Login lives here, not in main nav. |
| 1.1.5 | **Main nav** | Logo left (lowercase wordmark), links left-aligned beside it, cart icon far right. Items: **SHOP ⌄** (mega-menu), **EXPLORE ⌄** (small mega-menu), **BUNDLE & SAVE** (direct link → `/collections/bundles`, magenta + star icon — the only colored nav item). No search icon, no account icon, no wishlist. Desktop links uppercase 500-weight with .1em tracking. | [P0] The pink "Bundle & Save" is their AOV play — visually privileged. |
| 1.1.6 | **SHOP mega-menu** | Hover-triggered full-width dropdown (fades in .3 s over the hero). Left: link list (*Shop all products, Shop best sellers, Shop bundles* + direct hero-product links). Right: **two featured-product media cards** (image tiles with "NEW" badges → PDPs) — doubles as a launch billboard for the two newest products. Content is nav-settings/metafield driven. | [P1] Mega-menu as merchandising surface, not just links. |
| 1.1.7 | **EXPLORE mega-menu** | Smaller dropdown: *Hismile Professional* link + one media card ("Learn about Hismile Professional") → B2B page. | [P2] Only relevant if a B2B line exists. |
| 1.1.8 | **Mobile nav drawer** | Hamburger (left), centered logo, cart (right). Drawer (max-width 329 px, slides from left) mirrors desktop: Shop accordion (same links + the 2 media cards), Explore accordion, plus a pink sale-styled link. Drill-down sub-panels slide in from right. | [P0] |
| 1.1.9 | **Cart icon + item dot** | Line-art bag icon, plain link to `/cart` (no drawer). When the cart has items, a 6 px magenta dot with a gentle 2.5 s pulse animation appears. | [P0] Deliberately *no* mini-cart drawer — see 5.1. |
| 1.1.10 | **Hover cart preview** ("Sidecart") | Desktop-only popover anchored to the cart icon: opens on `mouseenter` (only if cart non-empty and viewport > 990 px), closes 500 ms after `mouseleave`. Per item: 64×64 image, `{qty} x {title}`, line price; plus cart-level free-shipping and BNPL messaging. Pure preview — no qty editing, no checkout button. | [P2] |

### 1.2 Footer

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 1.2.1 | **Footer email capture** | Dark `#1C1C1E` band at top of footer. Hook is *product-trial exclusivity*, not discount: "Want the chance to trial our new products?" + copy about "exclusive offers, and the chance to trial new and unreleased products". Single email input with an in-input circular arrow submit button (no text); animated mail-fly-away success state. Feeds Klaviyo (`footer-form`, source `footer-signup`). | [P0] One of 3 email-capture points, all feeding one ESP. |
| 1.2.2 | **Footer link columns** | Flat 5-col grid on desktop, accordions on mobile: **Shop** (View all, Bundles, hero product links), **Support** (Help centre, Contact us, Log in/Sign up), **Explore** (Hismile Professional), **Follow** (Instagram, Facebook, YouTube, TikTok, LinkedIn). Region-conditional extras: **Exclusive Discounts** column (Students / Key Workers / Social Impact) only on AU/US/UK; **Careers** only on AU. | [P1] |
| 1.2.3 | **Payment icon row** | SVG strip: Visa, Mastercard, Apple Pay, Google Pay, PayPal, Afterpay, Klarna (region-filtered fuller set lives in cart — see 6.4). | [P0] Trust via payment logos, not badge apps. |
| 1.2.4 | **Footer bottom bar** | Light-gray bar: region selector (repeated), Terms and Conditions, Privacy Policy, copyright line. No address, no trust seals, no review stars. | [P0] |

### 1.3 Popups & overlays

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 1.3.1 | **Cookie consent bar** | Bottom sticky, dark translucent: cookie copy + **Accept** (solid pill) + **Decline** (text button). Custom-built, session-scoped: shown only if `sessionStorage.cookieModalHasBeenShown` unset and `allowCookies ≠ true`; both buttons dismiss and write session flags. **Not a real CMP** (even on the EU store). | [P0 for clone; upgrade to real CMP for EU compliance] |
| 1.3.2 | **Welcome discount modal** | Timer-triggered: `setTimeout` **55 s**, re-armed on every route change. **Suppressed** on `/cart` and `/account`, if `sessionStorage.has_interacted_with_welcome_modal`, if the visitor's email is already known (Klaviyo `isIdentified()` → `userEmailAcquired`), and disabled entirely for region CA (likely CASL). Bottom sheet on mobile, centered modal on desktop. Headline "Want {N}% off your first order?" where N is fetched live from `api.hismileteeth.com/api/klaviyo-info/{region}` (validated against `/api/discount-array/{region}`; fallbacks `WELCOME10` / 10). Email input → **Sign up** / **Maybe later** → 1 s spinner → thank-you state with "Shop all products" CTA; code stored to `sessionStorage.active_discount` for checkout auto-apply. AU/US/UK get a second **SMS opt-in step** ("Want an additional 10% discount code?"). | [P0] Their #1 capture device — deliberately *before* checkout, not exit-intent. |
| 1.3.3 | **Back-in-stock modals** | One hidden modal instance per product/SKU (`sold-out-modal-{SKU}`), opened from sold-out cards/PDPs: "We'll let you know when it's back!" + email form → Klaviyo. | [P0] Turns OOS demand into list growth. |
| 1.3.4 | **Sticky info banner** | Session-dismissible blue (`#007AFF`) bottom bar with text + underlined link + ✕; dismissal persisted in sessionStorage. Used for ops notices. | [P2] |
| 1.3.5 | **404 page** | "Page not found…" + link + **auto-redirect to home after 10 s**. | [P2] |
| 1.3.6 | **Password & challenge pages** | Shopify storefront password page and bot `/challenge` page exist as SPA routes (pre-launch/bot protection). | [P2] |

### 1.4 Geo / region system

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 1.4.1 | **Auto geo-redirect** | Before first paint the page hides (`opacity:0`) until geo resolves. Detection chain: `slCCodes` cookie (30-day) → Cloudflare Worker `country-code-redirect-worker.hismileteeth.com` (1.5 s timeout) → Shopify `/browsing_context_suggestions.json` (4 s) → `window.shopifyLocalization.isoCode`. Hardcoded country→store map (SI → EU; 45 European countries → EU; KW/SA → separate distributor store). Redirect preserves path + query + hash and appends `?rdr=1`, then sets `dontRedirect` (sessionStorage + 30-day cookie) so users are never bounced twice. Never redirects: Googlebot, preview URLs, `rdr=1` URLs, `/cart` paths, already-correct host. | [P1 for a single-market clone; P0 if multi-region] |
| 1.4.2 | **Manual region switch** | Header/footer `<select>` does a full `window.location.href` navigation to the chosen regional host with `?rdr=1` (suppresses re-redirect). **No in-session currency switching** — currency is per-store. | [P1] |
| 1.4.3 | **Per-region config injection** | Server injects `{domain, region, currency:{code,symbol,fullCode}, themeId, klaviyoList, paymentProvider, paymentProviderSplit}` per page; everything regional (prices, BNPL label, ESP list, free-shipping threshold, marquee variant for CA) keys off it. Cookies: `localization`, `cart_currency`. | [P0 as a config-layer pattern, even single-region] |
| 1.4.4 | **Language** | **English only** on all stores (`<html lang="en">`), including EU. Localization = currency + payment provider + region pages only; no language selector, no translations. | [Skip for a Slovenian store — localize instead; opportunity vs. them] |
| 1.4.5 | **Explicit-currency price format** | Prices render as three spans — region code + symbol + amount ("EU € 19.99"); round amounts drop decimals (€35, $29), non-round keep cents. | [P1] Kills currency ambiguity for cross-border shoppers. |

---

## 2) Homepage

Section order (top→bottom): marquee → utility bar → nav → hero → best-sellers carousel → magenta bundle banner → full-width bundle image banner → footer. Overlays: cookie bar, welcome modal, back-in-stock modals. Total height only ~2,100 px desktop — the homepage is a pure merchandising + offer router, not a brand site.

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 2.1 | **Split hero with autoplay video** | Left ~45%: H1 (formula: outcome-verb + product — "Wipe away stains with Tooth Wipes"), one-sentence subcopy (formula: ingredient + mechanism + benefit), black pill "Shop now" → PDP. Right ~55%: `<video autoplay loop playsinline preload="none">` UGC-style mp4 from Shopify CDN, `object-fit: cover`; separate mobile (414×272) and desktop (760×640) assets. Mobile stacks: media top, copy + full-width CTA below. | [P0] Hero = product-launch slot, swapped per campaign. |
| 2.2 | **Hero promo banner overlay** | An image strip baked with the sitewide offer ("FREE MYSTERY GIFT WITH ANY PURCHASE" + gift-box art) overlaid at the bottom of the hero video; separate mobile/desktop creatives. | [P1] |
| 2.3 | **"Shop our best sellers" carousel** | H2 + gray subcopy + white "Shop all >" pill → `/collections/products`. Horizontal-scroll rail (no desktop arrows; ~3.5 cards visible at 1440 px, ~1.2 on mobile to signal scrollability); items fade `opacity .3→1` when scrolled to center. Cards support **direct Add to cart** (see 3.3 card anatomy). Hidden per card: back-in-stock modal. Data caps `maxCartQuantity: 5`. | [P0] Frictionless ATC straight from the homepage. |
| 2.4 | **Magenta bundle banner** | Full-bleed brand-pink block: centered white H2 "Shop our bundles" + underlined white "Shop now" link → `/collections/bundles`. A visual "interrupt" between carousel and next section. | [P0] Trivial to build; pure AOV push. |
| 2.5 | **Full-width clickable image banner** | Entire creative is one image wrapped in `<a>` → bundle PDP; headline, subcopy, a **fake "Shop Now" button graphic**, product stack with "FREE\*" callout and the legal footnote are all **baked into the image** (desktop 2200×1077 + separate mobile asset). | [P1] Cheap/fast to ship; trade-off: text unselectable/untranslatable. |
| 2.6 | **Campaign theme system** | Four swappable homepage "themes" in config (`defaultTheme`, `toothWipesTheme`, `idStainMouthwashTheme`, `toothArmourTheme`) each swap hero video/copy, marquee, nav promo tiles; campaign overlays (e.g. free-gift overlay) spread on top. Server sets `window.global_theme`; hero content comes from a `home_hero_metafield` (`{copy, video{mobile,desktop}, marquee_text, marquee_link}`). Marketing switches the whole homepage with one flag — no deploy. | [P1] Build as admin presets from day one. |
| 2.7 | **Homepage absences (by design)** | No reviews/stars, no before/after gallery, no press/logo bar, no UGC/Instagram feed, no quiz, **no site search**. Social proof lives on PDPs; traffic is expected to land on PDPs/collections from ads. | [Skip] Decide consciously — a new brand may need more proof. |

---

## 3) Collection / listing pages

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 3.1 | **Collection banner image** | Full-width promo image above the grid (~4.8:1, separate mobile crop); banner text can be hidden via toggle (`collectionBannerHideText`). | [P1] |
| 3.2 | **Collection switcher (tabs)** | Styled native `<select>` listing *All products / Whitening Collection / Best sellers / Bundles*; selecting navigates to `/collections/<handle>`. Acts as the only "filter". | [P0] Catalog is small (~15 SKUs/tab) — merchandising order replaces faceting. |
| 3.3 | **Sort dropdown** | Second styled `<select>`: Recommended (default) / Newest / Price (low–high) / Price (high–low) / Title (a–z) / Title (z–a); selection appends sort to the URL path (`/collections/products/price-low`, route `/collections/:handle/:sortOrder?`). | [P0] |
| 3.4 | **Product grid** | Responsive grid (2-col mobile → multi-col desktop, `row dense`) mixing standard 1-col cards with **double-wide feature cards spanning 2 columns** (5 of 14 on All products) for editorial rhythm. Lazy-renders in batches with skeleton placeholders and fade-in; no page-number pagination UI (load-more/lazy batches). | [P0] |
| 3.5 | **Product card anatomy** | Top→bottom: promo pill ("FREE MYSTERY GIFT", lime `#D0FF00` bg / purple `#440099` text) → 1:1 packshot on `#F2F2F7` tile + image-badge sticker overlay (bottom-right on cards) → title (→ PDP) → price (code+symbol+amount, magenta) → variant swatch row (multi-variant only: ~3 round image swatches + "+N" overflow → PDP; sold-out variants get disabled state) → full-width CTA. | [P0] Cards are mini-PDPs. |
| 3.6 | **Card CTA states** | Three states by product type: **Add to cart** (single-variant; quick-add via `/cart/add.js`) · **Customise bundle** (bundle products → PDP/builder) · **⏰ Remind Me** (sold out → back-in-stock email modal). Sold-out cards swap the promo pill for a grey "Sold out" pill. | [P0] |
| 3.7 | **"From:" bundle pricing** | Build-your-own bundle cards prefix price with `From: €39.98` (grey .75 rem prefix). | [P1] |
| 3.8 | **SEO text block below grid** | Heading ("A bit about our Hismile Smilecare Products") + 2–3 sentence brand paragraph clamped behind a **"Read more +"** expander — indexable copy kept off the shopping path. | [P1] |
| 3.9 | **Merchandising-only collections** | Hidden collections power the frontend: `homepage-catalog`, `base-products`, `bundle-products`, `nested-products`, `exclude-discounts` (enforces "codes exclude bundles/discounted"), `all-products-sale`, `replacement`. `/collections/all` is `noindex`. | [P1] Backend pattern: use collections as rule buckets. |
| 3.10 | **No facets / no search / no breadcrumbs** | Zero faceted filtering (no price/ingredient/rating filters), no filter drawer on mobile, no collection search, no breadcrumbs anywhere on site. | [Skip] Viable only for small catalogs. |
| 3.11 | **Merchandising order strategy** | Recommended order = hero consumables first, sold-out items kept mid-grid (email capture), accessories lower. Order is curated, not algorithmic. | [P1] Admin must support manual ordering. |

---

## 4) Product detail pages (PDPs)

Rigid repeatable anatomy (DOM order): back-in-stock modal (hidden) → gallery → badge + H1 → reassurance pill → unit price → USP chips → intro + bullets → accordion set #1 → buy box → in-PDP upsell → education sections → FAQ → related products → sticky bottom buy bar (+ sitewide cookie bar & welcome modal).

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 4.1 | **Image gallery as sales asset** | Portrait 0.6875:1, images stacked vertically (mobile scroll) / left sticky column on desktop; first image `fetchpriority="high"`. 6–7 images mixing: packshot → clinical-stat graphic ("96% of participants…") → before/after → **Amazon-reviews screenshot** → lifestyle/how-to. Alt texts are marketing captions. Free-gift badge overlaid top-left on image 1. | [P0] The gallery replaces a review section. |
| 4.2 | **Title block + badges** | Product pill above H1 ("Selling Fast", "Best Seller", "NEW") + green uppercase "Money back guarantee^" reassurance pill; the `^` resolves to a substantiation accordion (see 4.7). | [P0] |
| 4.3 | **Unit-price anchoring** | Per-use price right under title/price: "(€2.50 per application)" — reframes €35 as €2.50/use (14 applications/pack). | [P0] High-leverage price psychology. |
| 4.4 | **USP chip row** | Icon + short-label chips ("Experts in whitening", "Whiter Teeth after Just One Use\*", "Whitening After 30-minutes\*"); product-specific trios driven by product data (`special_features` with icons). | [P0] |
| 4.5 | **Intro + checkmark bullets** | One intro line + 3–4 checkmark bullets from the product description (supports `<highlight>`/`<bold>` markup). | [P0] |
| 4.6 | **Buy box** | Region-coded price (~1.1 rem) + unit price → BNPL line ("Or 4 payments of €8.75 with Clearpay") → "Pay later with…" explainer accordion → quantity stepper (`− 1 +`, minus disabled at 1) → full-width **Add to cart** → guarantee pill repeated under the button. No compare-at strikethrough anywhere in the catalog — discounts are expressed as bundle value math instead. | [P0] |
| 4.7 | **Product accordion set** | Custom accordions with **lazy bodies (empty until opened)**. Pattern: "How it works" first, "List of ingredients" always present, plus claim-substantiation accordions (`^Money Back Guarantee`, `*Tested for results` citing a 44-person double-blind trial) — asterisked marketing claims resolve to these. | [P0] Clever compliance pattern; note SEO trade-off of lazy bodies. |
| 4.8 | **ATC button state machine** | `Add to cart` → `Adding...` (opacity .75) → `Added` (green `#34C759` flash), then browser **redirects to `/cart` ~500 ms later** (posts to standard Shopify `/cart/add.js`). | [P0] Redirect-to-cart is deliberate (cart = upsell page). |
| 4.9 | **Sticky bottom buy bar** | Fixed bottom bar, always on (not scroll-triggered), mirrors the buy box: price + unit price + BNPL line + qty stepper + ATC (blue in the bar vs. black in the buy box); on bundle PDPs the CTA reads "Add bundle to cart". | [P0] Their sticky-ATC pattern. |
| 4.10 | **FAQ section** | "Got questions? We've got answers" + 2–4 accordions near page bottom (usage, compatibility with veneers/caps/implants, kid-safety). | [P1] |
| 4.11 | **Related products** | "People also love — Shop our community favourites": 4 quick-add product cards (same component as collections) — curated routine cross-sells, not algorithmic similarity. | [P0] |
| 4.12 | **Sold-out PDP state** | Page stays fully merchandised (chips, description, accordions, FAQ, related all intact); ATC replaced by **⏰ Remind Me** → email modal; the "Bundle & Save" cross-sell **remains active** so OOS heroes still funnel to in-stock bundles. | [P0] Never unpublish OOS products. |
| 4.13 | **Nested variant PDPs** | Parent/child routes (`/products/toothpaste/watermelon`): ~80 flavour variants under one parent, each flavour addressable as its own PDP with title rewritten to the variant ("Watermelon Toothpaste") and per-flavour copy; round image-swatch selector with active ring + sold-out states; small visible subset + more via nested pages. | [P1] Their flavour/collab machine; the clearest differentiator to copy. |
| 4.14 | **Fixed bundle PDPs** | Long-form page merchandising **each component with its own mini-PDP block** ("What's in the Bundle:" → per-product story + 3 bullets); one item framed as FREE ("FREE: iD … Mouthwash"); routine framing ("Three products. One routine."); "See individual product pages for full product information." | [P0] |
| 4.15 | **Customisable bundle PDPs** | "Included" list = fixed items + **choice slots** ("Select Flavour (1/1)" → picker over variants). Data model: `bundleItems` = `fixed` groups + `choice_group`s with min/max; `pricingRules: fixed`; CTA "Add bundle to cart"; disclaimers inline. | [P0] |
| 4.16 | **Education/content sections** | Product-specific long-form blocks mid-page (colour-wheel explainer on the serum, "What Brushing May Miss" on the mouthwash), 50/50 image-text splits. | [P1] |
| 4.17 | **PDP absences (by design)** | No star ratings/review count, no breadcrumbs, no social share, no size guide, no shipping/returns accordion (shipping lives in Help centre; PDP carries only money-back + results-test reassurance), no video in newer galleries (UGC video moved to hero/LPs). | [Skip/Adapt] |

---

## 5) Cart

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 5.1 | **No drawer — dedicated `/cart` page** | Every ATC redirects the browser to `/cart` (~500 ms after add). The full cart page is the upsell workhorse; the only other surface is the desktop hover preview (1.1.10). Deliberate trade: drawer speed for upsell real estate. | [P0 — or adapt to a drawer containing the same modules] |
| 5.2 | **Cart header** | "Your cart (N)" with live count + cart total; a separate recurring-subscription total line appears when subscription items exist (infra present, currently dormant). | [P0] |
| 5.3 | **BNPL messaging row** | Desktop-only, when a regional provider applies: "Or 4 easy payments of $X with [logo]" — amount = cart total / split, provider + split from region config. | [P0] |
| 5.4 | **Free-shipping progress bar** | Animated fill: empty cart → **5% floor** (never looks unstarted); in progress → `(total/threshold)×100%`; reached **or** a qualifying "free-shipping SKU" in a ≥2-item cart → 100%. Three message states: empty ("Unlock free shipping on all orders over {symbol}{threshold}") → in progress ("📦 You're only {symbol}{amount} away…", amount = `Math.ceil(threshold − total)`) → reached ("🎉 Congratulations! You've unlocked free shipping!"). Digital-item disclaimer when cart contains non-shipping items. Thresholds served per region by the config API: **50** AU/US/UK/INT, **60** EU/CA (local currency) — set just above single-product price, near bundle price. | [P0] Cheap, proven AOV lever. |
| 5.5 | **"Unlock free shipping" SKU upsell** | Specific SKUs act as a free-shipping key: adding one to a multi-item cart flips the bar to 100%; promoted with an "UNLOCK FREE SHIPPING 🔓" pill/banner; such lines carry a `free-shipping` identifier + label pill. | [P1] |
| 5.6 | **Line items** | Per line: image (custom per-cart image support), title (custom/subscription titles), **coloured offer-label pills** above price (`FREE GIFT`, `FREE SHIPPING 🔓`, `BUY 1 GET 1`, `EARLY ACCESS`, `2 FREE V34`, `ONLY $1`, `5 FREE TOOTHPASTES`, `FREE REPLACEMENTS`, `FREE WHITENING`…), price with compare-at strikethrough + %-off logic (free items via a dedicated credit component; compare hidden ≤ $5), **qty as styled `<select>` 1–5** (no steppers; cap = `max_quantity: 5` with inline "Max quantity of 5x {product} per order."), remove via trash icon. Expandable accordions per line: "Show N items" (bundle contents: image, qty×title, price) and "Show benefits". | [P0] Label pills = high-perceived-value UI. |
| 5.7 | **Cart sorting rules** | Free gifts / zero-price items pushed to the bottom; sold-out items filtered from the interactive list; membership lines pinned/handled specially. | [P1] |
| 5.8 | **Conditional cart banners** | Preorder/mystery delay notices at line + cart level ("Your order contains the mystery flavours, it will be held and shipped on the week of…" — driven by `delayedShippingMessages` config) and "The Vault" teaser banner (two variants: "cheaper in The Vault" if a vault SKU is in cart, else "may be available cheaper"). | [P1] Preorder honesty doubles as trust. |
| 5.9 | **In-cart upsell shelf** | 4-product quick-add shelf under the cart (skeletons while loading); copy switches by mode — normally "People also love: …", during sales "Shop our best sellers — Explore our range of fan-favourites"; in club-credit mode switches to "Add to free shipping…". Renders even under the **empty cart** ("Looks like your cart is empty." + "Shop all products" CTA + payment icons + best-sellers carousel). | [P0] Even the empty cart is a merchandising surface. |
| 5.10 | **One-click image-tile upsells** | `cart-upsell` product image tiles with an animated price pill ("Only $X"); clicking adds instantly (no page nav); hidden when sold out; dedicated `upsellImage` metafield art per product. | [P0] |
| 5.11 | **Cross-sell banners in cart** | Image banners linking to bundles (e.g. Mystery Pack; licensed-edition bundle with "ADD 3 TOOTHPASTES FOR FREE" pill; discount auto-applied via code like `BUNDLE_42001…`). | [P1] |
| 5.12 | **Free-gift auto-management in cart** | The $0 gift line is auto-added/removed by cart logic (see 7.6), displays a "FREE GIFT" pill, sorts to bottom, and is excluded from quantity logic. | [P0] |
| 5.13 | **Cart page absences** | No coupon input box, no order notes, no gift wrap, no trust-badge strip, no shipping calculator (rates appear only inside checkout). | [P0 — keep it lean] |
| 5.14 | **Buy-now deep links** | URLs with `?add={sku}` clear the cart, add the item, and redirect **straight to `/checkout`** — used by ads/landing pages to skip the cart entirely. | [P1] Great for paid traffic. |
| 5.15 | **Purchase caps** | `maxCartQuantity` per product in catalog data: **5** for regular SKUs, **1** for bundles/hot-deals/gifts; enforced client-side (`useCartMaxQuantity`) with inline messages. Anti-bulk-reseller. | [P0] |

---

## 6) Checkout & payments

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 6.1 | **Checkout handoff with code lock-in** | On Checkout click: if an `active_discount` exists in sessionStorage, browser goes to `/discount/{CODE}?redirect=/checkout` (code locked in before checkout loads); otherwise straight to `/checkout`. | [P0] |
| 6.2 | **One-page checkout + extensibility** | Standard Shopify one-page checkout (information → shipping → payment) on Checkout Extensibility with **custom checkout components** (e.g. countdown timers) — a Plus-only capability. Order summary right-rail holds the **discount/gift-card field** (the only place a code can be typed). | [P0] Checkout UI itself is stock Shopify; customize only what Plus allows. |
| 6.3 | **Accelerated/express checkout** | Dynamic wallet buttons (Shop Pay, PayPal, Apple Pay, Google Pay) initialized on the **cart page** (and PDPs via portable wallets); subscription buyer-consent widget present; "Sign in with Shop" enabled on customer forms; Shop Pay cart-sync. | [P0] |
| 6.4 | **Region-filtered payment icon strip** | Static icon row under the Checkout button, filtered by shopper region: Visa/Mastercard everywhere; Amex (AU/US/UK/INT); Apple Pay/Google Pay/PayPal (AU/EU/INT/CA); Afterpay (AU/US/UK/CA/EU); Klarna (UK/EU); Zip Pay (AU); UnionPay/Alipay (INT). | [P0] For SI/EU: Visa, MC, PayPal, Apple/Google Pay, Klarna. |
| 6.5 | **Accepted payment methods** | Major cards, PayPal, Apple Pay, Google Pay, Shop Pay, Afterpay (AU/US) / Clearpay (UK/EU) / Klarna (UK/EU) / Zip (AU), Alipay/UnionPay (INT). Shopify Payments enabled; Apple Pay session lists Visa/MC/Amex/JCB. | [P0] |
| 6.6 | **BNPL as messaging system** | Region-driven provider label + split count (`paymentProvider: "Afterpay", paymentProviderSplit: 4`); "4 payments of $X" appears on PDP buy box, sticky bar, and cart; explainer accordion ("Build your cart / Choose at checkout / Instant approval decision / Split into 4, paid every 2 weeks") + minimum-spend footnote ($35 USD). AU also keeps a `/pages/zippay` info page. | [P0] For EU clone: Klarna or local BNPL (e.g. Leanpay), same pattern. |
| 6.7 | **Shipping rates & delivery promise** | Rates only surface inside checkout (no cart calculator). Published US rates: FedEx Smartpost $4.99 (3–7 business days), 2Day $13.99, Next Day $19.99, HI/AK $9.99; free standard shipping over the regional threshold; **1–4 business days processing**, dispatch 3–10 business days. Taxes/duties calculated in checkout per region. | [P0] Publish rates in help content; keep cart clean. |
| 6.8 | **Gift cards** | Digital, emailed alphanumeric codes, redeemable across Hismile online stores, **3-year validity**, not replaceable, not cash-exchangeable; SPA routes `/gift_cards/:id?/:token?` for lookup. | [P2] |
| 6.9 | **Form protection** | Shopify **hCaptcha** on all customer forms (login, register, recover, contact). | [P1] |

---

## 7) Upsells & promotions engine

The heart of the store. Fully custom (no Rebuy/AfterSell/Zipify): a registry of **27 upsell instances** in theme code + Shopify fixed-price bundle products + an API-driven promo config. Context: 80%+ of HiSmile orders reportedly contain bundles with ~4× larger carts.

### 7.1 Pricing architecture

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 7.1.1 | **4-tier promo ladder per hero SKU** | Every hero product has shadow promo products: single (anchor) → **Hot Deal** ($2.99–$10, 60–80% off, cart-only, max qty 1) → **Value Pack 2×** (~40% off) → **Triple Value Set 3×** and/or **Buy 3 Get 2 Free 5×**. Implemented as real Shopify products (mostly template `hide` — not browseable, exist only as upsell targets), so discounts never stack and fulfillment stays simple. Example (mouthwash, AUD): $24.99 → Hot Deal $5 → 2× $29.99 → 3× $34.99 → B3G2 $74.97. | [P0] Promotions-as-products, not discount rules. |
| 7.1.2 | **Price-point ladder** | Catalog prices cluster at $11 / $19.99 / $29–35 / $39.99–63.99 — impulse → hero single → duo/protocol → routine bundle. | [P0] Plan the ladder before pricing anything. |
| 7.1.3 | **Value-math anchoring (no strikethrough)** | No compare-at prices in catalog data; instead: "Get 2 for €24.99 — valued at €70\* — saving of 64%", "From: €39.98", "(€2.50 per application)". Footnoted claims (`*Discount based on full-price purchase of two boxes.`). | [P0] |
| 7.1.4 | **Hidden deal-SKU layer** | BOGO SKUs ("Buy One Get One Free – V34 Serum" $19.99), value packs, triples, "Hot Deal" minis, Black-Friday remnants (`-bfd` handles) persist in catalog with template `hide`, exposed contextually (PDP upsell, cart upsell, landing pages, ads). | [P0] |

### 7.2 Upsell rule engine

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 7.2.1 | **Rule primitives** | Each upsell instance = `{id, upsellProduct, displayRules, cartRules, actions, preset, choiceGroupSelection?}`. Display rules: `location.include/exclude` (page paths), `requiredProductsInCart`/`excludedProductsInCart` (`anyOf` product SKUs **or other upsell IDs** — upsells can chain), `requiredProductsInStock`, `includedRegions`/`excludedRegions`. Cart rules: `removeIfOnlyProductInCart` (bargain add-ons self-remove if they'd be the last item — prevents $5-only checkouts). Actions: `add` / `remove` / `redirect` (cart 2-pack upsell adds the value pack **and removes 1× single** in one action; PDP upsells redirect to `/cart`). `choiceGroupSelection` auto-picks variants (e.g. duplicates the trigger colour, with regional fallbacks). Lines tracked via `_upsell_id` line-item property + `add`/`atc_browse` URL params. | [P0] This is the machine — build it data-driven. |
| 7.2.2 | **Format A — "Upgrade and Save" (quantity upgrade)** | Green card on PDP + cart. Pill "Upgrade and Save" → headline "Get 2 for {upsellPrice} ~~{valuedAt}~~" → "Enjoy an instant saving of {percentageOff}\*…" → own "Add to Cart" → footnote "Adding this offer will replace one {product} item currently in your cart." Clicking **swaps** the single for the value-pack SKU. | [P0] Replace-not-swap microcopy prevents double items. |
| 7.2.3 | **Format B — "Stock Up & Save Even More"** | Yellow cart card: "Add {anotherText} {product} for just {upsellPrice}" (`addAnotherTextSku` makes it read "Add **another**…" when the single is already in cart) + "Price usually {comparePrice}. Instant saving of {percentageOff}\*". Bundle-PDP variants add bundle + discounted extra together, then redirect to cart. | [P1] |
| 7.2.4 | **Format C — "{percentageOff} Off Unlocked\*" (hot deals)** | Red cart-only cards: the $5/$10 Hot Deals. They form **dependency chains**: e.g. $5 mouthwash appears only once the cart already holds a value pack / starter bundle / another bargain; wipes bargain requires the wipes value pack. Each unlocked deal creates the next "you've unlocked X% off" moment. | [P0] Gated upsell chain: one great cart > three mediocre offers. |
| 7.2.5 | **Format D — "Bundle & Save" (starter-bundle cross-sell)** | Yellow PDP card on long-tail products: "Add a Starter Bundle for {upsellPrice}" + "A smarter way to start whitening with better value" + footnote. Shown on `/products/*` **except** an explicit exclusion list of ~12 hero/landing PDPs (which have dedicated upsells). | [P0] |
| 7.2.6 | **Upsell copy formula** | Fixed skeleton everywhere: coloured pill → headline with live price + strikethrough valued-at → instant-saving % → "Add to Cart" → single legal footnote. Template variables (`{{upsellPrice}}`, `{{percentageOff}}`) keep copy truthful at any price; EN/ES variants compiled in. | [P0] |

### 7.3 Free Mystery Gift (sitewide GWP)

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 7.3.1 | **Auto-add free gift** | `window.global_free_gift = true` campaign flag; any cart with ≥1 paid item auto-receives a $0 gift line (SKU `FREE_MYSTERY_GIFT`, properties `{_free_gift:"true", _max_cart_quantity:"1"}`); auto-removed if it would be the only cart item. | [P0] |
| 7.3.2 | **Weighted mystery pool** | Gift is drawn from ~25 hidden variants ("Mystery Gift A…Z", underlying values $1–$79) with **explicit probability weights (0.08 → 20)**: overstock/clearance SKUs get high weights, a $79 toothbrush sits at 2.5, jackpots at 0.08–0.11. A controlled lottery, not randomness; doubles as an inventory-clearance valve. | [P1] The "mystery" framing advertises the jackpot; cost stays tiny. |
| 7.3.3 | **Promo-cart exception rule** | Carts containing the loss-leader bundles (lip-balm bundle, hot-deal strips) skip the lottery and get a fixed low-cost gift SKU — margin protection while still honoring "gift with EVERY order". | [P1] |
| 7.3.4 | **GWP presentation layer** | Marquee ("FREE GIFT WITH ANY PURCHASE"), hero overlay banner, collection banner, global "FREE MYSTERY GIFT" pill on product cards, gift-box badge overlays (bottom-right on card images, top-left on PDP gallery), "FREE WITH EVERY ORDER" button, lime `#D0FF00`/purple `#440099` colorway. One offer repeated everywhere instead of many competing promos. | [P0] GWP-first protects price integrity vs. % discounts. |

### 7.4 Bundle systems

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 7.4.1 | **Best Seller Bundle (build-your-own wizard)** | Flat $63.99 AUD for 3/5/7-pack variants; pricing rule `first_x_paid`: pick 2/3/4 paid items → unlock 1/2/3 **FREE** items (paid pool: hero SKUs; free pool adds tooth wipes). 3-step wizard: "1. PICK {N}" → **"2. Choose your FREE products 🔒"** (locked until step 1 complete) → "3. Your Custom Bundle"; slot labels, "Add {n} more" progress, FREE/Save labels, per-pack savings total, results disclaimer. `maxCartQuantity: 1`. | [P0] The 🔒 + "FREE products" framing is the conversion lever — customers feel they're winning items. |
| 7.4.2 | **Flavour Build-A-Bundle** | Toothpaste BYO: pack-size tabs "3 Pack / 5 Pack" with "1 Free / 2 Free" callouts, category filters (fluoride / hydroxyapatite), "Our Picks" preselection, per-variant promo text. | [P1] |
| 7.4.3 | **Fixed bundles** | Browseable products: Whitening Duo $44.99, Perfect Pair $49.98 (2× mouthwash + strips), Whitening Protocol $49.99 (4 items + $0 guarantee SKU), Affordable Whitening Set $63.99, Starter Bundle $63.99 (fixed + 1 choice group of 8 flavours). Cart lines carry `_custom_bundle_details` JSON (component breakdown for 3PL splitting). | [P0] |
| 7.4.4 | **Lip-balm loss leader** | Pricing rule `first_x_free`: "Just pay shipping, first one free! Every extra just $2" (up to 10), 11 flavour SKUs, final-sale terms on the page; singles listed at $2 — an ads/traffic offer that feeds the cart upsell chain. | [P1] |
| 7.4.5 | **The Vault (daily deals)** | `/products/the-vault` routed template merchandising rotating "Daily Deals" in an orange/black theme — a deals surface separate from the main catalog, teased by the in-cart banner (5.8). | [P2] |

### 7.5 Discount codes & promo config

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 7.5.1 | **API-driven promo config** | `GET api.hismileteeth.com/api/klaviyo-info/{region}` returns live promo state: `{sale: true, welcome: {code: HELLO10, 10%}, cart_abandon_1: {CART10, 10%}, cart_abandon_2: {CART15, 15%}, browse_abandon: {CART15, 15%}, shipping_threshold, shop_symbol, shop_currency}`. Code names decoupled from display (% rendered from API; fallbacks WELCOME10/10) — marketing changes offers without a deploy. | [P0] Single config endpoint drives modal, flows, threshold UI. |
| 7.5.2 | **Escalating abandonment ladder** | Cart abandon email 1 = 10% (`CART10`), cart abandon 2 = 15% (`CART15`), browse abandon = 15% — delivered via Klaviyo flows, codes fetched/validated client-side. | [P0] |
| 7.5.3 | **Client-side discount store** | Codes validated against `/api/discount-array/{region}` ("Discount validation failed" on error); tracked as `verified_discounts`/`invalid_discounts`; `active_discount` persisted in sessionStorage and re-processed on every page/theme change; cart exposes `applyDiscount`. | [P0] |
| 7.5.4 | **Shareable code links** | All promos distributed as `/discount/{CODE}?redirect=...` links (banners, bundle tiles, emails) — clicked codes store + validate client-side first. **No coupon field on the cart page**; the only input lives in Shopify checkout. | [P0] Fewer "code didn't work" tickets. |
| 7.5.5 | **Uniform exclusion terms** | Every code: "excludes bundles, already discounted items, subscription or membership fees, delivery fees, gift cards, and cannot be used with other offers" — enforced via the `exclude-discounts` collection. One sentence protects all ladder margins. | [P0] |
| 7.5.6 | **Sale mode flag** | `"sale": true` in the config API flips sale-mode UI globally (nav "Bundle & Save" styling, sale-link classes); hidden `/collections/all-products-sale` for sale merchandising; historically 30–40% sitewide codes at peak events (Black Friday artifacts persist in catalog). Bundles are the **permanent** promo; %-off sitewides the **seasonal** layer. | [P1] |
| 7.5.7 | **Community discounts (30%)** | Students, key workers/NHS, "social impact" pages embed **Student Beans beansID** verification (`/pages/student-discounts`, `/pages/key-workers-discounts`, `/pages/social-impact-discounts`); footer column only on AU/US/UK. Keeps 30% codes out of the public code system and off coupon sites. | [P2] |

### 7.6 Guarantees & claim substantiation (risk reversal as promotion)

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 7.6.1 | **Money-back guarantee as merchandise** | A $0 pseudo-product ("7 Day Protocol – Satisfaction Guarantee", SKU `7-DP-SATISFACTION-GUARANTEE`) is bundled into the protocol bundle; V34 strips carry a 7-day money-back modal (full refund excl. shipping, claim within 7 days of receiving, customer pays return shipping, direct-store purchases only); strips cart image carries a "MoneyBack" badge variant; green "Money back guarantee^" pills under buy boxes. | [P0] |
| 7.6.2 | **Asterisk-claim footnote system** | Marketing claims carry `*`/`^` markers that resolve to PDP accordions and dated, region-specific footnotes ("#1 Mouthwash" footnoted to TikTok Shop US units / AU IQVIA Chemist Warehouse data with dates; clinical trial n=44, double-blind, "0% experienced sensitivity", "average 3.4 shades"). | [P0] Legal discipline is what lets the marketing stay aggressive. |
| 7.6.3 | **Unit-price anchoring** | "$2.79 per application"-style chips next to guarantee chips — reframe pack price as per-day cost. | [P0] |

---

## 8) Customer account & auth

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 8.1 | **Login page** | `/account/login` SPA route. Order: title "Login" → "Don't have an account? Sign up" link → **social login block first** (Oxi Social Login iframe with Facebook / Google / Amazon buttons) → "Or" divider → classic Shopify email/password form (POST `/account/login`, hCaptcha) → "Forget your password?" inline toggle (also deep-linkable `#recover`) → full-width "Login". "Sign in with Shop" enabled on the Liquid form. Server errors read out of hidden Liquid error divs. Already-logged-in → redirect `/account`. | [P0] Social first, credentials second. |
| 8.2 | **Register** | Same social block + "Or" divider; fields: first name, last name, email, password, confirm password (client-side match validation only); **pre-checked marketing checkbox** (`customer[accepts_marketing]`); hCaptcha; submit → "We've just sent a confirmation email…" (double opt-in verification). | [P0] |
| 8.3 | **Forgot/reset/activate** | Inline recovery panel POSTs `/account/recover`; reset & activate are standard Shopify token flows (`/account/reset`, `/account/activate` with hidden id+token; password + confirm; server error/success boxes). | [P0] Stock Shopify — don't overbuild. |
| 8.4 | **Minimal account dashboard** | One screen: greeting "Hi, {firstName}" + three chevron rows — **My orders** (inline `?view=orders`), **Manage subscriptions** (external deep link to Shopify's hosted New Customer Accounts portal, shop-ID-specific), **Contact support** (→ `/pages/contact-us`) — plus Logout. Deliberately absent: address book, payment methods, loyalty, referral hub, wishlist, profile editing, tracking numbers, returns initiation (all deferred to Shopify's portal or absent). | [P0] Build less; defer to the platform portal. |
| 8.5 | **Order history cards** | Accordion per order: region-prefixed number (`AU1234567`), friendly date ("9th of September 2026"), **status pill** (unpaid→red; paid+shipped→green "Shipped"; paid+unshipped→amber). Body: line items matched by SKU to catalog (thumbnail + title + ×qty), first 3 items + "Show more"; shipping block "Shipped by {method}" + recipient address. **No carrier tracking number/link — status only.** Empty state "No orders to display". | [P0] (clone + add tracking links = easy win) |
| 8.6 | **Guest order lookup** | On `/pages/contact-us`: email + **region-prefixed order number** (hint `{REGION}1234567`) → `GET api.hismileteeth.com/api/shopify-order/{REGION}?order=…&email=…` → renders the same order card; a "Select your order" dropdown appears if the email has multiple orders — doubles as the support form's order-context picker. No login required. | [P0] Kills the #1 support ticket type. Region-prefixed order numbers = elegant multi-store trick. |
| 8.7 | **Customer data plumbing** | Server injects `window.customerAttributes = {profile, attributes, recentOrders, tags}` on every page; SPA customer store tracks `isLoggedIn`, `loginType`, orders, tags; analytics enrich with `phone_e164`, `shopify_cid`; header login link swaps to "My account" when logged in. | [P1] |
| 8.8 | **Subscriptions management (outsourced)** | `supportsSubscriptions: true` infra exists (separate recurring total in cart, buyer-consent widget), but `selling_plan_groups: []` on hero products — **no active consumer subscriptions**. "Manage subscriptions" is entirely Shopify's hosted portal; the SPA has zero subscription UI beyond the deep link. Club Hismile (paid membership w/ monthly credits, member pricing) **ended August 2025**. | [P2/Skip] Dormant infrastructure; don't build for MVP. |

---

## 9) Support / FAQ / content

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 9.1 | **Help Centre page** | `/pages/help`: title + "Most popular questions" + exactly **5 hardcoded accordions** (Tracking says delivered / Returns Policy / Order status unfulfilled — "1–4 business days processing" / How does the hero product work / Can I edit or cancel my order). Every answer ends with "Not finding what you are looking for? Contact us" → contact page; CTA repeated in a bottom block. Curated top-5 instead of a sprawling help center. | [P0] |
| 9.2 | **Guided contact triage** | `/pages/contact-us`: "How can we help you today?" → **Step 1 topic grid** (icon cards: Track order, Change order, Cancel order [6 sub-reasons incl. "Didn't add discount code"], Return order, Order is wrong, Order is damaged [both with photo-attach instructions], Product advice, Report adverse event, Other) → **Step 2 order lookup** (8.6) → **Step 3 free text** (>10 chars validation). Submission composes a **`mailto:`** (to `help.orders@hismileteeth.com`, subject `Contact - {Topic} - {Sub-reason}`, body with order number + description) and navigates to it — **no ticketing backend, no Gorgias/Zendesk/Intercom**. | [P0 mechanics; upgrade to real ticketing in clone] |
| 9.3 | **AI support chatbot (Botpress)** | Botpress webchat v3.6 on the contact page: card "Need help? We've got you." + "Start Chat"; advertised topics: track order, returns & refunds, product questions, account support, adverse events; **commerce-capable** — can add products/bundles to cart mid-chat (dedicated handlers + error strings); custom brand-pink privacy overlay (Agree / Do not Agree) before chat starts; explicit human fallback (`help@hismileteeth.com`). | [P1] |
| 9.4 | **Adverse-event report form** | `/pages/report-adverse-event` (FormKit schema-driven): reporter details (incl. "Are you a medical practitioner?"), purchaser details ("Same as above" autofill), product details (**product name + batch number** "printed on product container", purchase date/place, proof-of-purchase flag), injured-person details (DOB, injury date, medical treatment, cause — "we will require a medical report later"), mandatory privacy consents. Submits via mailto to `help@` **bcc `legal@`** with a numbered 25-field plain-text body. Regulatory-compliance surface for cosmetics. | [P1] Directly applicable to EU cosmetics compliance. |
| 9.5 | **FAQ & shipping blog silos (SEO-only)** | Shopify blogs `help-centre` (146 FAQ articles) and `shipping` (27 region/warehouse articles, per-lane dispatch tables, non-shipped-countries lists). **Quirk:** the SPA router has no `/blogs` route — URLs return correct server-side `<title>`/meta but render the SPA 404 view. Effectively crawl fodder; the real help UX is 9.1–9.3. | [Skip as-is; render them properly in a clone = organic-win] |
| 9.6 | **Policy pages** | `/pages/terms-conditions` + `/pages/privacy` on a `terms-privacy` template with **sticky table-of-contents nav**. Contents: 30-day change-of-mind returns (unused/unopened, contact support **first** with photos, approval before sending, no prepaid labels, tracked return, original shipping excluded, promo discount value not refunded); 3-stage faulty-product claims (troubleshoot → photo/video + **LOT/batch number** assessment within 14 business days → physical inspection); shipping terms (risk passes on delivery scan, **no address changes after order confirmation**, authority-to-leave default, lost-after-delivery = carrier's problem); gift-card terms (3-year validity); SMS terms (TCPA + GDPR, checkout phone = consent, **max 30 msgs/month**, STOP opt-out); privacy rights + officer email; Rakuten data-sharing disclosure. Standalone Email Disclaimer page. | [P0] Copy the *structure*, not the text. |
| 9.7 | **Support channels** | AI chat + structured mailto forms + direct mailboxes (`help@`, `help.orders@`, `returns@`, `legal@`, `privacy@`, `partnerships@hismileteeth.com`) on Google Workspace MX. Stated hours: within one business day, 8am–4pm AEST. **No phone, no WhatsApp, no social-DM support.** | [P1] |
| 9.8 | **Careers page (AU only)** | Brand/culture page with Vimeo culture-video modal, values copy, "View current job opportunities" → shortlink → Employment Hero job board. | [P2] |
| 9.9 | **Hismile Professional (B2B)** | `/pages/hismile-professional` landing for dental professionals; when on it the nav gains "Professional Login" → shortlink → Shopify B2B customer-accounts auth on a **separate B2B store** (shop ID 59101053090, passwordless login). | [P2] |
| 9.10 | **No content-marketing blog / no About page** | Brand storytelling lives in PDP/landing content; the only blogs are the two SEO silos (9.5); no dedicated about/our-story page (`/pages/global` just redirects home). | [Note] |

---

## 10) Marketing / analytics / email

| # | Feature | Mechanics | Priority note |
|---|---------|-----------|---------------|
| 10.1 | **Klaviyo email/SMS backbone** | Per-region Klaviyo accounts (company IDs differ per store; region list IDs injected via `shopAttributes.klaviyoList`, e.g. AU `PQCZkH`, EU `QdNC3R`); onsite JS + Shopify web pixel with `enableAddedToCartEvents`; theme tracks Viewed Product; 8.2M active profiles across 6 stores (case-study figure). All capture forms (welcome modal, footer, back-in-stock) share **one component** (`contact-form gtag-form`) feeding Klaviyo and firing GA events. | [P0] One ESP, per-region lists, one form component. |
| 10.2 | **Three-pronged capture strategy** | Popup (10% off first order, 55 s timer), footer (product-trial exclusivity), back-in-stock (OOS demand) — three different hooks, one ESP. Klaviyo identification re-checked every page and **gates capture UI**: known subscribers never see the modal (`userEmailAcquired`). | [P0] |
| 10.3 | **SMS program** | Second modal step (AU/US/UK only: "+10% for SMS"), dedicated `/pages/sms-signup` landing (template `sms-landing-page`) for ad/social list building; TCPA/GDPR terms in T&Cs (order notifications + abandoned-cart reminders + marketing, max 30/month). | [P1] |
| 10.4 | **Abandonment & remarketing events** | Theme pushes `cartInit` GTM event (SKU, value, qty, currency) on first non-empty cart; FB Conversions API `AddToCart`; Google Ads `begin_checkout` conversion (tag `AW-941915507` with labels for purchase/add_to_cart/begin_checkout); `abandonment_tracked` flag; Klaviyo Checkout Started flows deliver the CART10→CART15 ladder. Email captured at 55 s — *before* a cart can become anonymously abandoned. | [P0] |
| 10.5 | **GTM container** | `GTM-NVLHZ77`: Meta pixels ×2 (**IDs populated dynamically per geo**), TikTok pixel (per-region IDs, `ttq.identify` hashed email/phone — matches theme branch `geo-tiktok-pageview-tracking`), Google Ads, GA4 ×3 properties, DoubleClick floodlight, Pinterest, Snapchat, Microsoft UET. Pixel IDs are config, not code. | [P0] Build pixel IDs as admin settings from day one. |
| 10.6 | **Shopify web pixels (consent-aware)** | Klaviyo app pixel, Google & YouTube channel (server-side-ish Google Ads conversions), Rakuten Advertising pixel (`ranMid: 50300`, `serverPixelEnabled: true`), one unidentified app pixel. Plus Shopify native Trekkie/Monorail + perf-kit RUM. | [P1] |
| 10.7 | **Affiliate & referral** | **Social Snowball**: sitewide `referral.js` + full-viewport signup iframes on `/pages/hismile-affiliate-program`; refer-a-friend reported at ~£10 credit + friend discount; T&Cs contain a full Ambassador & TikTok Affiliate Program agreement (personal links, commission, non-disparagement, `partnerships@`). **Rakuten Advertising** runs alongside for network-affiliate attribution. | [P2] |
| 10.8 | **Social proof without reviews** | No review app: PDP gallery screenshots of Amazon reviews; "#1" claims footnoted to TikTok Shop/IQVIA sales data; clinical-trial stat blocks; UGC-style video creative (ads look like TikTok content); Trustpilot (≈2.6/5) kept off-site, staff reply to reviews there. | [Note — see final section] |
| 10.9 | **Licensed collaborations as promo engines** | Barbie™, The Simpsons™, Reese's™, Chupa Chups editions (toothpastes $15 vs $13 standard, toothbrush colorways) — built-in launch moments, gift appeal, and cart cross-sell banners. | [P2] Pattern: collab = campaign, not just SKU. |
| 10.10 | **Agentic commerce endpoints (emerging)** | Shopify's 2025-26 agentic stack present: `/api/mcp`, `/.well-known/ucp`, `sitemap_agentic_discovery.xml`, `agents.md` — store is purchasable by AI agents via Shop Pay. Comes free with Shopify. | [P2/awareness] |

---

## 11) Platform / admin capabilities (what the backend must support)

Reverse-engineered from the tech-stack mapping: Shopify Plus (6 expansion stores) + custom Vite/Vue SPA theme + custom config API + Cloudflare. For a clone, these are the **admin capabilities** the features above imply.

| # | Capability | What it must do (grounded in observed frontend behavior) | Priority |
|---|-----------|----------------------------------------------------------|----------|
| 11.1 | **Product & variant CRUD** | Title, handle, rich body (accordions, bullets with `<highlight>`/`<bold>`), media library (images + mp4, alt text), SKU per variant, price in cents, compare-at field, barcode/weight, tags, product_type, vendor. | [P0] |
| 11.2 | **Inventory + sold-out flag + purchase caps** | `soldOut` boolean drives Remind-Me states; per-product `maxCartQuantity` (5 regular / 1 bundle/gift) enforced in cart. | [P0] |
| 11.3 | **Parent/child product model** | Nested PDP URLs (`/products/:parent/:child`) for flavour/variant pages with per-child title/copy. | [P1] |
| 11.4 | **Bundle entity** | Components (fixed groups + choice groups with min/max), pricing rules (`fixed`, `first_x_paid`, `first_x_free`), order-line expansion via `_custom_bundle_details` line properties for 3PL splitting. | [P0] |
| 11.5 | **Hidden promo SKUs** | Zero-price products (gifts, guarantee), template `hide` (unbrowseable but purchasable), exclusion from collections/discounts. | [P0] |
| 11.6 | **Custom fields / metafields (the #1 content pattern)** | Key-value JSON on products/pages driving: PDP accordions, USP chips, upsell art (`upsellImage`), hero content (`home_hero_metafield`), badges (`globalProductPill`, `globalProductCardBadge`, `globalProductImageBadge`), delayed-shipping messages. A flexible JSON custom-fields panel replicates ~80% of their content ops. | [P0] |
| 11.7 | **Collection manager** | Manual + merchandising-only collections, banner asset + hide-text toggle, sort orders, SEO fields, noindex toggle; rule-bucket collections (`exclude-discounts`). | [P0] |
| 11.8 | **Free-gift (GWP) rule engine** | Active flag (`global_free_gift`), gift SKU/pool with weights, display copy/CTA, max 1, auto-add/auto-remove-when-only-item, exception carts → fixed gift. | [P0] |
| 11.9 | **Upsell rule engine admin** | CRUD for upsell instances: target product, display rules (pages, cart contents, stock, regions), cart rules (remove-if-only), actions (add/remove/redirect), copy variables, color presets, active flag. (Their 27 instances live in code — put them in admin.) | [P1 — improve on their implementation] |
| 11.10 | **Discount code management + promo config API** | Code CRUD (%, fixed, free shipping, limits, dates, exclusions incl. "no bundles/no stacking"); a config endpoint per region serving welcome/abandon codes + %s + shipping threshold + sale flag so marketing changes offers without deploys; `/discount/{CODE}` shareable links. | [P0] |
| 11.11 | **Campaign theme presets** | Switchable bundles of homepage hero (copy + mobile/desktop video), marquee text/link, nav promo tiles, banners — one flag swap, no redeploy (their `global_theme` + 4 presets + overlay system). | [P1] |
| 11.12 | **Announcement/marquee + ops notices** | Marquee text/link setting; site-wide delayed-shipping notice setting; sticky info banner content. | [P0] |
| 11.13 | **Region/settings config layer** | Per region: domain, currency (code/symbol/fullCode), payment provider label + split, ESP list ID, free-shipping threshold, theme ID — all editable data. (They use 6 stores + a cross-store content-sync tool — vendor strings like `content-sync-dev-two`; a clone can start single-store EUR with this as an additive config layer.) | [P0] |
| 11.14 | **Marketing pixel settings** | GTM container ID, Meta/TikTok/Google/Pinterest/Snap/UET pixel IDs, conversion labels — data-driven per region, never hard-coded. | [P0] |
| 11.15 | **Pages CMS + navigation builder** | Rich pages with template picker (help, contact, terms with sticky TOC, landings, SMS signup); header/footer/mega-menu builder incl. image promo blocks. | [P0] |
| 11.16 | **Order management** | List/filter/search, statuses, refunds, notes, fulfillment export (CSV/API to 3PL) with bundle-component expansion; region-prefixed order numbers; guest-lookup API (order+email). | [P0] |
| 11.17 | **Customer management** | Accounts (legacy credentials + social), tags, marketing-consent flag, order history; defer addresses/payments/subscriptions to the platform's hosted portal. | [P0] |
| 11.18 | **ESP integration layer** | Identify/track (Viewed Product, Added to Cart, Checkout Started, Purchase), list embeds per region, back-in-stock capture, SMS — Klaviyo or equivalent. | [P0] |
| 11.19 | **SEO controls** | Per-page title/description/canonical/noindex, auto sitemap, editable robots; collection SEO blurb field. (Their execution is weak — see final section.) | [P0] |
| 11.20 | **Checkout customization (Plus-tier)** | One-page checkout, custom components (countdown timers), accelerated wallets; BNPL provider config (label + split count). | [P1] |
| 11.21 | **Gift cards** | Issuance/lookup, 3-year validity. | [P2] |
| 11.22 | **Deployment/workflow** | They ship by duplicating theme builds per feature branch (theme name = branch name, deployed same-day); per-region theme IDs. Clone equivalent: deploy previews + per-region config. | [Note] |

---

## What HiSmile does NOT have (gaps = opportunities for the clone)

Deliberate omissions and weaknesses verified across all seven dossiers — each is whitespace:

1. **No on-site reviews/ratings anywhere** — no star ratings on cards, no review sections, no review app (Okendo/Yotpo/Judge.me/Loox/Stamped all absent). Social proof = badges, clinical-stat graphics, before/after images, **screenshots of Amazon reviews**, UGC. Their Trustpilot is ≈2.6/5 and kept off-site. → *A real review platform with photo reviews is an instant differentiation win.*
2. **No site search** — zero search markup anywhere in the header or site. → *Add search; trivial trust/UX win.*
3. **No active subscriptions** — Club Hismile wound down (final charges Aug 2025); `selling_plan_groups` empty; only dormant infra remains. Retention runs on bundles + Klaviyo instead. → *Subscribe-&-save on consumables is open space.*
4. **No loyalty/points program** — no Smile.io/LoyaltyLion/Yotpo-loyalty code; membership ended. → *Points + referral hub inside the account is whitespace.*
5. **No SSR / weak technical SEO** — body is `<div id="app">`; all content, JSON-LD (`useJsonLdSchema` client-injected), and most meta require JS execution; **meta descriptions mostly empty**; **no hreflang** across 6 stores; FAQ/shipping blogs (146+27 articles) render the SPA 404 view. → *An SSR build with server-rendered content/meta/JSON-LD can out-execute them organically.*
6. **No faceted filtering, no pagination UI, no breadcrumbs** — viable for ~15 SKUs, limiting beyond that.
7. **No compare-at pricing** — discounts expressed only via bundle value math (deliberate; worth copying, not fixing).
8. **No mini-cart drawer** — deliberate trade for cart-page upsell real estate (copy the intent, adapt the format).
9. **No coupon field on cart, no order notes, no gift wrap, no shipping calculator, no trust-badge apps** — lean by design.
10. **No real help center or ticketing** — contact form composes a `mailto:`; help blog 404s in the SPA; no phone/WhatsApp/social-DM support; **no carrier tracking numbers in the account** (status only). → *Searchable help center + real ticketing + tracking links beat them on post-purchase UX.*
11. **No real cookie CMP** — session-scoped cosmetic banner even on the EU store. → *EU compliance opportunity.*
12. **English-only everywhere** — no localization on any regional store. → *Slovenian + English localization differentiates in SI/EU.*
13. **No content-marketing blog, no About page, no quiz, no press/logo bar, no UGC/Instagram feed, no wishlist** — homepage is a pure offer router relying on brand fame and ad traffic. → *A new brand should consciously add the trust surfaces they can afford to skip.*

---

*Sources: `docs/research/01-homepage.md` … `07-tech-stack.md` (all 2026-09-09). Third-party figures cited therein (Klaviyo case study, Buno Labs bundling stats, coupon aggregators, DTCetc shipping rates) are marked as such in the dossiers. Do not reuse HiSmile copy, product names, trademarks, or creative assets — this document specifies mechanics only.*
