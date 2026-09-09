# 03 — Cart & Checkout Dynamics: HiSmile

Research date: 2026-09-09. Analyst slice for Nasmeh.si.

> **Important domain note.** The brief said `hismile.com`, but that domain is an unrelated orthodontics
> business (WordPress). The teeth-whitening brand's actual store is **`hismileteeth.com`**
> (Shopify: `hismile.myshopify.com`), plus regional storefronts such as `us.hismileteeth.com` —
> [Klaviyo's case study](https://www.klaviyo.com/sg/customers/case-studies/hismile) confirms HiSmile runs
> **6 Shopify stores**. All findings below are from hismileteeth.com.

**Method note.** Direct fetching of the live site was blocked in this environment, so the primary
evidence is the site's own front-end source code (full HTML/JS of homepage, `/cart`, and the V34
Colour Corrector product page, retrieved via Wayback Machine snapshots from Aug 2025 – Feb 2026),
plus web research for the checkout steps themselves (checkout pages are not archivable). Front-end
code quotes are paraphrased/structural, not copy to clone.

---

## 1. Platform & architecture (context for everything below)

| Fact | Evidence |
|---|---|
| Platform | Shopify (`Shopify.shop = "hismile.myshopify.com"`), default currency AUD, country AU |
| Theme | Fully custom Vue 3 + Pinia SPA-style theme (Shopify "Slate" schema 0.11.0), theme names like `feature/2026-starter-bundle-mw-upsell…` — heavy in-house dev |
| Payments core | Shopify Payments enabled; accelerated/dynamic checkout ("portable wallets") on PDP **and** cart; Apple Pay session config lists Visa / Mastercard / Amex / JCB; `supportsSubscriptions: true` |
| Email/SMS | Klaviyo onsite JS (company ID `L7gAyy`, AU list `PQCZkH`); 8.2M active profiles across 6 stores |
| Social login | Oxi Social Login app (social-login.oxiapps.com) |
| Analytics | dataLayer GTM events (`cartInit`, `AddToCart`), Facebook Conversions API, Google Ads conversions (`AW-941915507`, incl. a `begin_checkout` label) |

---

## 2. Cart type: NO drawer cart — a dedicated `/cart` page + a hover mini-preview

HiSmile does **not** use the classic Shopify slide-out drawer. There are two cart surfaces:

1. **Full cart page (`/cart`) — the primary surface.**
   Every "Add to cart" button runs a state machine (`Add to cart` → `Adding...` → `Added`) and then
   **redirects the browser to `/cart` (~500 ms later)** if you're not already there. The cart page is
   therefore the upsell/cross-sell workhorse (see §6).
2. **"Sidecart" hover preview (desktop only).** A small popover anchored to the header cart icon.
   It opens on `mouseenter` of the nav cart icon (only if the cart is non-empty and viewport > 990 px)
   and closes 500 ms after `mouseleave`. Content per item: 64×64 px image, `"{qty} x {title}"`, and the
   final line price. It also shows cart-level free-shipping and BNPL messaging (same store state as the
   cart page). No quantity editing, no checkout button inside — it is a pure preview.

**Implication for Nasmeh.si:** the industry default is a drawer cart (e.g. via an app or Dawn's drawer);
HiSmile deliberately trades that for a full page so they can merchandise the cart like a landing page.
A drawer is faster UX; a page gives more upsell real estate. HiSmile chose upsell real estate.

---

## 3. Cart page layout (top → bottom)

1. **Header row:** "Your cart" title with live item count `(N)`; cart total price; when subscription
   items are present, a separate **recurring-subscription total** line is shown.
2. **BNPL messaging row** (desktop only, when a regional BNPL provider applies):
   *"Or 4 easy payments of $X with [Afterpay logo]"* — provider is region-driven (AU = Afterpay,
   split = 4). Logo is an inline SVG, amount is `cart total / 4`.
3. **Free-shipping progress module** (see §4).
4. **Line items** (see §5).
5. **Checkout block:** big "Checkout" CTA; under it a **row of payment-method icons** (see §8).
   Empty cart state: CTA becomes "Shop all products" → `/collections/products`.
6. **Conditional banners:** preorder/mystery-product delay notice (e.g. "Your order contains the
   mystery flavours, it will be held and shipped on the week of…"); "The Vault" banner (see §6).
7. **Upsell catalog section** below the cart (see §6).

Notably **absent** (verified by searching the cart source): no order-notes field, no gift-wrap option,
no coupon input box on the cart page, no trust-badge strip on the cart page (trust signals live on the
PDP instead — see §9). The cart is kept lean and conversion-focused.

---

## 4. Free-shipping progress bar — mechanics and exact copy pattern

A `cart__shipping` module above the line items:

- **Bar:** a track with a fill whose width is animated to a percentage:
  - empty cart → `5%` (never 0 — the bar always looks "started")
  - in progress → `(total / threshold) × 100%`
  - threshold reached **or** a qualifying "free-shipping SKU" is in a ≥2-item cart → `100%`
- **Messaging (three states, exact patterns):**
  - Empty: *"Unlock free shipping on all orders over {symbol}{threshold}"*
  - In progress: *"📦 You're only {symbol}{amount} away from unlocking free shipping"* (amount = `Math.ceil(threshold − total)`)
  - Reached: *"🎉 Congratulations! You've unlocked free shipping!"*
- **Edge-case disclaimer:** if the cart contains a digital (non-shipping) item: *"Please note: Free
  shipping threshold does not include the price of digital items…"*
- **Threshold values (region-specific):**
  - AU/NZ: **$65 AUD** — "Spend $65 AUD or more in one transaction and receive free standard shipping
    within Australia and New Zealand" (HiSmile T&Cs).
  - US: **$50–60 USD** depending on source/date ([SimplyCodes](https://simplycodes.com/store/us.hismileteeth.com): free standard shipping over $50; [CouponFollow](https://couponfollow.com/site/hismileteeth.com): over $60). Threshold is served per-region by their API, not hard-coded.
- **"Unlock free shipping" upsell variant:** specific SKUs (e.g. PAP+ Whitening Pen, SKU `10043-PP`)
  act as a free-shipping key: adding one to a multi-item cart flips the bar to 100%. Promoted via a
  banner with pill text **"UNLOCK FREE SHIPPING 🔓"**. Line items added this way carry a
  `free-shipping` collection identifier and display a "FREE SHIPPING 🔓" label.

---

## 5. Line items — what's shown and editable

Each cart line renders:

- Product image (custom per-cart image support), title (supports custom/subscription titles).
- **Coloured discount/offer label pills** above the price — actual label set found in code:
  `FREE GIFT`, `FREE SHIPPING 🔓`, `BUY 1 GET 1`, `EARLY ACCESS`, `2 FREE V34`, `ONLY $1`,
  `5 FREE TOOTHPASTES`, `3 FREE TOOTHPASTES`, `FREE REPLACEMENTS`, `FREE POWDER`, `FREE WHITENING`.
- Price with compare-at strikethrough; percentage-off logic; free items rendered via a dedicated
  "credit/free" price component (compare price hidden when ≤ $5).
- **Quantity: a styled `<select>` dropdown, 1–5** (`max_quantity: 5` in cart state) — no +/- steppers.
- **Remove: trash-can icon button** (no "remove" text link).
- **Expandable accordions under an item:**
  - "Show N items / Hide N items" — reveals the contents of a bundle (image, qty×title, price).
  - "Show benefits / Hide benefits" — marketing benefits per item.
- **Sorting logic:** free gifts and zero-price items are pushed to the bottom of the list; the Club
  membership line (`CLUB_MEMBERSHIP` SKU) is pinned/handled specially; sold-out items are filtered out
  of the interactive list.
- Personalised line messaging support (e.g. subscription titles, "claimed with credit" flags).
- Preorder items get a delay note at line and cart level ("held and shipped on the week of…").

---

## 6. In-cart upsells & cross-sells (the big one)

HiSmile layers **five** distinct upsell mechanics into/around the cart:

1. **"People also love:" / "Shop our best sellers" product catalog** — a 4-product shelf directly
   under the cart contents (skeleton placeholders while loading). Copy switches by mode: normally
   *"People also love: — Shop a selection of our most loved products, as chosen by our community."*;
   during sales: *"Shop our best sellers — Explore our range of fan-favourites."* Default products:
   toothpaste, colour-corrector, whitening-strips, tooth-gloss, and a brightening bundle.
2. **One-click image-tile upsells** (`cart-upsell`): product image tiles with an animated price pill
   ("Only $X"); clicking the tile adds to cart instantly (no page nav); hidden when sold out.
3. **Cross-sell banners** (image banners linking to bundles): e.g. the **Mystery Pack** (recurring
   cross-sell across many products), a Chupa Chups limited-edition bundle with pill **"ADD 3
   TOOTHPASTES FOR FREE"** (bundle discount auto-applied via discount code like `BUNDLE_42001…`).
4. **"The Vault" banner** in cart: links to `/products/the-vault`; two banner variants —
   "cheaper in The Vault" if a permanent-vault SKU is in cart, otherwise "may be available cheaper" —
   i.e. a membership/secret-price teaser at the moment of highest intent.
5. **Free-gift engine:** a pool of 7 free-gift SKUs (e.g. `21004-FAS`, `10019-WP`…); gifts are
   auto-managed in cart, display "FREE GIFT" pills, and sort to the bottom. Membership signup offers
   include `CLUB_VIP` (50% off) and a free V34 gift (SKU `10018-CC`).
6. **Club-credit mode:** when redeeming monthly Club Credit, the upsell shelf switches to
   *"Add to free shipping — Don't miss this chance to get these products shipped for free!"*
   (credit orders ship free).

Context on why they invest here: [Buno Labs](https://www.bunolabs.com/posts/candle-bundle-app-shopify-guide)
reports **80%+ of HiSmile orders contain bundled products with a 4× larger average cart**, contributing
to ~$300M annual revenue.

---

## 7. Discount codes — location & behaviour

- **No coupon field on the cart page.** Codes enter through:
  1. **Shareable links** — Shopify's `/discount/{CODE}?redirect=/checkout` pattern is used everywhere
     (banner CTAs, bundle tiles, email links). Clicking stores + validates the code client-side first.
  2. **A front-end discount store** (Pinia `useDiscount`): codes are validated against their own API
     (`check_discount_valid`), tracked as `verified_discounts` / `invalid_discounts`, and the
     `active_discount` is persisted in **sessionStorage** and re-processed on every page/theme change.
  3. **Checkout:** the discount/gift-card box lives in the Shopify checkout order summary
     (confirmed by [SimplyCodes](https://simplycodes.com/store/us.hismileteeth.com) and
     [Coupert](https://au.coupert.com/promo-code/hismileteeth) checkout notes).
- On checkout click, if an `active_discount` exists the browser is sent to
  `/discount/{CODE}?redirect=/checkout` (so the code is locked in before Shopify checkout loads);
  otherwise straight to `/checkout`.
- Welcome discount: default fallback code `WELCOME10`; actual code/value fetched per region from their
  API (`/api/klaviyo-info/{region}`).

---

## 8. Express checkout & payment methods

**In/under the cart:**
- Shopify **accelerated checkout buttons** (Shop Pay / PayPal / Apple Pay / Google Pay dynamic wallet
  buttons) are initialised on the cart page (Shopify `PaymentButton` bootstrap found in source),
  including the subscription buyer-consent widget.
- A **static payment-icon strip** sits under the Checkout button, **filtered by shopper region**:

| Icon | Regions shown |
|---|---|
| Visa, Mastercard | ALL |
| American Express | AU, US, UK, INT |
| Apple Pay, Google Pay, PayPal | AU, EU, INT, CA |
| Afterpay | AU, US, UK, CA, EU |
| Klarna | UK, EU |
| Zip Pay | AU |
| UnionPay, Alipay | INT |

**At checkout (web-researched; checkout not archivable):**
- Standard Shopify multi-step/one-page checkout (information → shipping → payment); HiSmile runs
  Shopify Plus-grade setup across 6 regional stores, so currency, language and payment mix are
  localised per storefront (AUD on .com/AU, USD on us.hismileteeth.com, GBP/EUR regionals).
- Confirmed accepted: major cards, **Shop Pay, PayPal, Apple Pay, Google Pay, Afterpay**
  ([HotDeals AU](https://au.hotdeals.com/brands/hismile-discount-code),
  [EverySaving](https://www.everysaving.co.uk/shop/hismileteeth.com),
  [Coupert](https://au.coupert.com/promo-code/hismileteeth)); Zip in AU; Klarna in UK/EU.
- **Shipping rates (published, US):** FedEx Smartpost **$4.99** (3–7 business days), FedEx 2Day
  **$13.99**, FedEx Next Day **$19.99**, Hawaii/Alaska Smartpost **$9.99**
  ([DTCetc](https://www.dtcetc.com/brand/hismile)); older AU figures: standard ~$5.99, express ~$9.99.
  Free standard shipping over threshold (§4). Dispatch 3–10 business days.
- **Taxes/duties:** calculated in Shopify checkout per region (no custom surfacing found pre-checkout;
  no shipping calculator on the cart page — rates only appear inside checkout).
- **Order summary:** standard Shopify right-rail summary with discount field (§7) and BNPL badges.

---

## 9. Trust, guarantees, risk-reversal

- **PDP trust chips** (per product, `special_features` with icons): *"Money back guarantee"* and
  unit-economics framing like *"$2.79 per application"* — placed near the buy box, not in the cart.
- **30-day returns** (items in original resalable condition; help@hismileteeth.com)
  ([DTCetc](https://www.dtcetc.com/brand/hismile)).
- Money-back guarantee artwork assets (icon + image) are served from their CDN and shown around
  PDP/cart-adjacent surfaces.
- No third-party trust-badge app (no Norton/McAfee seals); they rely on brand + payment icons +
  guarantee chips.
- Preorder honesty messaging in-cart (ship-delay notices) doubles as a trust device.

---

## 10. Abandoned-cart & email/SMS capture machinery

**Email capture timing & surfaces:**
1. **Welcome modal (main capture device):** opens **55 seconds after page load** — *not* exit-intent
   (no exit-intent code anywhere in the theme). Suppressed when: path is `/cart` or `/account`,
   the user already interacted with it this session (sessionStorage flag), **or Klaviyo already
   identifies the visitor** (`_learnq.isIdentified()` → `user_email_acquired`). It is a **two-step
   multi-step form**:
   - Step 1 (email, all regions): *"Want {10}% off your first order?"* + community/trial framing.
   - Step 2 (SMS, AU/US/UK only): *"Want an additional 10% discount code? Subscribe to SMS…"*
2. **Footer form (always visible):** *"Want the chance to trial our new products?"* — email signup
   framed around product trials rather than discounts.
3. **Klaviyo identification is re-checked on every page** and gates whether upsell/capture UI shows —
   i.e. known subscribers never see the modal.

**Abandoned-cart recovery (evidence-based inference):**
- Klaviyo is the ESP/SMS platform for all 6 stores (8.2M profiles) — abandoned-checkout flows are
  Klaviyo's standard "Checkout Started" trigger; HiSmile's T&Cs explicitly mention SMS/MMS marketing
  for "Campaigns, Giveaways, Flash Sales, Upsells", confirming SMS is in the recovery mix.
- The theme pushes a `cartInit` GTM event (SKU, value, qty, currency) the first time a session's cart
  becomes non-empty, plus FB CAPI `AddToCart` and a Google Ads `begin_checkout` conversion — feeding
  paid remarketing for cart abandoners in parallel with Klaviyo flows.
- The 55-second modal timing is deliberately *before* checkout (modal is suppressed on `/cart`), i.e.
  they capture the email **before** it can become an anonymous abandoned cart.

---

## 11. Subscriptions & membership in the cart flow

- `supportsSubscriptions: true`; cart shows a separate **recurring total** when subscription items exist.
- Subscribe & Save hero offer: e.g. *"Subscribe and Save 50%"* on V34, cancel anytime.
- **Club Hismile membership** is itself a cart line item (SKU `CLUB_MEMBERSHIP`) with a "Show
  benefits" accordion; members get monthly credit; **credit orders ship free** (*"Free shipping when
  redeeming monthly Club Credit"*); member discounts auto-apply via `apply_club_hismile_discounts()`.
- Buy-now shortcut: URLs with `?add={sku}` clear the cart, add the item, and redirect **straight to
  `/checkout`** (used by landing pages/ads to skip the cart entirely).

---

## 12. What Nasmeh.si should copy vs. adapt

| HiSmile pattern | Recommendation for Nasmeh.si |
|---|---|
| Full cart page + hover preview (no drawer) | **Adapt.** Use a drawer cart (faster, standard on Shopify themes) but keep HiSmile's *cart-page-as-landing-page* ideas inside the drawer: progress bar, one-click tiles, BNPL line. |
| Free-shipping bar with 3 message states + 5% floor + emoji (📦/🎉) | **Copy.** Cheap to build, proven. Set a Slovenian threshold (e.g. €39–49) and translate messages; ceil the remaining amount. |
| "Unlock free shipping" SKU upsell | **Copy later.** Great for a hero product (e.g. mouthwash) once margins allow. |
| Region-filtered payment icon strip under Checkout | **Copy.** For SI/EU show: Visa, MC, PayPal, Apple Pay, Google Pay, Klarna; consider Stripe/Shopify Payments wallets. |
| BNPL "4 payments of $X" line in cart | **Copy for EU** via Klarna (Afterpay/Zip are AU/US-centric). |
| No coupon box on cart; codes via `/discount/CODE` links | **Copy.** All promos distributed as auto-apply links; fewer "code didn't work" support tickets. |
| Quantity dropdown capped at 5 | **Copy the cap** (anti-bulk-reseller), use steppers if easier than a select. |
| Free-gift engine + label pills (FREE GIFT, BOGO) | **Copy with 1 gift tier** to start; pills are high-perceived-value UI. |
| 55s welcome modal, suppressed on /cart & for known users; email→SMS two-step | **Copy timing & suppression logic** (Klaviyo forms can do this natively). Offer 10% first order. |
| Trust via guarantee chips near buy box, not badge soup | **Copy.** "30-day money-back guarantee" + "€X per treatment" chips on PDP. |
| `?add=` buy-now deep links straight to checkout | **Copy** for ad landing pages. |
| Multi-store for currency | **Adapt.** One store, Shopify Markets with EUR primary instead of 6 stores. |

---

## Source log

- HiSmile theme source (Wayback Machine): homepage 2026-01-07, `/cart` 2025-03-18, PDP `colour-corrector` 2025-08-14, `pages/terms-conditions` 2024-01-06, help `what-are-the-payment-options` (2023–24). All mechanics and message strings quoted from the shipped JS/Vue components.
- [Klaviyo × HiSmile case study](https://www.klaviyo.com/sg/customers/case-studies/hismile) — 8.2M profiles, 6 Shopify stores.
- [DTCetc HiSmile profile](https://www.dtcetc.com/brand/hismile) — US FedEx rates, dispatch times, 30-day returns.
- [SimplyCodes HiSmile US](https://simplycodes.com/store/us.hismileteeth.com) — US free-shipping threshold, checkout promo box.
- [CouponFollow HiSmile](https://couponfollow.com/site/hismileteeth.com) — $60 free shipping, flat rates below.
- [HotDeals AU](https://au.hotdeals.com/brands/hismile-discount-code), [EverySaving UK](https://www.everysaving.co.uk/shop/hismileteeth.com), [Coupert AU](https://au.coupert.com/promo-code/hismileteeth) — accepted payment methods incl. Shop Pay.
- [Buno Labs bundling analysis](https://www.bunolabs.com/posts/candle-bundle-app-shopify-guide) — 80%+ bundled orders, 4× cart size, ~$300M revenue.
- [Top10 HiSmile review](https://www.top10.com/teeth-whitening/reviews/hismile) — historical standard/express rates, Afterpay 4×.

*Unverified / could not fetch: the live checkout pages themselves (login/region walls), exact current
per-region shipping-rate tables, and the internal Klaviyo flow timings (sequence delays, discount
escalation). Recommend a manual test purchase path on us.hismileteeth.com to confirm checkout-step UI.*
