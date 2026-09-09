# 07 — Tech Stack: hismileteeth.com (HiSmile)

Research date: 2026-09-09. All findings verified by fetching live pages, inspecting raw HTML/JS bundles, Shopify storefront endpoints (`/products.json`, `/cart.js`, `/products/<handle>.js`), the GTM container, and public case studies.

> **Note on domain:** `hismile.com` currently resolves to `127.0.0.1` (parked at Namecheap, DNS sinkholed). The live store is **`hismileteeth.com`** plus regional subdomains. Where others research "hismile.com", we document `hismileteeth.com`.

---

## 1. Platform: Shopify Plus — confirmed

Hard evidence from the live site:

| Signal | Value found |
|---|---|
| `Shopify.shop` JS global | `hismile.myshopify.com` |
| DNS CNAME (all regional hosts) | `*.myshopify.com` → `shops.myshopify.com` (23.227.38.x = Shopify) |
| Asset CDN | `cdn.shopify.com` preconnects in HTTP `Link` headers; assets under `/cdn/shop/t/994/…` |
| Shopify shop ID | `9164078` (visible in `shop.app/checkouts/internal/preloads.js?shop_id=9164078`; matches CDN file path `s/files/1/0916/4078/`) |
| Server headers | `server-timing: …; theme;desc="151475093569"; pageType;desc="index"`, `server: cloudflare` (Shopify edge) |
| Theme | `Shopify.theme = {"name":"refactor/geo-tiktok-pageview-tracking 09/09","id":151475093569,"schema_name":"Hismile Vite","schema_version":"1.0.0","theme_store_id":null,"role":"main"}` |
| robots.txt / sitemap | Standard Shopify-generated (`sitemap_products_1.xml`, `sitemap_pages_1.xml`, `sitemap_collections_1.xml`, `sitemap_blogs_1.xml`, plus `sitemap_agentic_discovery.xml`) |

**Plus tier** (not basic Shopify) is confirmed by:
- [Klaviyo case study](https://www.klaviyo.com/sg/customers/case-studies/hismile): "Klaviyo's native **Shopify Plus** integration … their **6 online stores**".
- [Shopify Plus case study (Chinese write-ups)](https://chuhaizhinan.com/2024/08/08/hismile-case-study/): one-page checkout + **custom checkout components** (e.g. countdown timers) — checkout customization is a Plus-only capability; ~$300M revenue, thousands of orders/minute at peaks.
- Live checkout loads `/checkouts/internal/preloads.js?…&default_configuration_id=950337` → **Checkout Extensibility** (checkout profiles/editor), the Plus-era checkout stack.

### The theme is a custom Vue SPA built with Vite ("Hismile Vite")

- `theme_store_id: null` → fully custom theme, not from the Theme Store.
- The HTML `<body>` is literally **`<div id="app"></div>`** with an empty `content_for_index` — Shopify serves a minimal Liquid shell; a **Vue 3 + Vite single-page app** renders the entire storefront client-side.
- Theme name in admin is a dev-branch name (`refactor/geo-tiktok-pageview-tracking 09/09`) → they ship by duplicating/renaming theme builds per feature; theme ID differs per region (AU `151475093569`, EU `167481245785`).
- Chunked Vite bundles under `/cdn/shop/t/994/assets/`: `theme-*.js` (~650 KB), `HomeView`, `CollectionView`, `ProductView`, `CartView`, `AccountView`, `PageView`, `PasswordView`, `NotFoundView`, plus UI primitives: `UiAccordion`, `UiButton`, `UiImage`, `UiInput`, `UiMarquee`, `UiPageSkeleton`, `UiStickyBar`, and composables: `useCartMaxQuantity`, `useDeviceSize`, `useJsonLdSchema`, `useRouteTransitionLock`, `header`, `productPageBundle`, `productPageCart`.
- **Client-side routes** (Vue Router): `/password`, `/challenge`, `/gift_cards/:id?/:token?`, `/cart`, `/collections/:handle/:sortOrder?`, `/products/:parentHandle/:childHandle` (contextual child-product URLs, e.g. bundles/landing variants), `/products/:handle`, `/pages/:handle/`, `/account/:handle?/:id?/:token?`, 404 catch-all.
- Data reaches the SPA via **inline hydration payloads** in the HTML: route manifests (page title/content/handle/template/SEO per page), product catalog objects (`globalId, variantId, handle, tags, sku, price, compareAtPrice, soldOut, maxCartQuantity, media.cart, seo, template`), and `window.*` globals.
- Fonts: CircularXX (Book/Regular/Medium, woff2, subset) + Pulp Display — self-hosted on Shopify Files.
- Storefront CSS file is only ~12 KB (`theme-*.css`); most styling ships inside Vue SFC chunks (CSS-in-JS). Breakpoints observed: `991px`, `768px`, `370px`, `300px`.

**Implication for Nasmeh.si:** HiSmile runs "headless-inside-Shopify" — maximal front-end freedom, but it breaks server-side rendering (see §7 SEO trade-offs). We can get the same UX with far less complexity using a normal SSR framework.

---

## 2. Multi-store / multi-region architecture

Six **separate Shopify stores** (Plus expansion-store model), each with own myshopify domain, currency, theme ID, and Klaviyo account:

| Host | myshopify domain | Currency | Klaviyo pixel account | BNPL provider label |
|---|---|---|---|---|
| `hismileteeth.com` (AU, flagship) | `hismile.myshopify.com` | AUD | `L7gAyy` | Afterpay (split 4) |
| `eu.hismileteeth.com` | `hismileeu.myshopify.com` | EUR | `KS4giy` | Clearpay (split 4) |
| `uk.hismileteeth.com` | `hismileuk.myshopify.com` | GBP | `KvPKey` | — |
| `us.hismileteeth.com` | `hismileus.myshopify.com` | USD | `Qdxgt5` | — |
| `ca.hismileteeth.com` | `hismileca.myshopify.com` | CAD | `JfaUe4` | — |
| `int.hismileteeth.com` (rest-of-world) | `hismileint.myshopify.com` | USD | `KAAhXK` | — |

- **Geo-routing:** a custom **Cloudflare Worker** `country-code-redirect-worker.hismileteeth.com` returns `{ip, country_code, geo_source:"cf"}`; the theme fetches it plus Shopify's native `/browsing_context_suggestions.json?country[enabled]=true` and redirects visitors to their regional store (cookie opt-outs `dontRedirect` / `slCCodes`).
- Per-page config object injected server-side: `{ domain, region, currency: {code, symbol, fullCode}, themeId, klaviyoList, paymentProvider, paymentProviderSplit }` — e.g. AU: `klaviyoList: PQCZkH`, `paymentProvider: Afterpay`; EU: `klaviyoList: QdNC3R`, `paymentProvider: Clearpay`.
- Product `vendor` strings betray a **custom cross-store content sync** tool: vendors like `hismile_dev`, `Hismile App Dev Store`, `content-sync-dev-two` — i.e. products are pushed/synced between the 6 stores by a private app rather than re-keyed.
- Same Google Ads tag (`AW-941915507`) is shared across stores; Klaviyo is per-region accounts (Klaviyo case study: "duplicate segments across different accounts").

**Implication:** even HiSmile doesn't run one global storefront — region = separate store + separate admin + separate marketing accounts. For Nasmeh.si (single market, Slovenia/EU), a single store with multi-currency is sufficient; but plan the admin data model so a second region is an additive config, not a rebuild.

---

## 3. Detected apps & integrations

### 3.1 Marketing / CRM

| Tool | Evidence | Role |
|---|---|---|
| **Klaviyo** (email + SMS) | Onsite JS `static.klaviyo.com/onsite/js/L7gAyy/klaviyo.js`; Shopify **web pixel** `accountID: L7gAyy` with base64 config `{"enableAddedToCartEvents": true}`; theme tracks `Viewed Product`/`trackViewedItem`; `klaviyoList` per region; [case study](https://www.klaviyo.com/sg/customers/case-studies/hismile): 8.2M active profiles, 6 stores, 1.2M AU profiles, 43% YoY flow-revenue growth, 76% campaign click-rate growth | ESP/SMS, flows (abandoned cart etc.), "Club Hismile" membership comms, VIP early access |
| **Social Snowball** | `api.socialsnowball.io/js/referral.js` + register-form iframes on the Affiliate Program page (`/register-form/18563/<uuid>`) | Affiliate/referral program, affiliate signup |
| **Rakuten Advertising** | `ecom-app.rakutenadvertising.io/rakuten_advertising.js`; Shopify web pixel config `ranMid: 50300`, `serverPixelEnabled: true` | Affiliate network attribution (server-side pixel) |
| **Student Beans** | `cdn.studentbeans.com/third-party/all.js` | Student discount verification |
| **Botpress** | Privacy policy: "We use Botpress to host and power our AI chatbot" | AI customer-service chatbot |
| TikTok affiliate/ambassador program | Footer terms links ("Hismile Ambassador and TikTok Affiliate Program T&Cs") | Creator/affiliate ops (off-site) |

**Not detected (checked explicitly, zero hits in HTML/JS/GTM):** Recharge, Loop, Skio, Appstle, Bold Subscriptions, Okendo, Yotpo, Judge.me, Loox, Stamped, Gorgias, Zendesk, Intercom, Rebuy, Nosto, Klevu, Algolia, Aftersell, Zipify, Elevar, Triple Whale, Northbeam, Hotjar, MS Clarity. Live `/products/<handle>.js` shows **`selling_plan_groups: []`** on hero products (Tooth Armour, V34 Colour Corrector, PAP+ Strips) → **no active subscription program** despite "Subscription Plans" boilerplate in the legal T&Cs. **No on-site product review app** — social proof is press/UGC/influencer-driven, not star ratings.

### 3.2 Payments & checkout

- Payment methods rendered in cart (`CartPaymentIcons` chunk): **Visa, Mastercard, Amex, PayPal, Apple Pay, Google Pay, Shop Pay (shop.app accelerated-checkout preloads), Afterpay (AU) / Clearpay (EU-UK) / Zip Pay / Klarna, Alipay, UnionPay**.
- One-page checkout with **Checkout Extensibility**; case study mentions **custom checkout components incl. countdown timers**.
- Shop Pay cart-sync (`init-shop-cart-sync`), portable wallets, `apple-pay-shop-capabilities` probe.

### 3.3 Shopify-native services in use

- Shopify AJAX cart (`/cart.js`), products API (`/products.json`, `/products/<handle>.js`), sitemap, gift cards (`/gift_cards/:id/:token`), password page, bot `/challenge` page, `shop_pay` accelerated checkout, **perf-kit** RUM (`shopify-perf-kit-3.8.10.min.js`), Monorail/Trekkie (Shopify's own analytics, `monorail-edge.shopifysvc.com`), `webmcp-0.1.1.js` + `/api/mcp`.
- **Agentic commerce (2025-26 Shopify stack):** `agents.md`, `/.well-known/ucp`, UCP/MCP endpoint `/api/ucp/mcp`, `sitemap_agentic_discovery.xml` — the store is purchasable by AI agents via Shop Pay with buyer approval. (Comes free with Shopify; irrelevant for a custom build today, but worth noting as a trend.)

---

## 4. Analytics & advertising pixels

Two delivery mechanisms run in parallel:

### 4.1 Shopify Web Pixels (sandboxed, consent-aware) — from `webPixelsConfigList` in page source

| Pixel | Config | Notes |
|---|---|---|
| Klaviyo app pixel | `accountID: L7gAyy` (AU; per-region IDs elsewhere) | `enableAddedToCartEvents`; purposes ANALYTICS+MARKETING |
| **Google & YouTube channel** (Shopify's native Google app) | `google_tag_ids: ["AW-941915507"]` with gtag conversion labels for `purchase`, `add_to_cart`, `begin_checkout` | Server-side-ish Google Ads conversions via Shopify integration |
| Rakuten Advertising | `ranMid: 50300`, `serverPixelEnabled: true` | Affiliate attribution |
| Unidentified analytics app | `apiClientId: 3624803`, empty config | 1 additional app pixel |

### 4.2 Google Tag Manager — container `GTM-NVLHZ77` (found in theme JS, fetched and inspected)

Tags inside the container:

| Platform | ID / evidence |
|---|---|
| Meta (Facebook) pixel | `fbq`/`fbevents` snippet; pixel IDs `534499463386691` and `2618208032221` (init via `window._pixel_id` — **populated dynamically per geo**) |
| TikTok pixel | `ttq` snippet; `ttq.identify` (hashed email/phone), `ttq.track("Purchase", …)`; pixel ID injected by GTM variables — matches theme branch name `geo-tiktok-pageview-tracking` (**different TikTok pixels per region**, pageviews routed by geo) |
| Google Ads | `AW-941915507` (also in GTM + web pixel) |
| GA4 | `G-8L3H5JV3FJ`, `G-K4916S3L0K`, `G-XGMLD8Z2X4` (multiple properties) |
| DoubleClick | floodlight refs (10 hits) |
| Pinterest | `pintrk` (3 hits) |
| Snapchat | `snaptr` (15 hits) |
| Microsoft/Bing UET | `uet` (6 hits) |

Also present: `google-site-verification` meta (Search Console), Shopify Trekkie/Monorail (native), perf-kit.

**Implication for Nasmeh.si admin:** pixel/ID configuration should be data-driven (per-region GTM/pixel IDs in an admin settings screen), not hard-coded — HiSmile clearly does this (geo-switchable Meta/TikTok IDs).

---

## 5. Merchandising & conversion mechanics (how features are actually implemented)

Reverse-engineered from hydration payloads and theme code:

1. **Promotions as products, not codes.** The catalog (74 products on AU) is full of promo SKUs: `Buy One Get One Free - V34 Colour Corrector Serum`, `Buy 3 Get 2 Free - iD Stain Whitening Mouthwash`, `Hot Deal - Pap+ Strips`, `Tooth Wipes - Hot Deal`, `7 Day Protocol - Satisfaction Guarantee` ($0-ish add-on). BOGO/bundle deals are **separate sellable products**, which makes them ad-targetable landing URLs (`/products/v34-serum-bogo`) and keeps fulfillment simple.
2. **Bundles & value sets as first-class products:** `Best Seller Bundle` (3/5/7-pack variants as separate products, SKU `BEST_SELLER_BUNDLE`, $63.99, `maxCartQuantity: 1`), `Triple Value Set`s, `Value Pack`s, `Perfect Pair Set`, `Whitening Protocol Bundle`. A **parent/child product model** exists (`/products/:parentHandle/:childHandle` route; `tooth-armour-toothpaste-serum-parent`, `-landing` and `-b` suffixed children). Theme chunk `productPageBundle` reads a **bundle definition** (metafield) and shows "Add Bundle to cart"; cart line items carry `_custom_bundle_details` JSON **line-item properties** (component breakdown for 3PL splitting).
3. **Free gift with purchase (auto-add):** `window.global_free_gift = true` toggles a campaign; config `freeGiftProduct` (SKU `FREE_MYSTERY_GIFT`, also `FREE_V34_SERUM`, both $0 products) with CTA "FREE WITH EVERY ORDER". The cart **auto-adds the gift variant** with properties `{_free_gift:"true", _free_gift_display_sku, _max_cart_quantity:"1"}`; gifts excluded from quantity logic. Marquee banner: "FREE GIFT WITH ANY PURCHASE".
4. **Cart rules:** every product carries `maxCartQuantity` (5 for regular, 1 for bundles/gifts) — enforced client-side (`useCartMaxQuantity`) and presumably server-side via checkout validation.
5. **Cart drawer upsells:** products have `customProductAsset.upsellImage` metafields (dedicated upsell art per product) → custom in-cart upsell module, **no upsell app**.
6. **Campaign theme presets:** server sets `window.global_theme` (e.g. `toothWipesTheme`); theme picks one of preset packs (`defaultTheme`, `toothWipesTheme`, `idStainMouthwashTheme`, `toothArmourTheme`) that override homepage hero, banners, marquee, nav images. Global merchandising switches = metafields/settings, not code deploys.
7. **Badge/pill system:** `globalProductPill`, `globalProductCardBadge`, `globalProductImageBadge` — product-card badges ("NEW", sale) driven by settings/metafields.
8. **Metafield-driven homepage hero:** `home_hero_metafield` = `{copy:{title, description, buttons[]}, video:{mobile:{src,w,h}, desktop:{src,w,h}, link, alt}, marquee_text, marquee_link}` — separate mobile/desktop video files (e.g. 414×272 vs 760×640 mp4 on Shopify's video CDN).
9. **Delayed-shipping messaging:** `delayedShippingMessages` setting — ops can broadcast fulfilment delays site-wide from admin.
10. **PDP content structure:** accordions (`productAccordions` with title + bullets), bullet-point lists with `<highlight>`/`<bold>` markup, icon+text feature chips (e.g. "USB-C Rechargeable" with 30×20 icons), template `standard-template-refresh`.
11. **Collection UX:** client-rendered grid, **"Load more" pagination** (not infinite scroll), optional sort (`/collections/:handle/:sortOrder?`), collection banner image setting; `/collections/all` is `noindex`.
12. **Membership:** "Club Hismile" = Klaviyo-list-driven VIP club (early access, 48h promos) — email-gated, **no loyalty-points app**.
13. **Discount codes:** standard Shopify discount codes surface in `/cart.js` (`discount_codes[]`); no evidence of an automatic-discount engine beyond promo products + free gift.
14. **Student discount:** Student Beans verification → presumably unique codes.

---

## 6. Mobile vs desktop approach

- **Single responsive SPA**, standard viewport (`width=device-width, initial-scale=1`); `useDeviceSize` composable; breakpoints ~991px (tablet/desktop split), 768px, plus small-phone tweaks at 370px/300px.
- **Separate mobile/desktop creative everywhere it matters:** hero videos (mobile 414×272 vs desktop 760×640), hero banners (mobile 1242×816 vs desktop 2280×1920), collection banners — all as distinct metafield assets, swapped client-side. Pattern: art-directed per breakpoint, not just CSS-cropped.
- No separate mobile site/app; there is **no native shopping app**; Shop app presence comes free via Shop Pay.
- Performance: HTTP/2 early hints (`server-timing: … earlyhints`), preconnects, woff2 font preloads, code-split routes (each view lazy-loaded), perf-kit monitoring. Trade-off: content is **client-rendered** (see SEO).

---

## 7. SEO patterns

| Area | What HiSmile does |
|---|---|
| URL structure | Standard Shopify: `/products/{handle}`, `/collections/{handle}`, `/pages/{handle}`, `/blogs/…`; lowercase hyphenated handles; contextual child URLs `/products/{parent}/{child}`; `/cart`, `/account/*`, `/gift_cards/*` |
| Titles | Hand-written, brand-suffixed: `Hismile™ Official \| At-home Oral Care`, `Sensitivity-Free PAP+ Teeth Whitening Strips \| Hismile™` (keyword-first on products) |
| Meta descriptions | **Mostly EMPTY** on homepage/PDPs (payload `seo: {description: ''}`; a few products have copy, e.g. V34) — they under-invest here; opportunity for us |
| Canonical | Present on every page (`<link rel="canonical">`) |
| Robots meta | `noindex` on `/collections/all`, `/account/*` — utility pages kept out of index |
| hreflang | **None** — regional stores are independent; geo handled by redirect worker, not SEO annotations |
| Open Graph | Only `og:image` (+secure_url, dimensions; 1200×628 home, 1041×1041 product) — no og:title/description (falls back to title) |
| Structured data | **Not in server HTML.** Injected client-side by `useJsonLdSchema` (schema.org `@context`, dynamic `@type` per page via VueUse head) — Google must execute JS to see it |
| Sitemap | Shopify auto sitemap index (products/pages/collections/blogs + `sitemap_agentic_discovery.xml`) |
| robots.txt | Shopify default + AI-agent instructions (UCP/MCP) |
| Rendering risk | Body is `<div id="app">` — **all content requires JS rendering**. Works for them at scale (brand demand), but it's a real organic-search handicap; for Nasmeh.si choose SSR/SSG so HTML carries content, meta, and JSON-LD server-side |
| Verification | `google-site-verification` meta present |

---

## 8. What Shopify's admin gives them → capabilities we must replicate

Shopify admin areas HiSmile visibly relies on, mapped to the custom admin we need to build:

### 8.1 Catalog
| Frontend feature observed | Backend/admin capability needed |
|---|---|
| Product pages with title, rich description (accordions, bullets, icons), media gallery | Product CRUD: title, handle/slug, rich body, media library (images + mp4 video), alt text |
| SKU on every variant (`10065-TA`, `BEST_SELLER_BUNDLE`), price in cents, compare-at price field | Variant/SKU management: SKU, price, compare-at price, barcode, weight |
| `soldOut` flag, `maxCartQuantity` per product (5 regular / 1 bundle/gift) | Inventory tracking (available/sold-out) + per-product max-order-quantity rule |
| Colorways as separate products (6 electric-toothbrush colors) + parent/child products | Product grouping/relationships (parent → children), or variants — decide one canonical model |
| Bundles with `_custom_bundle_details` component breakdown | Bundle entity: component SKUs + quantities; order line must expand components for fulfillment/3PL |
| $0 gift SKUs (`FREE_MYSTERY_GIFT`) | Ability to sell zero-price products, hidden from collections |
| Product `tags[]`, `product_type`, `vendor` fields | Tagging for merchandising/automation rules |
| PDP templates (`standard-template-refresh`), `template` per page/product | Assignable content templates per product/page |
| Metafield-driven accordions, upsell images, hero content, badges | **Custom fields on products/pages** (key-value JSON edited in admin) — this is their #1 content pattern |

### 8.2 Merchandising & promotions
| Frontend feature | Admin capability |
|---|---|
| Collections (`/collections/*`), curated + sortable, banner images, hide-banner-text toggle | Collection manager: manual + rules-based collections, banner asset, SEO fields, noindex toggle |
| BOGO / "Hot Deal" / "Value Set" products | Promo-as-product workflow (duplicate product, special price) **or** native discount engine (automatic discounts: buy X get Y, spend thresholds) |
| Free gift auto-added to every order, toggleable (`global_free_gift`), gift display config | Gift-with-purchase rule engine: active flag, gift SKU, display copy/CTA, max 1, auto-add & auto-remove when cart empties |
| Discount codes in cart | Discount code CRUD (codes, %, fixed, free shipping, usage limits, dates) |
| Product badges/pills ("NEW"), marquee text + link | Global merchandising settings screen (badges, announcement bar/marquee) |
| Campaign "theme presets" (per-launch homepage looks) | Theme/campaign presets: switchable bundles of homepage hero, banners, colors |
| Checkout countdown timer, custom checkout blocks | Checkout-level promo modules (for custom build: cart/checkout upsell + urgency components) |
| Delayed shipping messages | Site-wide ops notice setting |

### 8.3 Orders, customers, fulfillment
| Frontend feature | Admin capability |
|---|---|
| Cart with line-item properties (`_free_gift`, `_max_cart_quantity`) | Order line attributes preserved from cart → order → fulfillment export |
| One-page checkout, BNPL (Afterpay/Clearpay/Zip/Klarna), wallets (Apple/Google/Shop Pay), PayPal, cards, Alipay/UnionPay | Payment provider integrations relevant to SI/EU: cards, PayPal, Apple/Google Pay, **Klarna/Clearpay-style BNPL**, local options (e.g. Valú/leanpay in SI) — and admin order states per payment status |
| Multi-currency per region store | Currency config (single-currency EUR is fine for launch; design for adding currencies) |
| Customer accounts (`/account/login`, order history, legacy Shopify accounts) | Customer accounts: login, order history, addresses; guest checkout |
| Club Hismile (email VIP list, early access) | Customer segments/lists export to ESP; "membership" = marketing list flag |
| 8.2M profiles in Klaviyo, per-region accounts | ESP integration (Klaviyo or equivalent): identify, track events (Viewed Product, Added to Cart, checkout, purchase), list embeds |
| Orders at thousands/minute peaks | Order management: list/filter/search, statuses, refunds, notes, fulfillment export (CSV/API to 3PL) |

### 8.4 Content & configuration
| Frontend feature | Admin capability |
|---|---|
| Rich content pages: Help Centre/FAQ, Contact, Careers, Professionals (B2B), Injury Report (product-safety form), SMS landing, T&Cs/Privacy with anchor TOC | Pages CMS: title, slug, rich body, template picker, SEO fields |
| Nav with image blocks (`navImageBlocks`), footer with legal links | Navigation/menu builder (header, footer, mega-menu images) |
| Geo-redirect worker + region config (`domain, region, currency, klaviyoList, paymentProvider`) | Region/settings config: domain, currency, payment provider label + installment split, ESP list ID — all per-region editable |
| GTM/pixel IDs per region, geo TikTok pixels | Marketing settings: GTM container ID, Meta/TikTok/Google/Pinterest/Snap/UET pixel IDs, conversion labels — data-driven, not hard-coded |
| Sitemap, robots, canonical, noindex toggles | SEO controls: per-page title/description/canonical/noindex; auto sitemap.xml; editable robots |
| Blog (Shopify blog sitemap exists) | Optional blog CMS |
| Gift cards | Gift card issuance/lookup (can defer) |
| Storefront password page, `/challenge` bot page | Pre-launch password mode (nice-to-have) |
| Theme duplication per release, per-region theme IDs | (Custom build equivalent: deploy previews + per-region config, no admin needed) |
| Cross-store product sync (vendor strings) | (Single store: n/a. If we go multi-region later: shared catalog service) |

---

## 9. Key takeaways for Nasmeh.si

1. **HiSmile = Shopify Plus + fully custom Vue SPA theme.** We can match the *features* with a conventional SSR storefront (Next.js/Nuxt or similar) and avoid their client-side-rendering SEO handicap.
2. **No subscriptions, no on-site reviews, no loyalty app** — their retention engine is Klaviyo (email/SMS) + promo products + free gifts. Our MVP doesn't need subscription/review/loyalty modules to match them.
3. **Their promo engine is content, not code:** BOGO/bundles/gifts are products and metafield settings editable by marketers. Our admin should prioritize: product+bundle CRUD, free-gift rule, badges, marquee, campaign presets, custom fields.
4. **Metafields/custom-fields are the backbone** of their CMS (heroes, accordions, upsell art, banners). A flexible JSON "custom fields" panel per product/page replicates 80% of their content ops.
5. **Tracking is config-driven and geo-aware** (GTM + per-region pixel IDs + Shopify web pixels + server-side Rakuten/Google). Build pixel IDs as admin settings from day one.
6. **Multi-region = separate stores** in their world; for us, one EUR store with a region-config layer keeps the door open.
7. **Payments to match in SI/EU:** cards, PayPal, Apple/Google Pay, Klarna (or local BNPL like Leanpay), plus localized copy for "4 interest-free payments" (their `paymentProvider`/`paymentProviderSplit` pattern).
8. **Where they're weak (opportunities):** empty meta descriptions, no hreflang, JS-only content/JSON-LD, no site search, no reviews — an SSR build with solid technical SEO and on-site reviews can out-execute the inspiration site on organic search.
