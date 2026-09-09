# Hismile.com Research — Collection Pages & Product Detail Pages (PDPs)

Research date: 2026-09-09. Researcher notes on method at the bottom.
Scope: collection/listing pages and product detail pages on Hismile's storefront, with deep dives on the products that match Nasmeh.si's planned range (whitening strips, colour-corrector serum, mouthwash).

---

## 1. Executive summary

- Hismile runs **Shopify on the backend** (standard `/cart.js`, `/cart/add.js`, `products.json`, Shopify checkout, Shop Pay) with a **custom Vue.js single-page-app storefront** on top (client-side rendered, scoped `data-v-*` attributes, Vue Router routes `/products/:handle`, `/products/:parentHandle/:childHandle`, `/collections/:handle/:sortOrder?`). It is *not* a stock Shopify theme — every component is custom.
- **No product reviews are displayed anywhere** — no star ratings on cards, no review section on PDPs. Social proof is delivered via badges ("Best Seller", "Selling Fast"), clinical-stat gallery images ("96% of participants…"), an "Amazon reviews" screenshot inside the image gallery, UGC and claims copy. (Their legal pages mention Trustpilot as an off-site platform.)
- **No subscriptions.** "Club Hismile" was wound down (final charges August 2025; no new subscriptions accepted). Retention/AOV is instead driven by an aggressive **bundle & multi-buy engine**: value 2-packs, "Buy 3 Get 2 Free", BOGO, build-your-own bundles, and in-PDP "Upgrade and Save" offers.
- The **collection page is a single shop front** with pill-style collection switcher (All products / Whitening Collection / Best sellers / Bundles) + one sort dropdown. There are **no facet filters** (no price/ingredient/rating filters) — the catalog is small (~15 visible SKUs per tab), so merchandising order does the work.
- Every product card and PDP currently carries a **"FREE MYSTERY GIFT"** incentive (site-wide promo, `global_free_gift = true`), echoed by a scrolling announcement marquee "FREE GIFT WITH ANY PURCHASE".
- PDPs follow a rigid, repeatable anatomy: badge → title → USP chips → bullets → accordion set → price + BNPL → qty → ATC → reassurance pill → **in-PDP upsell block** → education content → FAQ → "People also love" → **sticky bottom buy bar**.
- BNPL messaging is first-class: "Or 4 payments of €8.75 with Clearpay/Afterpay" appears in the buy box *and* in the sticky bar, with a full "Here's how it works" explainer.
- Sold-out products stay published with a **"⏰ Remind Me" back-in-stock email capture** (card + PDP), replacing the ATC button.

---

## 2. Site-wide context that shapes the PDP/collection experience

### 2.1 Regions, currencies, geo-redirect
- Six storefront regions selectable in header/footer: **Australia & New Zealand, United States, United Kingdom, Europe, Canada, International** — each on its own host (`us.`, `uk.`, `eu.`, `int.hismileteeth.com`, …) with region-specific pricing.
- A geo-redirect worker (`country-code-redirect-worker.hismileteeth.com`) auto-routes visitors unless a `dontRedirect` cookie is set.
- Prices render as a 3-part component: region code + symbol + amount, e.g. `EU € 35`, `US $ 19.99`. Round amounts show **no decimals** (`€35`, `$29`, `€11`); non-round show cents (`€19.99`, `$54.99`).

### 2.2 Promotion engine (always on)
- Announcement bar: infinite-scroll marquee repeating **"FREE GIFT WITH ANY PURCHASE"** (rendered ~11× for the loop).
- `window.global_free_gift = true` — site-wide free-gift promo flag in page config.
- Two hidden $0-priced Shopify products power it: "Free Mystery Gift" and "Free Mystery Gift Item" (25 variants named Mystery Gift A…AK, retail values $7–$59) — gifts are real SKUs slotted into orders.
- A $0 product "**7 Day Protocol - Satisfaction Guarantee**" (SKU `7-DP-SATISFACTION-GUARANTEE`) backs the "Money back guarantee^" messaging seen on PDPs.

### 2.3 Payments & BNPL
- Page config: `paymentProvider: "Afterpay", paymentProviderSplit: 4`. EU/UK regions brand it **Clearpay**, US as **Afterpay**.
- Messaging pattern: `Or 4 payments of €8.75 with [logo]` directly under price; on PDP also a "Pay later with Clearpay" row that expands a 4-step explainer ("Build your cart / Choose Clearpay at checkout / Enjoy instant approval decision / Split into 4 … paid every 2 weeks").
- Shopify checkout with Shop Pay; `shopifyPaymentsEnabled: true`.

### 2.4 Email/SMS capture surfaces (Klaviyo)
- Exit/entry popup: **"Want 10% off your first order? … Sign up / Maybe later"** (`klaviyoList` configured per region).
- Footer newsletter: "Want the chance to trial our new products? … exclusive offers, and the chance to trial new and unreleased products."
- Back-in-stock modal on every sold-out card/PDP: "We'll let you know when it's back! Leave us your email…" — one modal instance per product, keyed by SKU (`sold-out-modal-10060-VS`).
- Cookie consent bar: "…you agree to the use of first and third party cookies… **Accept / Decline**".

### 2.5 Header / navigation (context for entry points to PDPs)
- Sticky top bar (`ui-bar-sticky-container top`).
- Mega-menu "Shop": *Shop all products, Shop best sellers, Shop bundles* (collections) + direct product links *V34 Whitening Strips, V34 Colour Corrector Serum, Flavoured Toothpaste, iD Stain Whitening Mouthwash, Exfoliating Tooth Wipes* + image tiles for two featured products.
- "Explore" menu: Hismile Professional (B2B/dentist line). Separate top-level link **"Bundle & Save"** → bundles collection.
- Right side: Log in, Help centre / Contact us, region selector, cart.

---

## 3. Collection / listing pages

### 3.1 Collections & URLs
Live collections (from `collections.json`): `products` (All products), `whitening` (Whitening Collection), `best-sellers`, `bundles`, plus merchandising-only ones (`homepage-catalog`, `base-products`, `bundle-products`, `nested-products`, `exclude-discounts`, `all-products-sale`, `replacement`).

### 3.2 Page structure (top → bottom)
1. **Promo banner image** full-width above the grid (currently the Free Mystery Gift banner, ~4.8:1, separate mobile crop `…_M_1200x.png`). No H1 text overlaid in current render.
2. **Two styled `<select>` dropdowns** (native selects with custom chevron), side by side:
   - Collection switcher (acts as tab filter): `All products | Whitening Collection | Best sellers | Bundles` → navigates to `/collections/<handle>`.
   - Sort: **Recommended (default) / Newest / Price (low – high) / Price (high – low) / Title (a – z) / Title (z – a)** → sort value appended to URL path (`/collections/products/price-low`, route `/collections/:handle/:sortOrder?`).
   - On mobile these collapse to the same two dropdowns — **there is no filter drawer and no faceted filtering at all**.
3. **Product grid** — responsive card grid; mixes regular 1-col cards with **"double-wide" feature cards spanning 2 columns** (5 of 14 on All products) to create editorial rhythm and push hero SKUs.
4. **SEO text block below grid**: heading "A bit about our Hismile Smilecare Products" + 2–3 sentence brand/mission paragraph + **"Read more +"** expander. Keeps copy off the shopping path but indexable.
5. No pagination controls observed — grid loads/lazy-renders in batches (skeleton placeholders, fade-in on scroll).

### 3.3 Product card anatomy
```
[top-center pill badge: "FREE MYSTERY GIFT"  (lime #D0FF00 bg, purple #440099 text)]
[square 1:1 product image (600x CDN crop)]   [bottom-right image-badge: gift-box graphic]
[Title  → links to PDP]
[Price: "EU € 35"  (code + symbol + amount)]
[Variant swatch row — only on multi-variant cards: 3 round image swatches (1.7rem) + "+5" more-link]
[Full-width primary button: state-dependent CTA]
```
- **CTA states**: `Add to cart` (single-variant, quick-add direct to cart via `/cart/add.js`) · `Customise bundle` (bundle products → PDP/builder) · `⏰ Remind Me` (sold out → opens back-in-stock email modal).
- **"+N" variant indicator**: e.g. Watermelon Toothpaste shows 3 flavor swatches + "+5" linking to the nested PDP (`/products/toothpaste/watermelon`); Barbie Electric Toothbrush "+7"; Replacement Heads "+4".
- **Bundle "From:" pricing**: cards for build-your-own bundles show `From: €39.98` prefix.
- Sold-out cards show a grey "Sold out" information pill in place of the promo pill.

### 3.4 Badge inventory (pill system)
| Badge | Type | Where seen |
|---|---|---|
| FREE MYSTERY GIFT | custom promo pill (lime/purple) | nearly every card & PDP gallery |
| Sold out | grey info pill | PAP+ Strips, Whitening Duo (EU) |
| Best Seller | pill | iD Stain Mouthwash PDP |
| Selling Fast | pill | V34 Whitening Strips PDP |
| NEW | pill (seen in earlier snapshots) | new launches, e.g. Tooth Wipes |
| Money back guarantee^ | reassurance pill | under ATC on strips PDPs |

### 3.5 Merchandising order (All products, "Recommended", EU render)
V34 Whitening Strips → iD Stain Mouthwash → Tooth Armour Serum → Exfoliating Tooth Wipes → V34 Colour Corrector → Whitening Protocol Bundle → Watermelon Toothpaste (+5) → PAP+ Strips (sold out) → Barbie Electric Toothbrush (+7) → Affordable Whitening Set → Replacement Heads (+4) → Starter Bundle → Whitening Duo (sold out) → Best Seller Bundle 3 pack (From €39.98) …
Note: hero consumables first, sold-out items kept mid-grid (email capture), toothbrushes/accessories lower.

---

## 4. PDP — global layout (section-by-section, in DOM order)

Using V34 Whitening Strips as the reference PDP:

1. **Back-in-stock modal** (hidden, shared component).
2. **Image gallery** (left/main column) — see §5.1.
3. **Title block**: product pill badge ("Selling Fast") + H1 ("V34 Whitening Strips").
4. **Reassurance pill**: "Money back guarantee^".
5. **Unit price anchor**: "(€2.50 per application)" right under title/price area.
6. **USP chips row** (icon + short label): "Experts in whitening" / product-specific trio, e.g. "Whiter Teeth after Just One Use*", "Not Satisfied? Get Your Money Back^", "Whitening After 30-minutes*".
7. **Short intro line** + 3–4 checkmark bullets (from product description data).
8. **Accordion set #1 (product info)** — custom `ui-accordion`, lazy bodies: *How do V34 Strips work · List of ingredients · ^Money Back Guarantee · *Tested for results*.
9. **Buy box**: price (`EU € 35` + unit price), BNPL line "Or 4 payments of €8.75 with Clearpay", "Pay later with Clearpay" explainer accordion, quantity stepper (`− 1 +`, minus disabled at 1), full-width **Add to cart**, reassurance pill repeated under button.
10. **In-PDP upsell block** (`product-upsell`) — see §5.4.
11. **Education/content sections** (product-specific long-form, e.g. colour-wheel explainer on V34 Serum; "What Brushing May Miss" on mouthwash).
12. **FAQ section**: "Got questions? We've got answers" — 2–4 accordions.
13. **Related products**: "People also love — Shop our community favourites" — 4 product cards identical to collection cards (pill badge, price, quick **Add to cart**).
14. **Sticky bottom buy bar** (`ui-bar-sticky bottom`, `position: fixed`): price + unit price + BNPL line + quantity stepper + Add to cart (+ "Money back guarantee^" on some templates). Always visible — this is their sticky ATC pattern: a full-width bottom bar mirroring the buy box.
15. Cookie bar + 10%-off email popup (site-wide).

**Notably absent:** breadcrumbs (not observed in renders), star ratings, review count, social-share, size guides, shipping/returns accordion (shipping info lives in Help centre, not on PDP — only money-back guarantee & results-test accordions cover reassurance).

---

## 5. PDP components — deep dive

### 5.1 Image gallery
- Portrait aspect ratio **0.6875:1** (tall 4:5.8-ish), images stacked vertically (mobile-scroll gallery), first image `fetchpriority="high"`.
- 6–7 images per product, and the **gallery itself is a sales asset**, mixing: packshot → clinical-stat graphic ("In a study, 96% of participants had 2 or more shades whiter teeth*") → before/after ("Top teeth results") → social-proof screenshot ("Amazon reviews") → lifestyle/how-to.
- Free Mystery Gift image-badge overlaid **top-left** on the first image.
- Alt texts are written as marketing captions, not descriptions.
- No video in the strips gallery (older templates used UGC/mp4 content blocks lower on the page).

### 5.2 Price block
- Region-coded price (§2.1) at ~1.1rem in buy box, 1.5rem in sticky bar.
- **Unit-price framing** on strips: "(€2.50 per application)" — reframes €35 as €2.50/use. (V34 = 14 applications/pack; PAP+ = 7 treatments/pack.)
- BNPL line directly attached to price; explainer as collapsible.
- No compare-at strikethrough pricing on standard PDPs (compare_at unused in catalog) — discounts are expressed via **bundle value math** instead ("valued at €70*", "saving of 64%").

### 5.3 Quantity selector & cart rules
- Stepper `− 1 +`, minus disabled at qty 1.
- `maxCartQuantity: 5` per SKU in product data (1 for some bundle/hot-deal SKUs) — purchase caps enforced in cart logic.
- ATC posts to standard Shopify `/cart/add.js` (verified live: V34 strips added at $35.00 USD line price).

### 5.4 In-PDP upsell blocks (two distinct patterns) — *key mechanic to copy*
**Pattern A — "Upgrade and Save" (multi-unit upgrade, replaces item):**
- Yellow pill "Upgrade and Save" on a bright green card, 60/40 grid (copy | product image).
- Copy pattern: **"Get 2 for €24.99 — valued at €70* — Enjoy an instant saving of 64% when you buy two boxes in this deal."** + own "Add to Cart" button.
- Fine print: *"Adding this offer will replace one V34 Strip box currently in your cart. *Discount based on full-price purchase of two boxes."* — clicking swaps the single unit for the value-pack SKU (implemented as separate hidden bundle products, e.g. `v34-strips-value-bundle` $24.99, template `hide`).
- Same pattern on mouthwash: "Get 2 for €24.99 valued at €39.98* … saving of over 37% … replaces one iD Mouthwash item".

**Pattern B — "Bundle & Save" (cross-sell add-on):**
- On serum/mouthwash/toothpaste/PAP+ PDPs: "Bundle & Save — **Add a Starter Bundle for €54.99** — A smarter way to start whitening with better value" + "Add to Cart".
- Disclaimer: "*Savings based on non-discounted individual prices of items purchased separately. Toothpaste flavour as pictured."

### 5.5 Accordions
- Custom component (`ui-accordion styled`): title row + chevron; **bodies are empty until opened** (lazy content, not server-rendered) — good for page weight, bad for SEO of that content.
- Typical sets per product (titles verbatim from renders):
  - V34 Strips: *How do V34 Strips work · List of ingredients · ^Money Back Guarantee · *Tested for results*
  - PAP+ Strips: *How do PAP+ Strips whiten? · Do PAP+ teeth whitening strips cause tooth sensitivity? · How and when should I use PAP+ Strips? · List of ingredients*
  - V34 Serum: *How does V34 Colour Corrector work? · How and when should I use V34 Colour Corrector Serum? · What's included? · List of ingredients*
  - iD Mouthwash: *How it works · Our origin story · List of ingredients · What's included*
  - Toothpaste: *What makes this toothpaste different? · *What's included? · List of ingredients*
  - Bundles: *What's included · List of ingredients*
- Pattern: **"How it works" first, "List of ingredients" always present**, plus claim-substantiation accordions (asterisked claims `*`/`^` in marketing copy resolve to these accordions — clever compliance pattern).

### 5.6 FAQ section
- "Got questions? We've got answers" + 2–4 accordions near page bottom.
- V34 Strips: *How many shades different should I see? · How do I use them?*
- PAP+ Strips: *What's the difference between the VIO405™ kit and PAP+ Strips? · How does the PAP+ formula whiten? · How long to see results? · Can Hismile be used with veneers, caps, implants, bridges, or bonded teeth?*
- Toothpaste: *What makes this toothpaste different? · Can I use this as my everyday toothpaste? · Can I purchase this for my children?*

### 5.7 Related products
- Section title pattern: **"People also love:" / "Shop our community favourites"** — a 4-card carousel/row of the same quick-add cards used in collections (always the current hero set: mouthwash, V34 strips, Tooth Armour, Watermelon toothpaste/serum — i.e., routine cross-sells, not algorithmic "similar items").

### 5.8 Sticky add-to-cart
- Fixed bottom bar, `z-index` above content, mirrors buy box: price (+ unit price), BNPL line, qty stepper, ATC (button styled blue in sticky vs primary in buy box), sometimes the guarantee pill.
- On bundle PDPs the sticky CTA reads **"Add bundle to cart"**.
- Always-on (active in initial render), not scroll-triggered.

### 5.9 Sold-out PDP state (PAP+ Strips EU)
- Page stays live and fully merchandised: "Sold out" pill, USP chips, description, accordions, FAQ, related products all intact.
- ATC replaced by **"⏰ Remind Me"** button → back-in-stock email modal.
- The "Bundle & Save" cross-sell **remains active** — sold-out hero still funnels to in-stock bundles.

---

## 6. Per-product PDP profiles (match products for Nasmeh.si)

### 6.1 V34 Whitening Strips — flagship, €35 / US$35 (14 applications)
- Template: dedicated landing template (`v34-whitening-strips-landing`) — the most built-out PDP.
- Badges/chips: "Selling Fast", "Money back guarantee^", "Experts in whitening", unit price "(€2.50 per application)".
- Headline copy pattern: *"Whiter Teeth After Just One Use\* — Not Satisfied? Get Your Money Back^ — Whitening After 30-minutes\*"*; positions "dual-active technology" (V34 instant colour correction + PAP+ stain whitening), "unlike your supermarket whitening products".
- Upsell: Upgrade & Save 2-pack (€24.99, "valued at €70*", 64% saving).
- FAQ 2 items; clinical-trial accordions (`*Tested for results` cites a 44-person double-blind dentist-led trial; "0% experienced sensitivity", "average 3.4 shades").

### 6.2 PAP+ Whitening Strips — €29 / US$29 (7 treatments; sold out in EU at crawl time)
- Chips: "Gently lift stains", "Great for on-the-go", "Hydrogen peroxide free".
- Positioning: most convenient format of the hero PAP+ formula; peroxide-free, sensitivity-free angle; "Results can be seen after just one treatment".
- How-to content: "Ready, set, smile!" — sachet = 2 strips (upper+lower), 30 minutes; "Say goodbye to post-strip sensitivity."
- Upsell: Bundle & Save (Starter Bundle €54.99). FAQ 4 items incl. kit comparison + veneers safety question.

### 6.3 V34 Colour Corrector Serum — €19.99 / US$19.99
- Chips: "Colour correcting technology", "Brightening boost", "Non-invasive treatment".
- Description pattern: **beauty analogy** — "works exactly like concealer, but for your teeth"; peroxide-free; temporary, surface-level result honestly disclosed; upsell-in-copy: "Want something more permanent? Try our PAP+ range".
- Education section: **"Heard of purple shampoo?"** — colour-wheel explainer (purple neutralises yellow), "deep violet purple" shade development story; "daily brightener that works in 30-seconds… re-apply as needed".
- Upsell: Bundle & Save (Starter Bundle). FAQ 2 items (what is V34; veneers/caps/implants compatibility).
- Also exists as hidden **BOGO SKU**: "Buy One Get One Free – V34 Colour Corrector Serum" $19.99.

### 6.4 iD Stain Whitening Mouthwash — €19.99 / US$19.99
- Badge: "Best Seller". Chips: "Freshens breath", "Removes hidden gunk", "Helps maintain white teeth".
- Description pattern: **visible-proof demo copy** — "targets the gunk your toothbrush left behind and pulls it into visible clumps you can actually see in the sink"; powered by hydrogen peroxide + essential oil actives.
- Content sections: "What Brushing May Miss" (opaque formula forms visible particles when you spit — "instant proof"), "Fresh Breath, Whitening Formula".
- Upsell: Upgrade & Save 2-bottle deal (€24.99, "valued at €39.98*", >37% saving, replaces single item).
- Multi-buy SKUs behind it: Value Pack 2× $24.99, "Buy 3 Get 2 Free" $59.97, Triple Value Set $29.99, plus $5 "Hot Deal" SKU (cart/landing upsell).

### 6.5 Flavoured Toothpaste — €11 / US$11 (licensed/collab flavors $13)
- **Variant-architecture showcase**: 80 flavor variants under parent `/products/toothpaste`, each flavor also addressable as nested child PDP `/products/toothpaste/watermelon`; title rewrites to the flavor ("Watermelon Toothpaste").
- Variant selector: row of round **image swatch buttons** (100px `Selector_-_<Flavor>` images), active ring state, `sold_out` state class; small visible subset + more via nested pages.
- Copy: playful flavor-first writing ("Wild about watermelon? … flavour in full flow") + functional bullets ("Fluoride+ formula for an effective clean", "Sensitivity free").
- FAQ includes kid-safety and everyday-use questions. Upsell: Bundle & Save.

### 6.6 Bundle PDPs (two types)
- **Fixed bundles** (Affordable Whitening Set €54.99, Perfect Pair $39.98, Whitening Protocol $39.99): long-form PDP that merchandises **each component with its own mini-PDP block** ("What's in the Bundle:" → per-product story + 3 bullets); one item framed as FREE ("FREE: iD Stain Whitening Mouthwash"); routine framing ("Three products. One routine."); CTA "Add to cart"; "See individual product pages for full product information."
- **Customisable bundles** (Starter Bundle €54.99; Best Seller Bundles 3/5/7-pack from €39.98): "Included" list shows fixed items + a **choice slot** ("Select Flavour (1/1)" → picker over 6 toothpaste variants; "Select Product" button). Bundle data model: `bundleItems` = `fixed` groups + `choice_group`s with min/max selection; `pricingRules: fixed`. CTA "Add bundle to cart"; flavor availability T&C + temporary-results disclaimer inline.
  - Best Seller 7-pack is effectively **"pick 4 paid + pick 3 free"** from hero SKUs at $63.99 (build-your-own buy-X-get-Y).

---

## 7. Pricing & promotion architecture (US catalog, USD)

| Product | Price | Multi-buy / hidden deal SKUs |
|---|---|---|
| V34 Whitening Strips (14 appl.) | $35.00 | Value 2-pack $24.99 · Triple Value Set $34.99 · "Hot Deal" $10 |
| PAP+ Whitening Strips (7 treatm.) | $29.00 | — |
| V34 Colour Corrector Serum | $19.99 | BOGO (2-for-1) $19.99 |
| iD Stain Whitening Mouthwash | $19.99 | 2-pack $24.99 · Buy 3 Get 2 Free $59.97 · Triple Set $29.99 · Hot Deal $5 |
| Tooth Armour Toothpaste Serum | $19.99 | Value Pack $24.99 · Triple Set $29.99 · Hot Deal $5 |
| Flavoured Toothpaste | $11.00 (collabs $13.00) | — |
| Exfoliating Tooth Wipes | $12.99 | Value Pack $16.99 · Triple $19.98 · Hot Deal $2.99 |
| Electric Toothbrush | $59.00 (20 colour variants incl. collabs) | Value Pack $29.99; separate battery-model single-colour SKUs at $19.99 |
| Replacement Heads | $9–11 (24 colourways) | — |
| Starter Bundle | $54.99 | fixed: V34 strips + mouthwash + choice of toothpaste |
| Affordable Whitening Set | $54.99 | Tooth Armour + V34 strips + FREE mouthwash framing |
| Whitening Protocol Bundle / Duo | $39.99 | — |
| Perfect Pair Set | $39.98 | 2× mouthwash + 1× V34 strips |
| Best Seller Bundles 3/5/7-pack | from $39.98 … $63.99 | build-your-own (pick paid + free slots) |

Patterns worth stealing:
1. **Every hero consumable has a hidden family of deal SKUs** (value packs, BOGO, buy-X-get-Y, "Hot Deal" $2.99–$10 minis) — exposed contextually (PDP upsell, cart upsell, landing pages), not in the main catalog (template `hide`).
2. **Anchoring by math, not strikethrough**: "valued at €70*", "saving of 64%", "From: €39.98", unit price per application.
3. **Free-gift layer on everything**: mystery gift + satisfaction-guarantee pseudo-products.
4. Price points cluster at **$11 / $19.99 / $29–35 / $39.99–63.99** — clean ladder: impulse → hero single → duo/protocol → routine bundle.

---

## 8. Notable absences (deliberate gaps)

- **No on-site reviews/ratings** (none rendered on cards or PDPs; no Judge.me/Yotpo/Loox/Okendo; Trustpilot only referenced in legal copy). Social proof = badges + stats + UGC imagery + "Amazon reviews" gallery image.
- **No subscriptions** — Club Hismile closed Aug 2025; replaced by bundles/multi-buy.
- **No compare-at pricing** anywhere in catalog data.
- **No faceted collection filters**, no search-in-collection, no pagination UI (lazy grid).
- **No breadcrumbs, no shipping accordion on PDP** (Help centre handles shipping/returns; PDP only carries money-back + results-test substantiation).

---

## 9. Implications for Nasmeh.si

1. Steal the **PDP anatomy**: badge → USP chips → bullets → accordions (How it works / Ingredients / Guarantee / Tested) → price + per-use unit price + BNPL → qty → ATC → guarantee pill → in-PDP upsell → education → FAQ → "People also love" → sticky bottom buy bar.
2. Implement the **two upsell patterns**: "Upgrade & Save" (swap single → value 2-pack, with replace-notice microcopy) and "Bundle & Save" (add routine bundle). These are higher-leverage than subscriptions for a 3-SKU store.
3. Adopt **value-math anchoring**: "Get 2 for €X — valued at €Y — save Z%" + per-application unit pricing (e.g. strips at €2.50/use).
4. Build **nested variant PDPs** for flavors (/products/toothpaste/<flavor>) with image-swatch selectors and per-flavor title/copy — their flavor collab machine (80 variants) is the clearest differentiator.
5. Plan a **deal-SKU layer**: hidden 2-packs/BOGO/triple-packs per hero product, surfaced via upsells rather than the catalog.
6. Use **claim-substantiation accordions**: asterisk marketing claims (`*`, `^`) that resolve to accordion explanations + trial stats.
7. **Back-in-stock capture** on sold-out cards/PDPs ("⏰ Remind Me" + email modal) instead of hiding OOS products.
8. Keep collections simple: collection tabs + one sort dropdown + mixed 1-col/2-col grid; SEO blurb below grid.
9. If reviews are desired, note Hismile succeeds *without* them — badges, stat graphics, before/after and UGC carry proof. (For a new Slovenian brand, reviews may still be worth adding — Hismile can rely on fame; we can't.)
10. Promo scaffolding: announcement marquee, free-gift badge system on cards + gallery, 10%-off popup, cookie bar, region/currency selector (for SI/EU: EUR + Clearpay-style BNPL line).

---

## 10. Method & sources

- Direct fetches of `hismile.com` were blocked in this environment; research used regional hosts (`us.`, `uk.`, `eu.`, `int.hismileteeth.com`) — same storefront app, region-specific pricing. Renders geo-resolved to the EU region (€); US prices verified via the US catalog API.
- Data sources: live-rendered DOMs (headless Chrome) of `/collections/products`, `/collections/best-sellers`, `/collections/bundles`, `/collections/whitening`, and PDPs `/products/v34-whitening-strips`, `/products/whitening-strips` (PAP+), `/products/colour-corrector`, `/products/whitening-mouthwash` + `/products/id-stain-mouthwash`, `/products/toothpaste`, `/products/starter-bundle`, `/products/affordable-whitening-set`; full Shopify `products.json` (73 SKUs) and `collections.json`; storefront JS/config (Vue SPA, Klaviyo, Afterpay/Clearpay, free-gift flags); live `/cart/add.js` test (standard Shopify cart).
- EU collection render showed ~14 products per tab (lazy grid); PAP+ Strips and Whitening Duo were sold out in EU at crawl time (in stock in US).
- All copy quoted for pattern analysis only — do not reuse Hismile copy, asset names, or trademarked terms (PAP+, V34, VIO405, iD Stain, etc.) on Nasmeh.si.
