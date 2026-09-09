# HiSmile Research Slice 04 — Upsells & Promotions

**Date of research:** 2026-09-09
**Store analyzed:** `hismileteeth.com` (HiSmile's live storefront; `hismile.com` currently redirects/blocks — the AU store is the canonical Shopify storefront, `hismile.myshopify.com`, Shop ID 9164078)
**Region analyzed:** AU (AUD) as default, with US/UK/EU/CA/INT comparisons where available.

---

## How this data was gathered (method note)

HiSmile runs a **custom headless storefront**: a Vue 3 SPA (Vite build, theme name "Hismile Vite") on top of Shopify, with a custom backend at `api.hismileteeth.com`. Pages render almost no server-side HTML, so most findings below come from:

- The `window.*` data payloads embedded in every page (`productArray`, `displayProducts`, `bundleProducts`, `nestedProducts`, `pageArray`, `global_theme`, `global_free_gift`, …)
- The compiled theme JS (`theme-*.js` + lazy chunks: `CartDefault`, `HomeDefault`, `BasicProductTemplate`, `ProductBestSellerBundle`, `ProductLipBalmBundle`, `ProductFlavourBuildABundle`, `ProductVaultBab`, `MainView`, `CartPaymentProviderMessaging`, …) — these contain the **entire upsell rule engine and all promo copy, verbatim**
- HiSmile's **public config API** (`api.hismileteeth.com/api/klaviyo-info/{REGION}`) which returns live discount codes and the free-shipping threshold per region
- Shopify JSON endpoints (`/products.json`, sitemaps)
- Wayback Machine snapshots + third-party sources (Student Beans, coupon aggregators, Trustpilot)

This means the mechanics below are not guesses from screenshots — they are read from HiSmile's own production configuration.

---

## TL;DR — the 12 most important findings

1. **Every hero product has a 4-tier promo ladder**: single → "Hot Deal" add-on (60–80% off, cart-only, limit 1) → "Value Pack" 2× (~40% off) → "Triple Value Set" 3× / "Buy 3 Get 2 Free" 5×. All implemented as Shopify products with embedded bundle definitions.
2. **A fully custom, rule-based upsell engine** (no Rebuy/AfterSell/Zipify) renders upsell cards on PDPs and the cart page, with display rules (required/excluded products in cart, region, page), and **"replace" logic** (adding a 2-pack removes the single from the cart).
3. **Upsell copy is formulaic**: pill ("Upgrade and Save" / "Stock Up & Save Even More" / "{{percentageOff}} Off Unlocked*"), headline ("Get 2 for {{upsellPrice}} {{valuedAtPrice}}"), savings line, CTA "Add to Cart", and a legal footnote ("*Discount based on full-price purchase of two bottles.").
4. **Free Mystery Gift with EVERY order** (currently live): a $0 auto-added cart item, randomized from a ~25-SKU pool with explicit probability weights (0.08 → 20). Supported by marquee "FREE GIFT WITH ANY PURCHASE", product-card badges, pills, hero/collection banners.
5. **Gamified build-a-bundle**: "Best Seller Bundle" — pick 2/3/4 paid items, unlock 1/2/3 FREE items, flat price $63.99 AUD. 3-step wizard ("1. PICK {n} …", "2. Choose your FREE products 🔒", "3. Your Custom Bundle").
6. **Lip-balm loss-leader**: "Just pay shipping, first one free! Every extra just $2" — a $0-first-item bundle (up to 10), final-sale terms shown on the page.
7. **Discount-code funnel is API-driven and escalating**: welcome popup offers **HELLO10 (10%)** after a 55-second delay; cart-abandonment emails use **CART10 → CART15**; browse-abandon uses CART15. Codes exclude bundles/discounted items and never stack.
8. **Free shipping threshold**: $50 (AU/US/UK/INT) or 60 (EU/CA) in local currency — served per-region by the config API.
9. **30% community discounts** via Student Beans beansID embeds (students, key workers/NHS, "social impact"), kept out of the on-site code system.
10. **Money-back guarantees as conversion tools**: "7 Day Protocol – Satisfaction Guarantee" bundled into the Whitening Protocol Bundle; 7-day money-back modal on V34 Strips; "$2.79 per application" value anchoring.
11. **No review app on-site** — social proof is screenshots of Amazon reviews in PDP carousels and "#1 Mouthwash" claims footnoted to TikTok Shop US / IQVIA Chemist Warehouse sales data. (Trustpilot is 2.6/5 — they keep it off-site.)
12. **Sale mode is a config flag** (`"sale": true` in the API) plus a permanent pink **"Bundle & Save"** nav link; historically sitewide coupons run 30–40% off (Black Friday "bfd" product handles persist in the catalog).

---

## 1. Live promotion state (as of 2026-09-09)

From `window.global_theme = "toothWipesTheme"`, `window.global_free_gift = true`, and the theme config merge (`{...activeTheme, ...freeGiftCampaign}`):

| Surface | Live content |
|---|---|
| Announcement marquee | **"FREE GIFT WITH ANY PURCHASE"** → `/collections/products` |
| Hero (video) | "Wipe away stains with Tooth Wipes" (toothWipesTheme) → `/products/exfoliating-tooth-wipes` |
| Hero banner image | "Hero_Banner_-_FREE_Mystery_Gift" creative (desktop + mobile variants) |
| Collection banner | "Collection_Banner_-_FREE_Mystery_Gift" creative, text hidden (`collectionBannerHideText: true`) |
| Free-gift module | SKU `FREE_MYSTERY_GIFT`, button **"FREE WITH EVERY ORDER"** → `/collections/products`, lime-green bg `rgba(208,255,0,1)` + purple text `rgba(68,0,153,1)` |
| Product-card pill | "FREE MYSTERY GIFT" pill (same lime/purple) applied globally |
| Product-card & image badges | `Free_Mystery_Gift_Badge.png` overlay, bottom-right on cards, top-left on images |
| Sale flag | `"sale": true` in the config API |
| Nav sale link | **"Bundle & Save"** (pink, `sale: true` styling + icon) → `/collections/bundles` — always in nav |
| Homepage sale banner (below hero) | "Shop our bundles" / "Shop now" → `/collections/bundles`, brand-pink background |
| Homepage showcase | "Your everyday whitening routine, sorted." → `/products/affordable-whitening-set` |

Theme system: 4 swappable homepage themes exist in the config (`defaultTheme`, `toothWipesTheme`, `idStainMouthwashTheme`, `toothArmourTheme`) — each swaps hero video/copy, marquee, and nav promo tiles. Campaign overlays (like the free-gift overlay `n2`) spread on top of the active theme. **Pattern to copy: a content store keyed by campaign, switchable with one backend flag — no redeploy.**

Marquee examples per theme (rotation inventory):
- "FREE GIFT WITH ANY PURCHASE" (free-gift overlay)
- "NEW Tooth Wipes, available NOW"
- "New Tooth Armour Toothpaste Serum. Order NOW"
- "Save on select products in our available bundles"
- CA region gets its own marquee variant per theme (`marqueeData.ca`).

---

## 2. Discount-code system (API-driven)

Live config from `GET https://api.hismileteeth.com/api/klaviyo-info/{REGION}` (verified identical structure across AU/US/UK/EU/CA/INT):

```json
{
  "sale": true,
  "welcome":        { "code": "HELLO10", "percentage": "10%" },
  "cart_abandon_1": { "code": "CART10",  "percentage": "10%" },
  "cart_abandon_2": { "code": "CART15",  "percentage": "15%" },
  "browse_abandon": { "code": "CART15",  "percentage": "15%" },
  "shipping_threshold": 50, "shop_symbol": "$", "shop_currency": "AU"
}
```

Uniform **terms** attached to every code:
> "Discount excludes bundles, already discounted items, subscription or membership fees, delivery fees, gift cards, and cannot be used with other offers"

Mechanics:
- **Escalating abandonment ladder**: cart abandon #1 = 10%, cart abandon #2 = 15%, browse abandon = 15%. Delivered via Klaviyo flows; codes are fetched client-side and validated against a discount API (`/api/discount-array/{region}` — 403 to anonymous, used internally; validation error string: "Discount validation failed").
- Codes are uppercased, verified, and stored in `sessionStorage` as `active_discount`; the cart has an `applyDiscount` action. Discounts are auto-applied/validated in the cart context.
- An `exclude-discounts` Shopify collection exists in the sitemap — used to enforce the "excludes bundles/already discounted items" rule.
- Note the code names are **decoupled from display**: the modal headline "Want {N}% off your first order?" is rendered from `percentage` returned by the API (fallback code `WELCOME10`, fallback 10%). Marketing can change the offer without a deploy.

### Free-shipping thresholds (from same API)

| Region | Threshold | Currency |
|---|---|---|
| AU | 50 | AUD |
| US | 50 | USD |
| UK | 50 | GBP |
| INT | 50 | USD |
| EU | 60 | EUR |
| CA | 60 | CAD |

The threshold is a **data value, not theme copy** — any "you've unlocked free shipping"-style UI can be driven per market from one config. (No hard-coded "free shipping" string exists in the theme JS.)

---

## 3. Welcome email-capture modal (the first-order discount)

Component `UiWelcomeModal` (in `MainView`), fully reconstructed:

- **Trigger**: 55-second timer (`setTimeout(…, 55e3)`), re-armed on every route change.
- **Suppression rules**: hidden on `/cart` and `/account`; hidden if `has_interacted_with_welcome_modal` (sessionStorage); hidden if `userEmailAcquired`; **disabled entirely for region CA** (likely CASL anti-spam compliance).
- **Step 1 (email)**: headline **"Want {10}% off your first order?"** — the % is fetched live from `api.hismileteeth.com/api/klaviyo-info/{region}` (`data.welcome.code` + validated value; fallback "WELCOME10"/10).
  - Subcopy: "Join the smile care community for the latest news, exclusive offers, and the chance to trial new and unreleased products."
  - Single email input ("Please enter your email..."), CTA **"Sign up"**, dismiss link **"Maybe later"**.
  - Submission goes to Klaviyo (list `PQCZkH` from `window.shopAttributes.klaviyoList`); loading spinner → mail icon → after 1s transitions to thank-you step.
- **Step 2 (thank-you)**: "Thanks for signing up!" + "It's time to elevate your routine, with products designed to make a statement on your bathroom basin, while transforming your oral health." + **"Shop all products"** button → `/collections/products`.
- Modal chrome: bottom/center positioned, size "md", close enabled; footer of site repeats the same newsletter value prop ("Join the smile care community…").
- There is also a dedicated **SMS signup landing page** (`/pages/sms-signup`, template `sms-landing-page`) for list building from ads/social.

---

## 4. The product promo ladder (pricing architecture)

All prices AUD from live catalog (`/products.json` + `bundleProducts`). Each hero SKU has shadow promo products; most promo variants use template `hide` (not browseable — they exist only as upsell targets).

### iD Stain Whitening Mouthwash ("gunk mouthwash")

| Offer | Price | vs single | Notes |
|---|---|---|---|
| Single | $24.99 | — | max 5/order |
| **Hot Deal** (bargain pack) | **$5.00** | −80% | cart-only upsell, max 1 |
| Value Pack (2×) | $29.99 | −40% | PDP + cart upsell target |
| Triple Value Set (3×) | $34.99 | −53% | browseable (`standard-template-refresh`) |
| **Buy 3 Get 2 Free (5×)** | $74.97 | −40% | browseable, max 1 |

### V34 Whitening Strips

| Offer | Price | Notes |
|---|---|---|
| Single | $39.00 | "MoneyBack" cart image variant; money-back guarantee modal |
| Hot Deal | $10.00 | cart-only, max 1 |
| Value 2-Pack | $29.99 | PDP upsell ("Get 2 for…") |
| Value Deal (1×, `-bfd` handle) | $29.99 | Black-Friday-deal remnant still in catalog |
| Triple Value Set (3×) | $39.99 | |

### Tooth Armour Toothpaste Serum

| Offer | Price | Notes |
|---|---|---|
| Single | $24.99 | |
| Hot Deal | $5.00 | cart-only |
| Value Pack (2×) | $29.99 | |
| Triple Value Set (3×) | $34.99 | |

### Exfoliating Tooth Wipes

| Offer | Price | Notes |
|---|---|---|
| Single | $14.99 | |
| Hot Deal | $4.99 | cart-only |
| Value Pack (2×) | $18.99 | upsell image literally named `Upsell-x2ToothWipes.png` |
| Triple Value Set (3×) | $23.99 | |

### V34 Colour Corrector Serum

| Offer | Price | Notes |
|---|---|---|
| Single | $24.99 | |
| **Buy One Get One Free (2×)** | $24.99 | true BOGO |

### Electric Toothbrush & consumables

- Single: $24.99 per color (8+ colors incl. licensed Barbie, Simpsons; parent listing $79.00 with 22 variants); **Value Pack 2× $38.99** (−22%).
- Replacement heads: $11.00–$13.00 (recurring-purchase anchor; parent product with 25 variants).

### Fixed bundles (browseable)

| Bundle | Contents | Price |
|---|---|---|
| Whitening Duo Bundle | V34 CC Serum + PAP+ Strips | $44.99 |
| Perfect Pair Set | 2× iD Mouthwash + V34 Strips | $49.98 |
| Whitening Protocol Bundle | Tooth Wipes + Tooth Armour + iD Mouthwash + V34 Strips + **7-Day Protocol Guarantee** ($0 line item) | $49.99 |
| Affordable Whitening Set | Tooth Armour + V34 Strips + iD Mouthwash | $63.99 |
| Starter Bundle | V34 Strips + iD Mouthwash + **choice of 1 toothpaste flavor** (choice group, 8 options) | $63.99 |
| Best Seller Bundle 3/5/7-pack | build-your-own (below) | $63.99 flat |

**Pricing-ladder pattern for Nasmeh.si:** the single price is the anchor; the 2-pack is the "hero deal" (~40% off); the bargain add-on ($5/$10, 60–80% off, limit 1) exists *only* as an in-cart reward to push checkout completion. All are first-class Shopify products with fixed-price bundle definitions — no discount codes needed, so margin is fully controlled and codes never stack on them.

---

## 5. The upsell rule engine (complete mechanics)

Defined in `theme.js` as a registry of **27 upsell instances** (`d0 = […]`). Each instance: `{ id, upsellProduct, displayRules, cartRules, actions, preset, choiceGroupSelection?, upsellData }`.

### Rule primitives

- `displayRules.location.include/exclude` — page paths (`/cart`, `/products/...`).
- `displayRules.requiredProductsInCart / excludedProductsInCart` — `anyOf: [{product: SKU} | {upsell: otherUpsellId}]` (upsells can chain/trigger each other).
- `displayRules.requiredProductsInStock` — only offer bundles that are in stock.
- `displayRules.includedRegions / excludedRegions` — e.g. ETB 2-pack **excluded in US/EU**, a "purple" fallback shown only outside INT/AU/UK/CA; mouthwash value pack **excluded in CA**; PAP+ bargain pack **AU-only**.
- `cartRules.removeIfOnlyProductInCart: true` — bargain add-ons self-remove if they're the last item (prevents $5-only checkouts).
- `actions.add / actions.remove / actions.redirect` — e.g. cart 2-pack upsell **adds `V34_STRIPS_VALUE_PACK` and removes 1× single** in one action; PDP upsells redirect to `/cart` after add.
- `choiceGroupSelection` — auto-picks variants (e.g. ETB 2-pack duplicates the trigger color, `from: "triggerVariant"`, with regional fallbacks: default black, US/EU purple).
- Upsells are tracked with a `_upsell_id` cart line property, and `add`/`atc_browse` URL params flag traffic sources.

### The three upsell "formats" (copy + intent)

**Format A — "Upgrade and Save" (quantity upgrade, PDP + cart).** Color preset `green`.
> Pill: **"Upgrade and Save"**
> Headline: "Get 2 for **{{upsellPrice}}** ~~{{valuedAtPrice}}~~"
> Body: "Enjoy an instant **saving of {{percentageOff}}*** when you buy two bottles in this bundle."
> Footnote: "Adding this offer will replace one iD Mouthwash item currently in your cart. *Discount based on full-price purchase of two bottles."

Instances: `product-v34-strips-value-pack`, `cart-v34-strips-value-pack`, `product/cart-stain-mouthwash-value-pack`, `product/cart-tooth-armour-value-pack` (+UK variant), `product/cart-tooth-wipes-value-pack`, `product/cart-etb-value-pack` (+purple variant), Spanish V34 variant ("Mayor Valor", "Compra y Ahorra").

**Format B — "Stock Up & Save Even More" (add one more of the same, cart).** Color preset `yellow`.
> Headline: "Add {{anotherText}} V34 Whitening Strips for just {{upsellPrice}}"
> Body: "Price usually {{comparePrice}}. Enjoy an instant **saving of {{percentageOff}}***"
> Footnote: "*Savings based on cost of singular box of V34 strips."

`addAnotherTextSku` makes the headline read "Add **another** …" when the single is already in cart. Instance: `cart-value-v34-strips` (+ variants triggered on bundle PDPs: starter-bundle, affordable-whitening-set, perfect-pair, mouthwash-value-set — these add **bundle + discounted extra strips together**, then redirect to cart).

**Format C — "{{percentageOff}} Off Unlocked*" (deep-discount cross-sell, cart-only).** Color preset `red`.
> Headline: "Add Tooth Armour for only **{{upsellPrice}}** ~~{{valuedAtPrice}}~~"
> Footnote: "*Savings based on cost of singular bottle."

These are the $5/$10 Hot Deals. They form a **dependency chain**: e.g. `cart-bargain-mouthwash` ($5 mouthwash) only appears once the cart already contains a value pack / starter bundle / another bargain upsell; `cart-tooth-wipes-bargain-pack` requires the wipes value pack; AU-only `cart-pap-strips-bargain-pack` requires the Lip Balm Bundle. The chain turns one good cart into a great cart step by step — each unlocked deal creates the next "you've unlocked X% off" moment.

**Format D — "Bundle & Save" (starter-bundle cross-sell on long-tail PDPs).** Color preset `yellow`.
> Headline: "Add a Starter Bundle for **{{upsellPrice}}**"
> Body: "A smarter way to start whitening with better value"
> Footnote: "*Savings based on non-discounted individual prices of items purchased separately. Toothpaste flavour as pictured."

Shown on `/products/*` **except** an explicit exclusion list of 12 strategic PDPs (all hero/landing pages, which have their own dedicated upsells).

### Where upsells render

- **PDP**: dedicated card module near ATC (templates `standard-template-refresh`, landing templates), plus a **sticky ATC bar** (`useStickyBar`, `UiStickyBar`) on scroll.
- **Cart page**: `cart-upsell-container--desktop` + `--tablet`, `cart-sticky__upsell` (sticky upsell bar), a catalog section headed **"Explore our range of fan-favourites"** with "Shop our best sellers" / "Shop all products" links, discount-code field, Afterpay messaging, payment icons, and a sticky checkout bar (`CartSticky`).
- **Cart drawer behavior**: free gift auto-add/remove; quantity steppers capped by per-family max quantities with inline message **"Max quantity of 5x {product} per order."** (singles max 5, bundles/promo packs max 1).

---

## 6. Build-your-own-bundle systems

### Best Seller Bundle (`best-seller-bundle-3/5/7-pack`) — flat $63.99 AUD

Pricing rule `first_x_paid`: pay 2/3/4 items → get 1/2/3 **FREE** (paid pool: strips, mouthwash, armour, PAP+ strips, CC serum; free pool adds tooth wipes). UI is a **3-step wizard** (bilingual EN/ES strings compiled in):

1. `stepPaidTitle`: "1. PICK {N}" (paid items)
2. `stepFreeLockedTitle`: **"2. Choose your FREE products 🔒"** (locks until step 1 complete)
3. `stepSummaryTitle`: "3. Your Custom Bundle"

Slot labels "Item 1…Item N", progress instruction "Add {n} more", "FREE"/"Save" labels, per-pack savings total, results disclaimer ("*Individual results may vary. Immediate results are temporary."). The free-items framing ("choose your FREE products") is doing the psychological heavy lifting — the customer feels they're *winning* items, not buying a bundle.

### Flavour Build-A-Bundle (toothpaste) — `ProductFlavourBuildABundle`

Pack-size tabs **"3 Pack" / "5 Pack"** with **"1 Free" / "2 Free"** callouts; filter categories (fluoride / hydroxyapatite); "Our Picks" preselection; per-variant promotion text. Toothpastes: $13 core flavors, $15 licensed (Barbie, Simpsons, Reese's).

### "Better For You" Bundle — `ProductBetterForYouBundle`

Same 3-pack/5-pack + free-item mechanic, merchandised on trust: **"ADA Approved"** logo, "Trusted by Dentists".

### Lip Balm Bundle (live loss-leader) — `ProductLipBalmBundle`

- Pricing rule `first_x_free` (1 free, up to 10 items), 11 flavor SKUs.
- Page copy: **"Just pay shipping, first one free! Every extra just $2"**
- Terms on page: "Free and $2 lip balms are final sale with no returns, unless otherwise subject to consumer law."
- Singles also listed at $2.00 — a traffic/ads offer (pairs with the AU-only PAP+ strips bargain upsell in cart).

### The Vault — `ProductVaultBab`

A `/products/...`-routed template nicknamed **"the-vault"** merchandising **"Daily Deals"** (orange/black theme) — a rotating deals surface separate from the main catalog.

---

## 7. Free Mystery Gift — full mechanics

The current sitewide GWP (gift-with-purchase):

- **Trigger**: any cart with ≥1 paid (non-gift) item → gift auto-added; cart logic removes it if it would be the only item (`removeIfOnlyProductInCart`-style guard in the cart store; gift identified by SKU or `_free_gift=true` line property).
- **Presentation**: $0 line item; marquee "FREE GIFT WITH ANY PURCHASE"; "FREE WITH EVERY ORDER" button; global "FREE MYSTERY GIFT" pill + badge overlays on product cards/images.
- **The pool** (`free-mystery-gift-item`, 26 hidden variants titled "Mystery Gift A…Z", underlying values $1–$79): each SKU has an explicit **weight** — this is a controlled lottery, not true randomness:

| SKU | Likely item | Weight |
|---|---|---|
| 40068-VI-XX | (hero freebie, highest) | 20.00 |
| 10028-TG-XX | Tooth gloss | 12.50 |
| 61004-LB-SC-XX | Salted Caramel lip balm | 13.13 |
| 61008-LB-SA-XX | Sour Apple lip balm | 5.32 |
| 40096-LS-XX | (mid) | 5.64 |
| 44003-FL-GB-XX | Floss/whitening (GB) | 6.08 |
| 44001-FL-BR-XX | Floss (BR) | 5.27 |
| 40110-WF-XX | (mid) | 3.47 |
| 61001/61005/61006/61007/61009-LB-* | other lip balms | 1.49–3.93 |
| 46001/46002-BT-* | (low) | 2.42–2.58 |
| **41004-ET-PU-XX** | **Purple Electric Toothbrush ($79 value)** | **2.50** |
| 40108-BO-XX | (low) | 1.30 |
| 52096-FF-YU-XX | (low) | 0.78 |
| 40041-MI-XX / 40015-CY-XX / 47000-DT-KW-XX | (rare) | 0.54 / 0.33 / 0.25 |
| **40001-PT-XX** | (jackpot) | **0.11** |
| **40091-CA-XX** | (jackpot) | **0.08** |

- **Exception rule**: carts containing `lip-balm-bundle` or `hot-deal-pap-strips` don't get the lottery — they receive a fixed SKU (`50023-WS`, PAP+/whitening strips) instead. (Protects margin on already-free/cheap carts while still honoring "gift with EVERY order".)
- **Why it's smart**: the $79-toothbrush possibility (advertised by the "mystery" framing) costs almost nothing at 0.08–2.5 weights; the weighted pool doubles as an **inventory-clearance valve** — overstocked SKUs get high weights.

---

## 8. Guarantees & risk-reversal as promotion

- **V34 Whitening Strips — 7-day Money Back Guarantee**: modal on PDP — full refund of purchase price (excl. shipping), claim within 7 days of receiving, customer pays return shipping, purchases via hismileteeth.com only. Cart image for the strips literally carries a "MoneyBack" badge variant.
- **Whitening Protocol Bundle**: includes a $0 line item **"7 Day Protocol – Satisfaction Guarantee"** — the guarantee is merchandise: *buy the protocol, follow it for 7 days, or get refunded*. Same modal copy pattern ("We're confident you'll love the products…").
- PDP copy pattern (V34 strips): "Whiter Teeth After Just One Use* / Not Satisfied? Get Your Money Back^ / Whitening After 30-minutes*" — asterisked claims resolved in footnotes.
- **Unit-price anchoring**: strips PDP feature icons include "**$2.79 per application**" next to "Money back guarantee" and "Experts in whitening" — reframing $39 as $2.79/day.

---

## 9. Payment-provider promo messaging

`CartPaymentProviderMessaging` (PDP + cart): region-switched BNPL module.

- AU: **Afterpay** — "Split into 4" installments, price/4 shown next to ATC (`paymentProvider: "Afterpay"`, `paymentProviderSplit: 4` in `window.shopAttributes`).
- Footnote: "*Afterpay requires a minimum spend of $35 USD per transaction" + explainer copy ("Add some of your favourite Hismile products to your cart, and head to checkout." / "Your purchase will be split into 4 installments, to be paid every 2 weeks.").
- UK: **Clearpay** (same 4-split, links clearpay.co.uk/terms). AU also maintains a `/pages/zippay` info page (Zip Pay).
- Wallets: Shop Pay (incl. Sign In With Shop), PayPal, Apple Pay — `supportsSubscriptions: true` in Apple Pay capabilities (infra exists; no consumer subscription offers currently visible).
- `ProductDelayedShippingMessaging` component renders per-product delayed-shipping notices (pre-sale/backorder transparency driven by `delayedShippingMessages` config).

---

## 10. Community discounts, affiliate & referral

- **Student discount — 30%**: `/pages/student-discounts` embeds Student Beans beansID (`<beansid-landing-page slug="hismile" territory="au">` + `cdn.studentbeans.com/third-party/all.js`). [Student Beans lists "30% student discount"](https://www.studentbeans.com/student-discount/us/hismile); [Vouchercloud corroborates 30% students + 30% NHS](https://www.vouchercloud.com/hismile-vouchers).
- **Key workers**: `/pages/key-workers-discounts` → beansID slug `hismile-discounts`.
- **"Social Impact" discounts**: `/pages/social-impact-discounts` → beansID slug `hismile-offers`.
  → All three discount communities are **outsourced to beansID verification**, keeping 30% codes out of the public code system (and out of coupon-site circulation as much as possible).
- **Affiliate program**: `/pages/hismile-affiliate-program` embeds a **Social Snowball** registration form (`api.socialsnowball.io/register-form/18563/…`) — affiliate/referral hybrid typical of Snowball (refer-a-friend cash/discount payouts).
- **Refer-a-friend**: coupon aggregators report **£10 credit per referred friend** + friend discount ([Savoo](https://www.savoo.co.uk/brands/hismileteeth-discount-codes), [HotDeals UK](https://uk.hotdeals.com/brands/hismile-discount-codes)) — consistent with Social Snowball mechanics. Two `referral` script references exist in the homepage head.
- **Professionals channel**: `/pages/hismile-professional` (B2B dental) with gated "Professional Login" — separate from consumer promos.

---

## 11. Social proof & claim patterns (promo-adjacent)

- **No on-site review widget.** PDP carousel images are screenshots of Amazon reviews ("Amazon reviews", "5 star Amazon review" alt texts); a `klaviyoReviewsProductDesignMode` global in older builds suggests Klaviyo Reviews was trialed. Trustpilot is [2.6/5](https://nz.trustpilot.com/review/hismileteeth.com) and kept entirely off-site.
- **"#1" claims with legal substantiation baked into PDP copy**, region-switched:
  - US/default: "*\"#1 Mouthwash\" based on units sold on TikTok Shop US in the category 'Beauty & Personal Care - Nasal & Oral Care - Mouthwash' (17/07/2026)."
  - AU: "*Based on AU Chemist Warehouse sales reported by IQVIA (24/08/2022–16/07/2026), highest single-calendar-week unit sales."
  - Plus "^Based on current reviews on amazon.au (16/07/2026)…"
- **Clinical proof block** (homepage, from Dec-2025 snapshot): "PAP+ clinical trial — 61.9% of participants improved by 3+ shades; 0% experienced sensitivity; average 3.4 shades; max 8 shades" with methodology (double-blind, placebo-controlled, n=44, third-party dentist, VITA shade guide).
- **UGC-style video** on PDPs (`v34_UGC_Below_the_Fold.mp4`) — ads look and feel like TikTok content; Motion's ad library shows evergreen offers like ["buy two get one free" breath spray with sold-out scarcity](https://motionapp.com/library/hismile).
- **Licensed collaborations as promo engines**: Barbie™, The Simpsons™, Reese's™ toothpastes/toothbrushes ($15 vs $13 standard) — built-in launch moments and gift appeal.

---

## 12. Historical/seasonal promo patterns

- Catalog retains **Black Friday artifacts**: handle `v34-whitening-strips-bfd` ("Value Deal" $29.99, was a BFD exclusive), SKU `10060-VS-XX`. Promo products are kept and re-pointed rather than deleted.
- Coupon aggregators show a standing ceiling of **30–40% off sitewide codes** during peak events ([Slickdeals](https://coupons.slickdeals.net/hismile/) — "40% off sitewide", "30% off sitewide", "10% first order with email signup"; [hotukdeals voucher page](https://www.hotukdeals.com/vouchers/uk.hismileteeth.com) — "40% OFF").
- A hidden `/collections/all-products-sale` collection exists for sale merchandising; the `sale` boolean in the config API flips sale-mode UI globally (nav sale link styling, `sale-link` classes on nav items).
- Wayback (Dec 2025) homepage already pushed "Shop our bundles" + PAP+ clinical-trial proof — bundles are the **permanent** promo; percentage-off sitewides are the **seasonal** layer.

---

## 13. Tech stack summary (relevant to implementation)

| Capability | HiSmile's choice | Evidence |
|---|---|---|
| Storefront | Custom Vue 3 SPA on Shopify ("Hismile Vite"), multi-region via `localization` cookie + geo-redirect worker | `<div id="app">`, `country-code-redirect-worker.hismileteeth.com` |
| Upsells/bundles | **Fully custom** rule engine + Shopify fixed-price bundles; line-item properties `_custom_bundle_details`, `_upsell_id` | theme.js registry (27 instances), `bundleProducts` payload |
| Email/SMS | Klaviyo (list `PQCZkH`; welcome/abandon codes served via custom API) | `window.shopAttributes`, `/api/klaviyo-info/{region}` |
| Verification discounts | Student Beans beansID (students/key workers/social impact) | beansID embeds |
| Affiliate/referral | Social Snowball | register-form iframe |
| BNPL | Afterpay (AU), Clearpay (UK), Zip (AU page); Shop Pay/PayPal/Apple Pay | `shopAttributes.paymentProvider`, messaging chunk |
| Reviews/social proof | Amazon-review screenshots + claim footnotes (no review app) | PDP media alt texts |
| Analytics | Shopify trekkie/perf-kit, custom `viewModal`/ecommerce events, `abandonment_tracked` flag | theme.js |

---

## 14. Actionable patterns for Nasmeh.si (do not copy copy — copy the mechanics)

1. **Build the 4-tier ladder per hero product** (whitening strips / gunk mouthwash / color-corrector serum map 1:1 to HiSmile's lineup): single → 2-pack "hero deal" (~40% off) → 3-pack → BOGO or B3G2. Implement as products, not discounts, so codes never stack against them.
2. **Add a €3–5 "Hot Deal" add-on, cart-only, limit 1, auto-removed if it becomes the only cart item** — HiSmile's $5 mouthwash is their cart-completion nudge.
3. **Gated upsell chain**: unlock the bargain cross-sell only after a value pack/bundle is in cart ("{{percent}} Off Unlocked*"). One great cart > three mediocre offers.
4. **Rule-based upsell cards** (PDP + cart) with the copy formula: colored pill → headline with live price + strikethrough → instant-saving % → one legal footnote. Template variables (`{{upsellPrice}}`, `{{percentageOff}}`) keep copy truthful at any price.
5. **Always-on GWP with weighted mystery gift**: "Free mystery gift with every order", $0 auto-add, weighted pool (clearance SKUs high, hero SKUs ~0.1–2.5), fixed-gift exception for promo carts. Marquee + card badges make it feel sitewide-big; cost stays tiny.
6. **BYO bundle wizard** with paid-then-FREE steps and a flat price ("Pick 3, choose your FREE products 🔒"). The 🔒 and "FREE" framing are the conversion levers.
7. **Loss-leader traffic product** equivalent to the free+$2 lip balm: e.g. a €2 whitening pen/"first one free, just pay shipping", final sale, feeding the upsell chain.
8. **API-driven promo config** (codes, %, free-shipping threshold per market, sale flag) so marketing changes offers without deploys; escalating abandon codes 10%→15% via Klaviyo flows; welcome modal on a ~55s timer, suppressed on cart/account and per-session.
9. **Regional free-shipping threshold just above AOV** (HiSmile: $50 where bundles cost $45–64 — the threshold is deliberately above the single-product price and near the bundle price).
10. **Guarantee as merchandise**: bundle a named "7-day whiter smile or money back" guarantee into the protocol bundle; surface "$X per application" unit pricing on strips.
11. **Keep discounts out of bundles** ("excludes bundles, already discounted items, gift cards, no stacking") — one sentence of terms that protects all ladder margins.
12. **Substantiate every claim in footnotes** with dated, region-specific sources (sales data, review counts, clinical trial stats) — HiSmile's legal discipline is what lets their marketing stay aggressive.
13. **BNPL messaging on PDP + cart** (Slovenia: Leanpay or PayPal Pay-in-3 equivalents; show price/4 next to ATC) with minimum-spend footnote.
14. **Outsource 30% community discounts** (students/key workers) to a verification service rather than public codes.

---

## Appendix A — Upsell instance registry (all 27, from theme.js)

`product-tooth-armour-value-pack`, `product-v34-strips-value-pack`, `product-spanish-v34-strips-value-pack`, `product-stain-mouthwash-value-pack`, `product-value-v34-strips-starter-bundle`, `product-value-v34-strips-aws`, `product-tooth-wipes-value-pack`, `product-etb-value-pack`, `product-etb-value-pack-purple`, `product-value-v34-strips-perfect-pair`, `product-value-v34-strips-mouthwash-value-set`, `product-starter-bundle`, `cart-tooth-armour-bargain-pack`, `cart-tooth-armour-bargain-pack-uk`, `cart-bargain-mouthwash`, `cart-bargain-mouthwash-uk`, `cart-bargain-v34-strips`, `cart-stain-mouthwash-value-pack`, `cart-tooth-armour-value-pack`, `cart-tooth-armour-value-pack-uk`, `cart-tooth-wipes-value-pack`, `cart-etb-value-pack`, `cart-etb-value-pack-purple`, `cart-tooth-wipes-bargain-pack`, `cart-v34-strips-value-pack`, `cart-pap-strips-bargain-pack`, `cart-value-v34-strips`.

## Appendix B — Verbatim upsell/promo copy blocks (for pattern reference only — do not reuse text)

- "Upgrade and Save" / "Get 2 for {{upsellPrice}} {{valuedAtPrice}}" / "Enjoy an instant saving of {{percentageOff}}* when you buy two bottles in this bundle." / "Adding this offer will replace one iD Mouthwash item currently in your cart. *Discount based on full-price purchase of two bottles."
- "Stock Up & Save Even More" / "Add {{anotherText}} V34 Whitening Strips for just {{upsellPrice}}" / "Price usually {{comparePrice}}. Enjoy an instant saving of {{percentageOff}}*" / "*Savings based on cost of singular box of V34 strips."
- "{{percentageOff}} Off Unlocked*" / "Add Tooth Armour for only {{upsellPrice}} {{valuedAtPrice}}" / "*Savings based on cost of singular bottle."
- "Bundle & Save" / "Add a Starter Bundle for {{upsellPrice}}" / "A smarter way to start whitening with better value" / "*Savings based on non-discounted individual prices of items purchased separately. Toothpaste flavour as pictured."
- Welcome modal: "Want {N}% off your first order?" / "Join the smile care community for the latest news, exclusive offers, and the chance to trial new and unreleased products." / "Sign up" / "Maybe later" / "Thanks for signing up!"
- Lip balm: "Just pay shipping, first one free! Every extra just $2" / "Free and $2 lip balms are final sale with no returns, unless otherwise subject to consumer law."
- Marquee: "FREE GIFT WITH ANY PURCHASE"; free-gift button "FREE WITH EVERY ORDER"; card pill "FREE MYSTERY GIFT".
- Cart: "Explore our range of fan-favourites" / "Shop our best sellers" / "Shop all products" / "Max quantity of 5x {product} per order."
- Discount terms: "Discount excludes bundles, already discounted items, subscription or membership fees, delivery fees, gift cards, and cannot be used with other offers"

## Appendix C — Source URLs

- Live store & data: `https://hismileteeth.com`, `https://hismileteeth.com/products.json`, `https://api.hismileteeth.com/api/klaviyo-info/{AU|US|UK|EU|CA|INT}`, theme assets under `https://hismileteeth.com/cdn/shop/t/994/assets/`
- [Student Beans — Hismile 30% student discount](https://www.studentbeans.com/student-discount/us/hismile)
- [Vouchercloud — Hismile vouchers (30% student/NHS)](https://www.vouchercloud.com/hismile-vouchers)
- [Slickdeals — Hismile coupon history (30–40% sitewide)](https://coupons.slickdeals.net/hismile/)
- [Savoo — refer-a-friend £10 credit](https://www.savoo.co.uk/brands/hismileteeth-discount-codes)
- [Trustpilot — Hismile 2.6/5](https://nz.trustpilot.com/review/hismileteeth.com)
- [Motion — Hismile ad library (BOGO-style ad offers)](https://motionapp.com/library/hismile)
- [KingKong case study — HiSmile growth/checkout focus](https://kingkong.co/blog/hismile-grew-tiny-20k-investment-40-million-ecommerce-powerhouse-3-years-detailed-case-study/)
- Wayback Machine snapshots of hismileteeth.com (2025-10 → 2026-08)
