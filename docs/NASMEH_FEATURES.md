# Nasmeh.si — Master Feature Specification

**Version:** 1.0 · **Date:** 2026-09-09 · **Status:** Master spec for build planning
**Basis:** HiSmile feature set (hismileteeth.com, per research dossiers 01–07 in `docs/research/`), adapted to a 3-product Slovenian/EU store, and extended where HiSmile is demonstrably weak (reviews, search, SEO rendering, GDPR consent, order tracking, support tooling).

---

## 1. How to read this document

### 1.1 Phase tags (every feature carries one)

| Tag | Meaning |
|---|---|
| `[P1-core]` | Launch-blocking. The store does not go live without it. |
| `[P2-growth]` | First 3–6 months post-launch. AOV, retention, and organic-growth levers. |
| `[P3-later]` | 6+ months. Programs, new channels, scale features. Build nothing here before P2 is stable. |

### 1.2 Origin markers

- **[BASE]** — exists on hismileteeth.com; we replicate the pattern (never the copy, names, or creative).
- **[ADAPT]** — HiSmile pattern modified for our catalog/market/legal context.
- **[NEW]** — does not exist on HiSmile; we add it to beat a known weakness (each is justified in the research, esp. 02 §8, 05 §12, 07 §8–9).

### 1.3 Ground rules

1. **Copy mechanics, never assets.** No HiSmile product names (V34, PAP+, iD Stain…), copy lines, imagery, or brand identity (per all dossiers' "do not copy" notes).
2. **EUR, Slovenian-first.** All prices VAT-inclusive; Slovenian is the primary language, English comes later `[P2]`.
3. **EU law is a feature, not an afterthought.** GDPR consent, Omnibus pricing rules, 14-day withdrawal, VAT invoicing, cosmetics-regulation diligence are specced as first-class features below.
4. Where this spec goes beyond the research (standard e-commerce practice adapted to Slovenia), the feature says so explicitly.
5. **Current page scope (user direction, 2026-09-09):** shopping-focused navigation; no Help Centre, About Us, Explore or standalone Delivery page. Contact, tracking, legal, account and product/PDP content remain in scope. The supplied screenshot is a layout reference; Nasmeh keeps its own teal tokens, copy and assets. Phase 6 step 2 implements this simplification and then stops for the user's checkpoint.

---

## 2. Foundations

### 2.1 Product catalog (launch)

| # | Product (working name) | Role | Target price (EUR, VAT incl.) | Notes |
|---|---|---|---|---|
| 1 | Whitening strips (14 applications/box) | Flagship / hero | €34.99 | Unit-price anchor "(€2,50 na uporabo)" [BASE: research 02 §6.1] |
| 2 | "Gunk removal" mouthwash | Hero consumable | €19.99 | Visible-proof demo product [BASE: 02 §6.4] |
| 3 | Color-corrector serum | Hero consumable | €19.99 | Beauty-analogy education ("korektor za zobe") [BASE: 02 §6.3] |
| 4 | Routine bundle (1+2+3) | AOV anchor | €49.99–54.99 | Fixed bundle, "routine, sorted" framing [ADAPT: 01 §2.6] |

**Catalog-model decisions** `[P1-core]`:

- **Deal-SKU layer** (hidden products not visible in catalog/search): value 2-packs, 3-packs, BOGO, "hot deal" minis — implemented as real products with fixed prices so discount codes never stack against them [BASE: 02 §7, 04 §4]. `[P2-growth]`
- **Bundles as first-class products** with component lists that expand on the order line for fulfillment [BASE: 07 §5.2]. `[P1-core]` (fixed bundle) / BYO wizard `[P3-later]`
- **$0 gift SKUs** (free mystery gift, satisfaction-guarantee line item) [BASE: 02 §2.2, 04 §7–8]. `[P2-growth]`
- Every SKU carries: SKU code, price, compare-at price, cost, barcode, weight, stock, **maxCartQuantity** (default 5; bundles/gifts 1) [BASE: 02 §5.3, 07 §5.4]. `[P1-core]`
- Order numbers prefixed `NS-` (e.g. `NS-100241`) [ADAPT: 05 §11 region-prefix pattern]. `[P1-core]`

### 2.2 Market & legal baseline (Slovenia / EU)

| Area | Requirement | Where specced |
|---|---|---|
| Currency/pricing | EUR; **VAT included** in all displayed prices (SI standard rate 22 %); "DDV vključen" shown at checkout/invoice | §2.2, §8, §14.13 |
| GDPR / ePrivacy (ZEKom-1) | Prior, granular, withdrawable cookie consent; consent log; marketing opt-in **never pre-checked** | §3.4, §8, §11 |
| Omnibus Directive (EU 2019/2161, in ZVPot) | Any announced price reduction must display the **lowest price applied in the previous ≥30 days** | §9.2, §14.2 |
| Consumer Rights Directive | 14-day withdrawal right + model withdrawal form; order button labelled "naročilo z obveznostjo plačila"; sealed-cosmetics exception (art. 16(e)) for opened products | §8, §12 |
| Cosmetics Reg. (EC) 1223/2009 | INCI ingredient lists on PDPs, responsible-person diligence, serious-undesirable-effect (adverse event) reporting surface, claims discipline (Reg. 655/2013 common criteria) | §6, §12.6 |
| Invoicing | PDF invoice with VAT breakdown, sequential numbering, company data; confirm davčno-potrjevanje obligations with an SI accountant (card/PayPal payments are generally traceable/non-cash, but verify) | §14.7, §14.13 |
| Shipping | Pošta Slovenije + GLS; delivery-time display; tracking links | §8, §14.12 |
| Payments | SCA/3-D Secure on cards; Klarna, PayPal, Apple Pay, Google Pay, cards | §8.3 |

### 2.3 Technical baseline

- **Storefront:** **Next.js with server-side rendering (SSR/ISR)** — chosen explicitly to beat HiSmile's client-rendered Vue SPA, which ships an empty `<div id="app">` and forces Google to execute JS for content and JSON-LD [NEW; research 07 §1, §7, §9.8]. `[P1-core]`
- **Hosting & deployment:** **Docker** — multi-stage `Dockerfile` + `docker-compose` (app + database services) deploying to the existing home server behind its reverse proxy; env-based config, no hard-coded ports [task-required; decided architecture per `AGENTS.md` §6]. HTTP/2+, image optimization (AVIF/WebP, responsive srcsets), Core Web Vitals budgets (LCP < 2.5 s, INP < 200 ms, CLS < 0.1). `[P1-core]`
- **Backend:** single Next.js app monolith (storefront + admin + API routes/server actions sharing one Prisma client) — no separate headless backend service [decided architecture per `AGENTS.md` §2, §5.7]. **Email:** transactional mail via SMTP (Nodemailer + MJML/React-email templates) at P1; ESP integration (Klaviyo or EU-hosted equivalent — Brevo/MailerLite) deliberately deferred. `[P1-core]`
- **Design system:** tokenized CSS custom properties on the iOS-neutral ramp + ONE hero brand color + per-product accent colors; pill buttons, hairline borders, light Swiss live-text with loud type reserved for campaign art; free font stack (Plus Jakarta Sans / Figtree + a chunky display face for art) [ADAPT: 06 §2–5, §19]. `[P1-core]`
- **Config-driven merchandising:** marquee, badges, hero, popups, thresholds, pixel IDs are all admin data, not code [BASE: 04 §1, 07 §9.3–9.5]. `[P1-core]`

---

## 3. Global / site-wide features

### 3.1 Header & navigation

- **Announcement marquee bar** — full-width, brand-color, infinite CSS marquee with ONE clickable message (config-driven in admin; e.g. "BREZPLAČNO DARILO OB VSAKEM NAKUPU" when a GWP campaign is on) [BASE: 01 §2.1]. `[P1-core]` A free-shipping amount in the message is written `{prag}` and filled from the shipping Setting, so the claim follows the threshold (QA 2026-10-03).
- Marquee swaps to **"Koda: {CODE} uporabljena 🎉"** when a discount code is active in session [BASE: 05 §11]. `[P2-growth]`
- **Promotion/account rows**: configured promotion messaging and Prijava / Moj račun; SI primary, EN later. The user's 2026-09-09 screenshot direction removes the Help Centre link [ADAPT: 01 §2.1–2.2]. `[P1-core]`
- **Sticky header block**: marquee + utility bar + main nav stay pinned while scrolling [BASE: 01 §2.0]. `[P1-core]`
- **Main nav**: Nasmeh logo; "TRGOVINA ⌄" mega-menu and highlighted "PAKETI & PRIHRANKI" link to `/trgovina?kolekcija=paketi`; search and cart controls. No Explore dropdown or About Us/Help Centre destinations (user direction, 2026-09-09) [ADAPT: 01 §2.3]. `[P1-core]`
- **Mega-menu "TRGOVINA"**: a full-width pale panel with a shopping-link column (Vsi izdelki, Paketi, posamezni izdelki) and **two landscape featured-product cards**, titles above images, using Nasmeh products/assets and following the screenshot's layout [ADAPT: 01 §2.3]. `[P1-core]`
- **Site search in header** (icon → full-width overlay): instant product results as you type, links to all results [NEW — HiSmile has zero search: 01 §1, 07 §9.8]. `[P1-core]` A one-character query and a query over 80 characters get a hint instead of an empty form (QA 2026-10-03).
  - Typo tolerance, synonyms ("beljenje" → strips/serum), search analytics (top queries, zero-result queries) `[P2-growth]`
- **Cart icon** with item-count badge; **hover mini-preview popover** on desktop (64×64 thumbs, qty × title, line price; pure preview, no editing) [BASE: 03 §2]. `[P2-growth]`
- **Mobile header**: hamburger left, centered logo, search + cart right; drawer mirrors desktop (accordions + featured cards + colored sale link) [BASE: 01 §2.3]. `[P1-core]`

### 3.2 Footer

- **Email capture block** top of footer — hook: "možnost testiranja novih izdelkov" (trial exclusivity, not discount) [BASE: 01 §2.8]. `[P1-core]`
- **Link groups** (accordions on mobile): shopping, contact/support, order tracking, legal and social destinations. Keep `/kontakt` and `/sledi`; remove Help Centre, About Us, Explore and standalone Delivery links (user direction, 2026-09-09) [ADAPT: 01 §2.8]. `[P1-core]`
- **Payment icon row** filtered to what we actually accept: Visa, Mastercard, PayPal, Apple Pay, Google Pay, Klarna [ADAPT: 03 §8]. `[P1-core]`
- **Company identification block** (SI e-commerce practice): company name, registered address, registration no., VAT ID (davčna številka), contact email — required for trust and invoicing consistency [NEW vs HiSmile, which shows none]. `[P1-core]` Printed only once the seed placeholders are replaced; until then the footer says the details are not available, as the legal pages do (QA 2026-10-03).
- Legal links: Pogoji poslovanja, Politika zasebnosti, Politika piškotkov, Odstop od pogodbe, Reklamacije, Nastavitve piškotkov (reopens consent) [NEW/ADAPT: 01 §2.8]. `[P1-core]`

### 3.3 SEO & structured data (SSR advantage)

- **Server-rendered HTML for all content pages** — copy, prices, reviews, accordions all in initial HTML [NEW: 07 §7]. `[P1-core]`
- **Per-page SEO fields** (title, meta description, canonical, noindex) editable in admin; hand-written meta descriptions (HiSmile leaves most empty — free win) [NEW: 07 §7]. `[P1-core]`
- **JSON-LD server-side**: Organization, WebSite (+ SearchAction), Product + Offer + AggregateRating + Review, BreadcrumbList, FAQPage on PDPs [NEW — HiSmile injects schema client-side]. `[P1-core]`
- Canonical on every page; `noindex` on /cart, /checkout, /account, /search, utility routes [BASE: 07 §7]. `[P1-core]`
- Auto-generated sitemap.xml + robots.txt; Google Search Console verification [BASE: 07 §7]. `[P1-core]` The sitemap lists the indexable collection views (`/trgovina?kolekcija=…`); while the store is locked, sitemap.xml and robots.txt answer 503 (QA 2026-10-03).
- Open Graph + Twitter cards (og:title/description/image per page; 1200×628 social image) [ADAPT: 07 §7 — HiSmile only sets og:image]. `[P1-core]` PDPs carry `og:type` product (QA 2026-10-03).
- hreflang sl/en when English launches `[P2-growth]`; localized URL slugs `[P2-growth]`
- SEO content hub (kratek blog/vodiči: "kako delujejo trakovi za beljenje"…) to build organic demand in SI — HiSmile under-invests here [NEW: 05 §10, 07 §9.8]. `[P2-growth]`

### 3.4 GDPR cookie consent (real CMP, not HiSmile's session bar)

- **Granular consent banner** on first visit: categories Nujni / Analitični / Trženjski with per-category toggles, "Sprejmi vse", "Zavrni", "Shrani izbiro" [NEW — HiSmile's is cosmetic, session-scoped: 01 §3.1, 05 §12]. `[P1-core]` The banner keeps keyboard focus inside while it waits for a choice and gives accept and reject equal weight; on the cookie policy page it links to it is not modal and folds its switches away, so the policy can be read before choosing (QA 2026-10-03).
- **Consent persisted** (cookie + server-side consent log with timestamp, version, choices); re-openable anytime via footer "Nastavitve piškotkov" [NEW]. `[P1-core]`
- **Script gating**: no analytics/marketing pixel fires before consent; Google Consent Mode v2 signals passed to GTM [NEW]. `[P1-core]`
- Cookie policy page with a live table of cookies (name, provider, purpose, duration) [NEW]. `[P1-core]`
- Consent versioning — re-ask on material policy change. `[P2-growth]`

### 3.5 Analytics & pixels

- **GTM container** with GA4, Meta pixel, TikTok pixel; all IDs as **admin settings** (data-driven, not hard-coded) [BASE: 07 §4, §9.5]. `[P1-core]`
- Ecommerce events: view_item, add_to_cart, begin_checkout, purchase (with SKU, value, currency) [BASE: 03 §1]. `begin_checkout` fires when the checkout opens, so the cart's button, the add-to-cart card and "Kupi zdaj" count alike (2026-10-03). `[P1-core]`
- Server-side conversions (Meta CAPI, enhanced conversions) for iOS/ITP resilience [ADAPT: 03 §10]. `[P2-growth]`
- Pixel/privacy QA mode (preview environment for tags). `[P2-growth]`

### 3.6 Global UX & platform

- **404 page** with copy + auto-redirect countdown to home [BASE: 05 §11]. `[P1-core]`
- **Site-wide ops notice banner** (delayed-shipping/ops messaging broadcast from admin) [BASE: 04 §9]. `[P2-growth]`
- Skeleton loaders + lazy sections via IntersectionObserver; font-display swap [BASE: 01 §4, 06 §3]. `[P1-core]`
- **Motion system** (2026-09-16, AGENTS §8.23): tokenised, compositor-only animations (research 06 §14 restraint) — card lift + shadow + image cross-fade on hover, press feedback on every pill button, a popping cart badge and success label, pulsing low-stock dot, pure-CSS scroll-driven reveals for below-the-fold sections (`animation-timeline: view()`, progressive enhancement), a scroll shadow under the sticky header, drawn-in nav underlines, an ambient highlight on the bundle banner; all disabled by `prefers-reduced-motion`, nothing in the first viewport animates on load [ADAPT: 06 §6, §10, §14]. `[P1-core]`
- Accessibility baseline: semantic landmarks, focus states, alt-text discipline (descriptive, not marketing captions — HiSmile's alts are captions; we do better), contrast AA, keyboard-navigable menus/modals [NEW: 02 §5.1]. `[P2-growth]` A skip link to the main content is the first focusable element on every storefront page (QA 2026-10-03).
- Bot protection (Cloudflare Turnstile/hCaptcha) on all forms + checkout [BASE: 05 §1]. `[P1-core]`
- Maintenance/password mode for pre-launch [BASE: 07 §8.4]. `[P1-core]`
- Monitoring: uptime, error tracking, RUM. `[P2-growth]`
- English language version (full i18n: URLs, templates, emails, admin translations). `[P2-growth]`

---

## 4. Homepage

Section order (adapted from BASE 01 §1; ~one screen of merchandising, not a brand magazine):

1. **Hero — product-launch slot** `[P1-core]`
   - Split layout: left copy (outcome-verb headline + one-sentence ingredient+mechanism+benefit subcopy + black pill "Nakupuj zdaj"), right **autoplay muted loop video** (UGC-style, separate mobile/desktop crops, poster image) [BASE: 01 §2.4, 06 §16].
   - Optional **promo overlay banner** at hero bottom tied to the current campaign (e.g. free gift) [BASE: 01 §2.4]. `[P1-core]`
   - **Trust strip** under the hero grid (delivery estimate, free-shipping threshold, guarantee, secure payment — the PDP trust row's data, from the shipping Setting), so the campaign line above the fold is free for an offer [ADAPT: 04 §8; 2026-09-16]. `[P1-core]`
   - Admin-swappable: hero is a content slot (see campaign presets, §14.10). `[P1-core]`
   - **2026-10-10 redesign** (reference: the current HiSmile home, layout only): bold uppercase headline with an optional brand-coloured second line (`titleAccent`, a hero Setting field; a claim marker in it needs the footnote like every other hero text), a static brand-tinted backdrop (`.ui-hero-bg`, no animation in the first viewport), the linked product's **computed** price beside the CTA (from the catalog list, never typed), the guarantee line with its terms link under the CTA, the poster in a rounded frame that zooms on hover, and a hover shine on the CTA (`.ui-shine`).
2. **"Naše uspešnice" product rail** — horizontal-scroll carousel of the 3 heroes + bundle, cards with direct "Dodaj v košarico", badge pills, **star rating on card** (NEW) [ADAPT: 01 §2.5]. `[P1-core]` Since 2026-10-10 the header is a left column (title, claim-free subline, outlined "Vsi izdelki" pill to /trgovina) and the cards are borderless panels (shadow + `--radius-panel`) with a heavier price.
3. **Bundle banner** — brand-color block: "Naši paketi" + white pill "Nakupuj zdaj" [BASE: 01 §2.6]. `[P1-core]` Since 2026-10-10 a rounded panel inside the page width (glow kept), not a full-bleed strip.
4. **Routine bundle card** (until 2026-10-10 a full-width clickable image banner): a split card — the Setting's artwork on one side (link, title as its accessible name), on the other the eyebrow, the title, the bundle's **component list, price, Omnibus prior price/30-day line or the value line, and a direct "Dodaj paket v košarico"**, every figure computed from the catalog; the legal footnote stays **live HTML text under the card, not inside the image** (HiSmile bakes text into images — untranslatable and bad for SEO) [ADAPT/NEW: 01 §2.6, §5.6]. When the banner's link is not a bundle the catalog lists, the block falls back to the image banner. `[P1-core]`
5. **Review grid** — store-wide aggregate stars + the newest six published reviews as quote cards (byline, verified-buyer pill, product link, month) [NEW — HiSmile's home quotes Amazon reviews, not its own: 2026-10-10 capture]. `[P2-growth]` (P1 if review volume exists from pre-launch seeding). Built 2026-10-10 as a latent block: `lib/reviews/home.ts` returns nothing below three published reviews with text, so the section is absent until real volume exists; the admin's section list (`reviews`) can hide it.
6. **"Kako deluje" education strip** — 3 steps/icons per hero product [ADAPT: 02 §6]. `[P2-growth]`
7. **Before/after gallery** (claims-disciplined: real customer photos, "rezultati se lahko razlikujejo") [ADAPT: 02 §5.1]. `[P2-growth]`
8. Footer (§3.2) with email capture. `[P1-core]` Since 2026-10-10 the capture is a dark rounded band (title, hook, form with a white pill) above the link columns.

Overlays: GDPR consent banner `[P1-core]`; welcome discount modal `[P1-core]`; back-in-stock modals on sold-out cards `[P1-core]`.

**Deliberately NOT on homepage** (HiSmile pattern we keep): no quiz, no press bar at launch, no blog feed. The homepage is a routing + offer layer [BASE: 01 §5.9].

---

## 5. Collection pages

With 3 SKUs + 1 bundle, one strong shop page beats a collection tree [ADAPT: 02 §3.5].

- **"/trgovina" all-products page** with a brand-colour title band (live heading, claim-free subline, product count) since 2026-10-10; a collection with its own uploaded banner keeps the full-width image (separate mobile crop) with the heading under it [BASE: 02 §3.2]. `[P1-core]`
- **Collection tabs** (pill switcher): Vsi izdelki / Beljenje / Paketi — deep-linkable handles [ADAPT: 02 §3.2]. `[P1-core]`
- **Sort dropdown**: Priporočeno (manual merchandising order) / Najnovejše / Cena ↑ / Cena ↓ / Naziv A–Ž / Naziv Ž–A; sort in URL path [BASE: 02 §3.2]. `[P1-core]`
- **No facet filters** — deliberately omitted (3 SKUs; merchandising order does the work) [BASE: 02 §3.2]. Re-evaluate `[P3-later]` if catalog grows.
- **Product card anatomy**: promo pill badge → packshot on light tile → title → **star rating + review count** [NEW] → price (VAT incl., Omnibus-compliant compare-at when on sale) → unit price where relevant → variant swatches with "+N" overflow → full-width CTA by state: "Dodaj v košarico" / "Sestavi paket" / "Obvestite me" (sold out) [ADAPT: 02 §3.3, 01 §2.5]. `[P1-core]`
- **Badge system** (admin-driven): NOVO (outline), Uspešnica, Hitro se prodaja, Razprodano (grey), promo pill (campaign color) [BASE: 02 §3.4]. `[P1-core]` Since 2026-10-10 the badge and the sold-out pill float centred on the tile's top edge; the computed "−X %" pill stays inside the tile.
- **Computed hooks on every card** (2026-09-16): a "−X %" pill from the Omnibus-backed reduction (the same figure as the strikethrough and the 30-day line), the bundle's value line "Vrednost €Y · prihranite Z %" from its components' current prices (§6.6 math, no strikethrough), the real "Samo še N kosov na zalogi" line while the stock is at or under the admin's low-stock threshold (§14.2), and a hover cross-fade to the first gallery image with a lift and shadow; at most one admin badge and one computed pill on the image; no typed figure anywhere [ADAPT: 02 §3.3–3.4, 04 §8, 06 §7.3; UCPD Annex I(7)]. `[P1-core]`
- **Image sticker overlays** (gift starburst PNG on card corners when GWP campaign active) [BASE: 02 §3.3]. `[P2-growth]`
- **Double-wide feature cards** spanning 2 grid columns for editorial rhythm [BASE: 02 §3.2]. `[P2-growth]` Built 2026-10-10 at the owner's request: the shop grid runs three columns on desktop, the bundle is the wide card (`CatalogCard layout="wide"`: 2:1 tile, text and CTA side by side, the computed component list "V paketu: …"), dense-packed so five products fill two rows.
- Sold-out products **stay published** with "Obvestite me" email capture (card + PDP), never hidden [BASE: 02 §5.9]. `[P1-core]`
- **SEO text block below grid**: short brand/mission paragraph + "Preberi več +" expander (indexable copy off the shopping path) [BASE: 02 §3.2]. `[P1-core]`
- Lazy-rendered grid with skeletons; "load more" if needed [BASE: 07 §5.11]. `[P1-core]`

---

## 6. Product detail pages (PDP)

One template, three products; strips get the most built-out landing variant [BASE: 02 §6.1]. DOM order (adapted from 02 §4):

1. **Breadcrumbs** (Domov / Trgovina / Izdelek) [NEW — absent on HiSmile]. `[P1-core]`
2. **Image gallery** (portrait 0.6875:1, stacked mobile-scroll, first image fetchpriority=high): packshot → ingredient/stat graphic → before/after → lifestyle/how-to → (mouthwash: **gunk-demo video**) [ADAPT: 02 §5.1]. Images `[P1-core]`, product video `[P2-growth]`.
3. **Title block**: badge pill ("Hitro se prodaja") + H1. `[P1-core]`
4. **Rating summary**: stars + count + link to review section [NEW]. `[P1-core]`
5. **USP chips row** (icon + label, max 3): e.g. strips: "Rezultati že po 1 uporabi*" / "30 minut" / "Brez peroksida" [ADAPT: 02 §4]. `[P1-core]`
6. **Intro line + 3–4 checkmark bullets** [BASE: 02 §4]. `[P1-core]`
7. **Accordion set #1** (server-rendered content — NEW vs HiSmile's lazy empty bodies): *Kako deluje · Sestavine (INCI) · Jamstvo vračila denarja · *Opombe k navedbam* — asterisked marketing claims (`*`, `^`) resolve to this claim-notes accordion; no study figure ships without an evidence file (Reg. 655/2013, Phase 9 step 4) [ADAPT: 02 §5.5, 04 §11]. `[P1-core]`
8. **Buy box**: price (VAT incl.; Omnibus 30-day-low line when discounted, with the "−X %" pill beside the price) + **unit price anchor** "(€2,50 na uporabo)" + **Klarna line** ("ali 3 obroka po €11,66 s Klarna") + the real low-stock line under the admin threshold + qty stepper (1–5, minus disabled at 1) + full-width "Dodaj v košarico" (busy → green "Dodano ✓" flash, then the page-level confirmation card, §7.1) + outlined **"Kupi zdaj"** under it — the stepper's quantity straight to the checkout, past the card and the cart page; the line is raised to at least that quantity, never by it, so a product already in the cart is not doubled, and a line the cap or the stock stops short is reported in place instead (2026-10-03, fewest-clicks path) + green **"30-dnevno jamstvo vračila denarja"** pill under ATC + **trust row** (delivery estimate, free-shipping threshold, guarantee link, secure payment — every figure from the shipping Setting) [ADAPT: 02 §4–5, 04 §8]. `[P1-core]`
9. **Delivery & returns accordion on PDP** (dostava 2–4 dni, brezplačna nad €45, 14-dnevni odstop) [NEW — HiSmile hides this in Help; EU buyers expect it on PDP: 02 §8]. `[P1-core]`
10. **Cross-sell block**: "Dopolni svojo rutino" — curated cards of the other 2 products + bundle with quick ATC [ADAPT: 02 §5.7 — simple curation at launch]. `[P1-core]`
    - **"Nadgradi in prihrani"** (Upgrade & Save 2-pack, replaces single in cart, with replace-notice microcopy) — needs deal-SKU layer [BASE: 02 §5.4A]. `[P2-growth]`
    - **"Paket & Prihrani"** (add routine bundle for €X) [BASE: 02 §5.4B]. `[P2-growth]`
11. **Education sections** per product (long-form, image/text splits): serum → color-wheel explainer ("vijolična nevtralizira rumeno", honest disclosure: temporary, surface-level); mouthwash → "kaj ščetka zamudi" visible-proof story; strips → how-to 3 steps + 30-min protocol [ADAPT: 02 §6.3–6.4]. `[P1-core]`
12. **FAQ section**: "Imate vprašanja? Imamo odgovore" — 2–4 accordions per product (usage, veneers/caps compatibility, pregnancy note), FAQPage JSON-LD [BASE: 02 §5.6]. `[P1-core]`
13. **Reviews section** (see §10): summary + distribution + photo wall + review cards + "Napiši mnenje" [NEW]. `[P1-core]`
14. **"Ljudje tudi kupujejo"** — 4-card row with quick ATC [BASE: 02 §5.7]. `[P1-core]`
15. **Sticky bottom buy bar** (fixed): price + unit price + Klarna line + qty + ATC (+ guarantee pill); always visible, with no entrance animation (it sits in the first viewport — AGENTS §8.23) [BASE: 02 §5.8]. `[P1-core]`

**Sold-out PDP state**: page stays fully merchandised; ATC → "Obvestite me" modal; cross-sell stays active [BASE: 02 §5.9]. `[P1-core]`

**Per-product content checklist** `[P1-core]` (admin fields, Slovenian):
- Strips: 14 applications, 30-min wear, per-use price, money-back guarantee, sensitivity claims discipline.
- Mouthwash: visible-gunk mechanism ("vidite kaj ščetka pusti za seboj"), fresh breath, whitening maintenance, what's-included.
- Serum: instant color-correction, 30-second use, temporary-result honesty, "za trajnejše rezultate: trakovi" internal cross-pitch [BASE: 02 §6.3].

---

## 7. Cart

**Decision [ADAPT: 03 §12]:** full `/cart` page is the primary surface (merchandising real estate) at launch; slide-out **drawer cart** added later. `[P1-core]` page / `[P2-growth]` drawer.

### 7.1 Cart page

- Header: "Vaša košarica (N)" + live total [BASE: 03 §3]. `[P1-core]`
- **Free-shipping progress bar** above items — three states with emoji, 5 % floor on empty, `ceil()` remaining amount: empty: "Odklenite brezplačno dostavo pri naročilih od €45" ("od": free shipping applies at the threshold, not above it) → in progress: "📦 Samo še €X vas loči do brezplačne dostave" → reached: "🎉 Čestitamo! Odklenili ste brezplačno dostavo!" Threshold €45 (recommended: above hero single €34.99 and just under the €49.99 routine bundle so the bundle itself qualifies — the HiSmile trick of threshold-near-bundle [04 §14.9]); **admin-configurable** [ADAPT: 03 §4]. `[P1-core]`
- **Klarna row** (desktop): "ali 3 enostavna obroka po €X s Klarna" (cart total / 3) [ADAPT: 03 §3]. `[P1-core]`
- **Line items**: image, title, variant, price (VAT incl.), discount/offer **label pills** (BREZPLAČNO DARILO, KUPI 1 DOBI 1, PAKET), compare-at strikethrough (Omnibus-checked), **qty dropdown/stepper capped at 5** with "Največ 5 kosov na naročilo" message, trash-icon remove [ADAPT: 03 §5]. `[P1-core]`
- **Bundle contents accordion** under bundle lines ("Prikaži vsebino paketa") [BASE: 03 §5]. `[P2-growth]`
- Free gifts/zero-price lines auto-sorted to bottom [BASE: 03 §5]. `[P2-growth]`
- Preorder/backorder honesty notice at line + cart level when applicable [BASE: 03 §5]. `[P2-growth]`
- **Cross-sell shelf below cart**: "Ljudje tudi kupujejo" — curated heroes with quick ATC (skeletons while loading) [ADAPT: 03 §6.1]. `[P1-core]`
- **One-click tile upsell** ("Samo €X" price pill, instant add, hidden when sold out) [BASE: 03 §6.2]. `[P2-growth]`
- **"Hot deal" cart-only add-on** (e.g. mini mouthwash €5, limit 1, auto-removed if it becomes the only cart item; gated to unlock only when cart already has a full-price item) [BASE: 04 §5 Format C]. `[P2-growth]`
- Checkout block: big black "Na blagajno" + **payment icon strip** (Visa, MC, PayPal, Apple Pay, Google Pay, Klarna) [ADAPT: 03 §8]. `[P1-core]`
- **Empty-cart state**: "Vaša košarica je prazna" + "Nakupuj vse izdelke" pill + best-sellers rail below (even the empty cart is a merchandising surface) [BASE: 01 §2.7]. `[P1-core]`
- **Add-to-cart confirmation card** (2026-09-16): after a "Dodaj v košarico" that really added units the button flashes green "Dodano ✓" and one page-level card under the header names the item and the line it really stored ("1 × 34,99 €" — the units the cap let through, not the ones asked for, which is also the figure `add_to_cart` carries) with "Poglej košarico" and "Na blagajno" side by side (plus the corner close; "Na blagajno", straight to the checkout, added 2026-10-03 for the fewest-clicks path); auto-dismissed after 5 s, Esc closes, hover pauses. An add that changed nothing — the line is already at its per-order cap — or one the server refused says so in a line under the button instead: no green state, no `add_to_cart` event, no card. A confirmation, not the drawer cart deferred to P2 (§15) [ADAPT: 03 §2, 04 §5 "where upsells render"]. `[P1-core]`
- Persistent cart for logged-in users; session cart for guests; merge on login [standard practice]. `[P1-core]`

### 7.2 Discount entry

- **No coupon box on the cart page** (keeps cart lean; fewer "code didn't work" tickets) [BASE: 03 §7]. `[P1-core]`
- Codes enter via: **auto-apply links** `/koda/{CODE}` (banner CTAs, emails, ads) that validate + store in session, and the **checkout discount field** [ADAPT: 03 §7]. `[P1-core]`
- Active code shown in cart summary with remove option. `[P1-core]`

---

## 8. Checkout

Custom Next.js checkout (we are not on Shopify — everything here is built, not configured). One-page, accordion-step layout: Kontakt → Dostava → Plačilo → Pregled [standard practice; ADAPT from 03 §8]. `[P1-core]` Each step is its own history entry (`?korak=N`), so the browser's Back returns to the previous step; "Naprej" scrolls to and focuses the first refused field (QA 2026-10-03).

### 8.1 Contact & shipping steps

- **Guest checkout default**; optional account creation post-purchase ("shrani podatke za naslednjič") [standard practice]. `[P1-core]`
- Fields: email (with account detection → "imate račun? prijavite se"), phone (courier SMS), name, street + house no., city, 4-digit postal code, country (Slovenia default; EU list) [standard practice]. `[P1-core]` Street and house number are **one field**, "Ulica in hišna številka" (`autocomplete="address-line1"`, as the address book has it), so browser autofill fills it in one go — a separate number field tagged `address-line2` stayed empty under autofill and stopped the step. The order still stores street and number apart, split by `parseStreetLine`; a line without a house number asks for it (2026-10-03). A supplement after a comma ("Dunajska cesta 20, 2. nadstropje") is stored apart and printed after the number (QA 2026-10-03).
- **Shipping methods with prices + delivery estimates**: Pošta Slovenije standard (2–4 dni), Pošta Slovenije express, GLS; **free over €45** (config per zone) [ADAPT: 03 §8]. `[P1-core]`
- **Parcel-locker/pickup-point selection** (Pošta Slovenije Paketomat, GLS ParcelShop) with map/search [standard SI practice]. `[P2-growth]`
- Address autocomplete/validation (postal-code → city lookup) [standard practice]. `[P2-growth]`
- **Company fields** (podjetje, davčna številka) for B2C invoices on demand + future B2B [standard SI practice]. `[P2-growth]`

### 8.2 Order summary rail

- Line items (thumbs, qty, prices), discount field, subtotal, shipping, **VAT breakdown line ("vključen DDV 22 %: €X")**, total in EUR [standard practice; ADAPT]. `[P1-core]`
- Klarna installment recap under total. `[P1-core]`

### 8.3 Payment step

- **Stripe**: cards (3-D Secure 2 / SCA), **Apple Pay + Google Pay** via Stripe Payment Request [standard practice]. `[P1-core]`
- **PayPal** (Smart Buttons). `[P1-core]`
- **Klarna** (Plačaj v 3 / Plačaj kasneje — availability per Klarna SI coverage). `[P1-core]`
- Saved cards for returning customers (Stripe payment methods). `[P2-growth]`
- Express wallet buttons on PDP/cart (Apple Pay / Google Pay one-tap) [BASE: 03 §8]. `[P2-growth]`

### 8.4 Legal & conversion details

- Order button labelled **"Naročilo z obveznostjo plačila"** (CRD art. 8(2)) [EU requirement]. `[P1-core]`
- T&Cs + withdrawal-right links at pay step; **marketing opt-in checkbox unchecked by default** (GDPR; HiSmile pre-checks — we deliberately don't) [NEW/ADAPT: 05 §3.3]. `[P1-core]`
- **Abandoned-checkout capture**: email recorded at step 1 → recovery flow (§11) [ADAPT: 03 §10]. `[P1-core]`
- Idempotent order creation, stock check at payment confirm, SCA failure retry path [standard practice]. `[P1-core]` An unpaid order placed in the last 24 hours is offered back on `/checkout` (its receipt cookie, or the signed-in owner) instead of being lost to a reload or Back (QA 2026-10-03).
- **Confirmation page**: order number (NS-…), summary, delivery estimate, "spremljajte pošiljko" explainer, invite to create account / leave email preferences [standard practice]. `[P1-core]`
- Confirmation email + PDF invoice sent immediately (§14.7, §14.11). `[P1-core]`

---

## 9. Promotions, pricing & discount engine

### 9.1 Coupon engine (admin-built, §14.4)

- Types: **% off, fixed-amount off, free shipping, BXGY (buy X get Y)** [BASE: WooCommerce parity; ADAPT: 03 §7]. `%`/fixed/free-shipping `[P1-core]`; BXGY `[P2-growth]`
- Constraints: usage limits (total + per customer), date ranges, min. order value, product/collection/customer eligibility, exclusions, **no stacking** [ADAPT]. `[P1-core]`
- Uniform terms sentence on every code: "Popust ne velja za pakete, že znižane izdelke in dostavo; ne sešteva se z drugimi ponudbami." [BASE: 04 §2]. `[P1-core]`
- Auto-apply links `/koda/{CODE}`; bulk **unique-code generation** for ESP flows (welcome, win-back) [ADAPT: 04 §2]. Unique codes `[P2-growth]`

### 9.2 Price display & Omnibus compliance

- Compare-at strikethrough supported catalog-wide; **when a discount is announced, the reference price shown is the lowest price from the previous 30 days** (system tracks price history per SKU and renders the "Najnižja cena v 30 dneh pred znižanjem: €X" line automatically; the window is the 30 days before the announced reduction, i.e. the compare-at switched on with the price change or within 24 h) [EU Omnibus; NEW vs HiSmile which avoids strikethrough entirely: 02 §5.2]. `[P1-core]`
- **Value-math anchoring**: "2 kosa za €X — vrednost €Y — prihranite Z %" and per-application unit prices — allowed when the reference is genuine current individual prices [BASE: 02 §7; compliance-checked]. `[P2-growth]`
- "Od: €X" from-pricing on configurable bundles [BASE: 02 §3.3]. `[P3-later]`

### 9.3 Campaign mechanics (the HiSmile playbook, phased)

- **Welcome popup** (10 % off first order): opens after ~55 s; **suppressed** on /cart, /account, /checkout, for known subscribers, and once interacted with, not again in the browser session in any tab (a session cookie); bottom sheet on mobile / centered on desktop; thank-you state auto-stores code for checkout [ADAPT: 01 §3.2, 04 §3]. `[P1-core]` A code named in its texts is written `{koda}` and filled with the popup's coupon code (QA 2026-10-03).
- **Escalating abandonment codes** (CART10 → CART15 via ESP flows; browse-abandon 15 %) [BASE: 04 §2]. `[P2-growth]`
- **Free gift with purchase (GWP)**: $0 auto-added mystery gift, weighted SKU pool (clearance high, hero low ~0.1–2.5), auto-removed when it's the only item, fixed-gift exception for promo carts; marquee + card badges echo the campaign [BASE: 04 §7]. `[P2-growth]`
- **Deal-SKU ladder per hero**: single → value 2-pack (~30–40 % off) → 3-pack → B3G2; hidden from catalog, surfaced via PDP/cart upsells and ad landing pages [BASE: 04 §4]. `[P2-growth]`
- **Rule-based upsell engine** (display rules: page, cart contents, stock; actions: add/remove/replace; copy formula: colored pill → headline with live price + strikethrough → instant-saving % → one legal footnote) [BASE: 04 §5]. `[P2-growth]`
- **"Unlock free shipping" SKU** (specific product flips the shipping bar to 100 %) [BASE: 03 §4]. `[P3-later]`
- **Sale mode**: one admin flag flips sale styling sitewide (nav link color, banners, badges) + hidden sale collection [BASE: 04 §12]. `[P2-growth]`
- **Campaign theme presets** (homepage hero/marquee/nav-art swaps per launch, no redeploy) [BASE: 04 §1]. `[P2-growth]`
- **Buy-now deep links** `?add=SKU` → straight to checkout (for ads) [BASE: 03 §11]. `[P2-growth]`
- **BYO bundle wizard** ("Izberi 2 plačljiva → izberi BREZPLAČNE izdelke 🔒 → tvoj paket", flat price) [BASE: 04 §6]. `[P3-later]`
- **Loss-leader traffic product** (€2 mini + shipping, final sale, feeds upsell chain) [ADAPT: 04 §6 lip-balm]. `[P3-later]`
- **Gift cards** (digital codes, 3-year validity per SI practice) [BASE: 05 §9.4]. `[P3-later]`
- **Community discounts** (students/key workers via verification service) [BASE: 04 §10]. `[P3-later]`
- **Money-back guarantee as merchandise**: 30-day guarantee policy at launch `[P1-core]`; guarantee bundled as $0 line item into routine bundle ("7-dnevni protokol") `[P2-growth]` [BASE: 04 §8].

---

## 10. Reviews & social proof (the big NEW win)

HiSmile runs **zero on-site reviews** (Amazon screenshots instead; Trustpilot 2.6/5 kept off-site) — a real review platform is our fastest trust lever as an unknown Slovenian brand [NEW: 02 §8, 05 §7].

- **Review collection**: automated post-delivery email (timed ~7–10 days after delivery, per product usage cycle) with one-click in-email star rating → full form on site [standard practice]. `[P1-core]`
- **Verified-buyer badge** (review tied to order) [standard practice]. `[P1-core]`
- **Review content**: star rating, title, text, **photo upload** (up to 4), optional attributes (e.g. "stopnja občutljivosti", "bi priporočili") [standard practice]. `[P1-core]` No star is preselected: the form asks for a rating, except one carried from the e-mail's one-click stars (QA 2026-10-03).
- **Display**: PDP summary (average, count, star distribution bar), photo wall, review cards (verified badge, date, photos, merchant reply), sort (najnovejše/najvišje ocenjene/najnižje), filter by stars & "s fotografijo" [standard practice]. `[P1-core]`
- Stars on **product cards** (home/collection/related) + AggregateRating JSON-LD feeding Google stars [NEW: 07 §9.8]. `[P1-core]`
- **Moderation queue in admin**: approve/reject, merchant reply, spam/photo moderation; auto-publish verified 4–5★ optional [standard practice]. `[P1-core]`
- "Bila je ta ocena koristna?" helpful votes. `[P2-growth]`
- Review incentives (small next-order coupon for photo reviews, disclosed: "nagradjena ocena") — Omnibus/GDPR-checked wording. `[P2-growth]`
- Q&A section on PDP (ask a question, merchant answers). `[P3-later]`
- Review syndication / Google Seller Ratings, Trustpilot presence. `[P3-later]`

---

## 11. Customer account

### 11.1 Auth

- Register: first/last name, email, password, **unchecked** marketing checkbox, email verification (double opt-in for the account) [ADAPT: 05 §3.3]. `[P1-core]` Activation asks for the password chosen at registration; registering an address that awaits activation again does not replace the first registration; activation and reset mails are bounded per address (QA 2026-10-03).
- Login, forgot-password (email reset link), reset/activate token flows [BASE: 05 §3]. `[P1-core]` Sign-out ends every copy of the session (AGENTS §5.12); a sign-in, a refused session and the staff second factor all return to the page asked for (QA 2026-10-03).
- **Social login** (Google, Facebook) placed above the classic form with "Ali" divider [BASE: 05 §3.1]. `[P2-growth]` Its buttons stay hidden until a provider is configured (QA 2026-10-03).
- hCaptcha/Turnstile on all auth forms [BASE: 05 §3]. `[P1-core]`

### 11.2 Dashboard ("Moj račun")

- Greeting "Živjo, {ime}" + rows: Moja naročila / Moji podatki / Kontaktirajte podporo / Odjava [ADAPT: 05 §4 minimalism, extended]. `[P1-core]`
- **Order cards** (accordion): order no. NS-…, friendly date ("9. september 2026"), **colored status pill** (plačano/v obdelavi/odposlano/dostavljeno/povrnjeno), first 3 items + "Pokaži več", "Odposlano z {dostavna služba}" [ADAPT: 05 §4.1]. `[P1-core]`
- **Order detail page**: full line items, totals + VAT breakdown, addresses, payment method, **invoice PDF download**, **tracking number with clickable carrier link** (Pošta Slovenije / GLS tracking URL) [NEW — HiSmile shows status only: 05 §4.1, §12]. `[P1-core]`
- **Address book** (multiple addresses, default) [standard practice]. `[P1-core]`
- **"Ocenite izdelek"** entry points from delivered orders [NEW]. `[P1-core]`
- **Withdrawal/return initiation** from an eligible order (generates the 14-day withdrawal request → support queue) [standard practice]. `[P2-growth]`
- **GDPR self-service**: download my data (JSON/PDF), delete/anonymize my account [GDPR art. 15/17; NEW]. `[P2-growth]` (manual process via support at P1)
- Notification preferences (order emails mandatory; marketing toggles) [standard practice]. `[P2-growth]`
- Loyalty points balance + referral hub in account [NEW: 05 §12 whitespace]. `[P3-later]`
- Wishlist. `[P3-later]`

### 11.3 Guest surfaces

- **Guest order lookup** (email + order number) on contact page and tracking page — kills the #1 ticket type [BASE: 05 §6]. `[P1-core]`
- The order confirmation of a guest whose e-mail already has an account offers sign-in, not account creation (QA 2026-10-03). `[P1-core]`

---

## 12. Support & legal content

### 12.1 Support access and checkout delivery information

- **Direct support access** through `/kontakt`, public tracking and the legal/policy pages. The user removed the standalone Help Centre, its categorized articles/search, About Us and Explore from page scope on 2026-09-09. Product education and PDP FAQ accordions remain in place. This is a scope removal, not a deferred Help Centre build. `[P1-core]`
- Delivery information is handled in **checkout**: methods, prices, delivery times, countries served and free-shipping threshold, using shipping settings. **No separate `/dostava` page** (user scope correction, 2026-09-09). Existing cart/PDP delivery summaries remain in scope. `[P1-core]`
- Legacy redirects preserve incoming links: `/pomoc` → `/kontakt`, `/o-nas` and `/razisli` → `/`, `/dostava` → `/checkout`, `/paketi` → `/trgovina?kolekcija=paketi`. Retired pages are removed from navigation/sitemaps; the bundles destination is the existing collection view. `[P1-core]`

### 12.2 Contact page (`/kontakt`)

- **Guided topic triage** (icon cards): Spremljanje naročila / Sprememba naročila / Preklic / Vračilo / Napačno naročilo / Poškodovano / Svetovanje o izdelku / Prijava neželenega učinka / Drugo — with sub-reasons and photo-attach instructions for wrong/damaged [ADAPT: 05 §8.3]. `[P1-core]`
- **Real form → ticket** (POST to our backend → helpdesk/email queue with topic routing), NOT HiSmile's `mailto:` hack [NEW: 05 §8.3]. `[P1-core]`
- Order-context step via guest order lookup + "izberite naročilo" dropdown [BASE: 05 §6]. `[P1-core]`
- Photo upload for wrong/damaged claims [ADAPT: 05 §8.3]. `[P1-core]` Photos over 2 MB are downscaled in the browser, as the review form does (QA 2026-10-03).
- Support hours + response-time promise (e.g. "odgovor v enem delovnem dnevu") [BASE: 05 §8.5]. `[P1-core]`
- Channels: email + contact form at launch; live chat `[P3-later]`; **AI chatbot with commerce actions** (add-to-cart in chat) `[P3-later]` [BASE: 05 §8.4]; no phone/WhatsApp [BASE: 05 §8.5].

### 12.3 Order tracking (public)

- **"Sledi naročilu" page**: enter tracking no. or email+order no. → status + **carrier tracking link** (Pošta Slovenije / GLS) + delivery estimate [NEW: 05 §12]. `[P1-core]`
- Tracking links in shipped-email + account order detail (same carrier-URL templates, §14.12). `[P1-core]` A `?sledenje=` link runs the lookup at once (QA 2026-10-03).

### 12.4 Returns, withdrawal & complaints (EU)

- **14-day withdrawal right page** with instructions + **model withdrawal form** (downloadable + online version) [CRD; standard practice]. `[P1-core]`
- **Sealed-cosmetics exception**: sealed goods unsuitable for return for health or hygiene reasons and unsealed after delivery are excluded from withdrawal (CRD art. 16(e)) — one shared phrase on every surface; refund incl. standard outbound shipping, to the original payment method, within 14 days of the withdrawal notice, withheld until the goods or proof of sending arrive (CRD art. 13) [EU; ADAPT of HiSmile's 30-day/unused policy: 05 §9.1]. `[P1-core]`
- **Voluntary extension**: 30-day money-back guarantee program (marketing layer above statutory 14 days; conditions: contact first, proof of purchase, photos) [ADAPT: 05 §9.1]. `[P1-core]` as policy; automated return-flow `[P2-growth]`
- **Faulty-product claim process** (3-stage: troubleshooting → photo/video + batch number → physical inspection) [ADAPT: 05 §9.2]. `[P1-core]` as documented process; structured forms `[P2-growth]`
- Reklamacije (complaints) page + out-of-court dispute-resolution (IRPS) info per SI law [standard SI practice]. `[P1-core]`

### 12.5 Legal pages

- Pogoji poslovanja (T&Cs), Politika zasebnosti (GDPR: rights, DPO/contact, processors incl. ESP/pixels), Politika piškotkov (live cookie table), Odstop od pogodbe, Reklamacije [standard practice; ADAPT: 05 §9]. Delivery information is handled in checkout rather than a separate Dostava page (user scope correction, 2026-09-09). `[P1-core]`
- Every LEGAL page renders a table of contents (an anchor list of its sections) in its initial HTML (QA 2026-10-03). `[P1-core]` A sticky one on long legal pages [BASE: 05 §9]. `[P2-growth]`

### 12.6 Cosmetics-compliance surfaces

- **INCI ingredient lists** on every PDP (accordion, §6) + on packaging images [EU 1223/2009]. `[P1-core]`
- **Adverse-event report form** ("Prijava neželenega učinka"): reporter details, product + **batch number** ("natisnjeno na embalaži"), purchase details, reaction description, medical-treatment question, privacy consents → routes to a compliance mailbox [ADAPT: 05 §8.3]. Basic form `[P1-core]`; structured workflow + legal bcc `[P2-growth]`
- Claims discipline: every marketing claim with `*`/`^` footnote resolving to substantiation accordion; no medical claims [BASE: 04 §14.12]. `[P1-core]`

---

## 13. Marketing & retention

### 13.1 Email capture surfaces (all feeding one ESP)

- **Welcome popup** (10 % off, §9.3) [ADAPT: 01 §3.2]. `[P1-core]`
- **Footer newsletter** (trial-exclusivity hook) [BASE: 01 §2.8]. `[P1-core]`
- **Back-in-stock capture** on sold-out cards/PDPs ("Obvestili vas bomo, ko bo spet na zalogi!") [BASE: 02 §2.4]. `[P1-core]` The confirmation mail and the confirmed page carry the one-click withdrawal link, so an alert can be withdrawn before it fires (QA 2026-10-03).
- Checkout opt-in (unchecked) + account preferences [ADAPT]. `[P1-core]`
- **Double opt-in for marketing lists** (GDPR/ZEKom-1 practice) [NEW]. `[P1-core]`
- SMS capture (secondary step / dedicated landing page) [BASE: 04 §3]. `[P3-later]`

### 13.2 Flows (ESP)

- Welcome series (code delivery + brand story + best-sellers) [standard practice]. `[P2-growth]` (needs ESP)
- **Abandoned checkout**: email #1 (1–4 h, no discount) → #2 (24 h, CART10) [ADAPT: 04 §2]; escalation to 15 % `[P2-growth]` (needs ESP; at P1 the coupon system + recovery links are built so this plugs in later)
- Post-purchase: order confirmation (transactional), shipped (tracking link), delivered, **review request** (§10), cross-sell of the other 2 products [standard practice]. `[P1-core]` (review/cross-sell timing tuning `[P2-growth]`)
- **Replenishment reminders** for consumables (mouthwash/serum ~30–45 days, strips per protocol) [ADAPT of bundle-logic]. `[P2-growth]`
- Browse abandonment (15 % ladder) [BASE: 04 §2]. `[P2-growth]`
- Win-back (90/180-day no-purchase) [standard practice]. `[P2-growth]`
- Back-in-stock alerts (auto-send on restock) [standard practice]. `[P1-core]`
- Price-drop / sale announcements to opted-in segments [standard practice]. `[P2-growth]`

### 13.3 Outbound & earned

- Social profiles (Instagram, TikTok, Facebook, YouTube) in footer [BASE: 01 §2.8]. `[P1-core]`
- UGC/TikTok-style creative pipeline for ads + PDP video (raw "creator ad" aesthetic is the proven register for this category) [BASE: 01 §2.4]. `[P1-core]` (process, not a feature)
- Instagram/UGC feed on site (shoppable). `[P2-growth]`
- **Refer-a-friend** (friend gets % off, referrer gets coupon) [ADAPT: 04 §10; task-scheduled as later phase]. `[P3-later]`
- **Loyalty program** (points per €, tiers, in-account hub) [NEW whitespace: 05 §12; later phase]. `[P3-later]`
- Affiliate/creator program page (tracking links, commission) [BASE: 04 §10]. `[P3-later]`
- Influencer seeding → review pipeline (pre-launch seeding for day-one review volume) [standard practice; process note]. `[P1-core]`
- Subscriptions ("naročni in prihrani") — **not planned**; HiSmile itself wound Club Hismile down (Aug 2025) and drives retention with bundles/multi-buy [BASE: 02 §1, 05 §5]. `[P3-later]` only if data demands it.

---

## 14. ADMIN DASHBOARD (WordPress/WooCommerce parity)

Custom admin web app (separate secured area, role-based). Everything the storefront treats as "config" lives here. WooCommerce-parity baseline, extended with the HiSmile promo machinery.

### 14.1 Dashboard (admin home)

- KPI cards: revenue, orders, AOV, items/order, conversion rate, sessions (date-range selector) [standard practice]. `[P1-core]` One cohort: the orders paid in the range, whatever happened to them since; revenue is net of every refund on them, a paid order cancelled later included, and revenue by product is net of the units that went back (QA 2026-10-03).
- **Sales charts**: revenue & orders over time (day/week/month), revenue by product, orders by status [standard practice]. `[P1-core]`
- Lists: recent orders, **low-stock alerts**, pending review queue, active coupons expiring soon [standard practice]. `[P1-core]`
- Top search queries & zero-result searches (from site search) [NEW]. `[P2-growth]`
- Channel/UTM revenue breakdown, new vs returning, discount-usage report, free-shipping-threshold attach rate [standard practice]. `[P2-growth]`
- CSV export of any report. `[P2-growth]`

### 14.2 Products

- **Product CRUD**: title, slug, rich description (bullets with highlight markup), status (draft/active/archived), template picker [Woo parity; BASE: 07 §8.1]. `[P1-core]`
- **Variants** (options e.g. pack size/flavor later): SKU, price, compare-at, cost, barcode, weight, stock per variant [Woo parity]. `[P1-core]` A save writes stock only when the figure was changed, and only over the figure the form opened with — a sale in between is reported, not overwritten; a backordered variant below zero still saves its other fields; a variant with sales or price changes cannot be deleted, because its price history is the Omnibus record (QA 2026-10-03).
- **Image & media library**: gallery w/ drag-sort, alt text, video upload, separate mobile crops, badge/sticker overlays per product [ADAPT: 07 §8.1]. `[P1-core]`
- **Inventory**: stock tracking, low-stock threshold, sold-out behavior (hide vs "Obvestite me"), backorders [Woo parity]. `[P1-core]`
- **Per-product rules**: maxCartQuantity, visibility flags (catalog/search/**hidden deal SKU**), badges/pills, USP chips, unit-price text, Klarna eligibility [ADAPT: 07 §5]. `[P1-core]`
- **PDP content fields**: accordions (Kako deluje/Sestavine/Jamstvo/Testirano), FAQ items, education sections, related products (curated), upsell & add-on config (cross-sells, upgrade offers, cart/checkout add-on offers) [ADAPT: 07 §5.10]. `[P1-core]`
- **Custom fields (JSON metafields)** per product/page — the HiSmile backbone pattern; replicates 80 % of their content ops [BASE: 07 §9.4]. `[P1-core]`
- **Price history per SKU** (auto-logged; powers Omnibus 30-day-low display) [EU requirement]. `[P1-core]`
- SEO fields per product (title, description, OG image). `[P1-core]`
- Back-in-stock subscriber list per product + "send alert" trigger [ADAPT]. `[P1-core]`
- Bulk actions (price edit, status, stock import CSV) [Woo parity]. `[P2-growth]`

### 14.3 Categories / collections

- **Collections CRUD**: manual product lists with drag-sort merchandising, banner image (desktop+mobile), hide-banner-text toggle, SEO fields, noindex toggle [ADAPT: 07 §8.2]. `[P1-core]`
- **Rules-based collections** (auto-include by tag/price/stock) [Woo parity]. `[P2-growth]`

### 14.4 Coupons & discounts

- **Coupon CRUD**: code, type (**% / fixed cart / fixed product / free shipping / BXGY**), amount, **usage limits (total, per customer)**, **date ranges**, min. spend, **eligibility (products, collections, customers/emails)**, exclusions, stacking rules [Woo parity, task-required]. `%`/fixed/free-shipping `[P1-core]`; BXGY `[P2-growth]`
- Auto-apply link generator (`/koda/{CODE}`) + QR-ready URLs for ads [ADAPT]. `[P1-core]`
- **Bulk unique-code generation** (prefix + count → CSV for ESP import; single-use) [standard practice]. `[P2-growth]`
- Usage report per code (orders, revenue, discount cost) [Woo parity]. `[P2-growth]`
- **Automatic discounts** (no code): sale price rules, quantity breaks [Woo parity]. `[P2-growth]`

### 14.5 Free-gift rules (GWP engine)

- Campaign config: active flag, trigger (any cart / min. spend / specific products), gift SKU pool + **probability weights**, exception rules (fixed gift for promo carts), max 1, auto-add/auto-remove, display copy + CTA, card-badge assets [BASE: 04 §7]. `[P2-growth]`

### 14.6 Bundle builder

- **Fixed bundles**: component SKUs + quantities, bundle price, inventory deduction from components, fulfillment expansion on order line [task-required; BASE: 07 §5.2]. `[P1-core]` The bundle editor warns while the bundle product's own stock is 0, which caps what it can sell (QA 2026-10-03).
- Per-component "vrednost" display math (auto-computed savings line, Omnibus-checked) [ADAPT]. `[P1-core]`
- **BYO bundle config**: paid slots, free slots, product pools per slot, flat price, wizard copy [BASE: 04 §6]. `[P3-later]`

### 14.7 Orders

- **Orders list**: search (no., email, name, tracking), filters (status, date, payment, country), bulk actions, CSV export [Woo parity]. `[P1-core]`
- **Statuses**: `pending` (created, unpaid) → `paid` → `processing` → `shipped` → `delivered`; `cancelled`; `refunded` (full/partial) [task-required]. `[P1-core]`
- **Status-transition rules** (validated; each transition can fire an email): pending→paid (auto on PSP webhook), paid→processing, processing→shipped (**requires carrier + tracking no.** → generates tracking URL → sends shipped email), shipped→delivered (manual or carrier webhook `[P2-growth]`), pending/paid→cancelled (with auto-void/refund), any→refunded (full/partial via Stripe/PayPal/Klarna) [standard practice]. `[P1-core]`
- **Order detail**: line items (with bundle expansion + line properties like `_free_gift`), totals + VAT breakdown, customer, addresses, payment status/PSP reference, **timeline/activity log**, **internal notes + customer-visible notes**, resend email, invoice/packing-slip PDF [Woo parity; BASE: 07 §8.3]. `[P1-core]` Customer-visible notes only on account orders (a guest has no page that shows them); a paid order cancelled with a refund mails the refunded amount (QA 2026-10-03).
- **Refunds**: full/partial with restock toggle + reason; partial-refund line math incl. proportional VAT [Woo parity]. `[P1-core]`
- Manual order creation (phone/DM orders) [Woo parity]. `[P2-growth]`
- Fulfillment export (CSV/API to 3PL) [BASE: 07 §8.3]. `[P2-growth]`

### 14.8 Customers

- **Customers list**: search, filters (orders count, country, marketing consent), CSV export [Woo parity]. `[P1-core]`
- **Customer detail**: profile, addresses, order history, LTV/orders count, marketing-consent status + history, tags, notes [Woo parity]. `[P1-core]`
- **GDPR actions**: export customer data, **anonymize/delete** (keeps order financials, scrubs PII) [GDPR; task-relevant]. `[P1-core]` (anonymize) / self-service `[P2-growth]`. An anonymised guest's placeholder address is never listed as a customer (QA 2026-10-03).
- Segments (e.g. "kupili trakove, niso seruma") with ESP sync [standard practice]. `[P2-growth]`

### 14.9 Reviews moderation

- Queue (pending/published/rejected), approve/reject, **merchant reply**, photo moderation, verified-purchase linkage, request-email timing config [task-implied; standard practice]. `[P1-core]`
- Review-incentive coupon config (disclosed incentives) [standard practice]. `[P2-growth]`

### 14.10 Content & merchandising (CMS)

- **Homepage editor**: section list with drag-order + visibility toggles; hero slot (copy, video mobile/desktop, CTA, overlay banner); bundle banner; review strip selection [task-required; ADAPT: 07 §8.4]. `[P1-core]`
- **Campaign presets**: save/switch homepage+marquee+badge bundles per campaign (one-click launch looks) [BASE: 04 §1]. `[P2-growth]`
- **Pages CRUD**: title, slug, rich body, template picker (default, legal w/ TOC, contact, landing), SEO fields [Woo parity]. Generic CMS capability does not add the removed Help Centre, About Us, Explore or Delivery pages back to scope. `[P1-core]`
- **Navigation menus**: header (incl. mega-menu featured product cards + colored sale link), utility bar, footer columns, mobile drawer [task-required]. `[P1-core]`
- **Announcement marquee config**: message, link, active [BASE]. `[P1-core]` The `{prag}` token (§3.1) (QA 2026-10-03).
- **Blog/news CMS** (SEO content hub) [NEW]. `[P2-growth]`
- Media library (global assets, folders, alt text) [Woo parity]. `[P1-core]`
- Redirects manager (301s) + 404 log [standard practice]. `[P2-growth]`

### 14.11 Popups, banners & email templates

- **Discount popup config**: headline, % / code, body, timing delay, suppression rules (paths, known users, per-session), active flag, A/B variant support later [task-required; BASE: 04 §3]. `[P1-core]`
- Sticky info banner / ops notice config [BASE: 04 §9]. `[P2-growth]`
- **Email templates** (transactional, editable per language, preview + test-send): order confirmation (+invoice), payment failed, processing, shipped (tracking link), delivered, cancelled, refunded (full/partial), withdrawal received/confirmed, review request, back-in-stock alert, welcome (+code), abandoned cart #1/#2, password reset, email verification [task-required]. `[P1-core]` (marketing-flow templates live in ESP; transactional in admin). An override without its action link (`{{confirmUrl}}`, `{{resetUrl}}`) is refused on save and never sent (QA 2026-10-03).
- ESP integration settings (API keys, list IDs, event mapping) [ADAPT: 07 §8.4]. `[P2-growth]`

### 14.12 Shipping settings

- **Zones**: Slovenia (default), EU countries (each with enabled flag) [task-required]. `[P1-core]`
- **Carriers & rates per zone**: Pošta Slovenije (standard/express), GLS; flat rate, price-based tiers, weight-based tiers; **free-shipping threshold per zone** (default €45 SI) [task-required]. `[P1-core]`
- Delivery-time display strings per method (shown on PDP/cart/checkout) [ADAPT]. `[P1-core]`
- **Tracking URL templates per carrier** (e.g. `https://sledenje.posta.si/{tracking}`, GLS tracking URL pattern) — powers all tracking links [NEW]. `[P1-core]`
- Parcel-locker integrations (Paketomat/GLS ParcelShop APIs, pickup-point selector) [standard SI practice]. `[P2-growth]`
- Label generation via carrier APIs [standard practice]. `[P2-growth]`

### 14.13 Tax, VAT & payments settings

- **VAT config**: SI 22 % default; VAT-inclusive pricing on; per-country VAT rates + **OSS distance-selling** handling when EU sales cross €10k [EU; task-required]. SI-only `[P1-core]`; OSS per-country rates `[P2-growth]`
- **Invoice settings**: company data, logo, sequential numbering (e.g. `NS-2026-00001`), VAT breakdown layout, notes/footer text [SI practice]. `[P1-core]`
- Payment provider settings: Stripe (keys, wallets toggle, SCA), PayPal, Klarna; test/live modes [task-required]. `[P1-core]`
- Currency: EUR (architecture allows adding currencies later) [ADAPT: 07 §2]. `[P1-core]`

### 14.14 Marketing, SEO & store settings

- **Pixels & tracking**: GTM ID, GA4 ID, Meta pixel (+CAPI token), TikTok pixel — all consent-category-mapped [ADAPT: 07 §9.5]. `[P1-core]`
- **SEO defaults**: title template (`{Page} | Nasmeh.si`), default meta description, default OG image, robots control, sitemap toggles [standard practice]. `[P1-core]`
- **Cookie-consent config**: banner copy, category definitions, cookie table entries, consent-version bump [GDPR]. `[P1-core]`
- **Store settings**: store name/logo, contact emails (podpora@, info@), company registration + VAT ID (footer/invoice), social links, languages (SI; EN toggle when ready), maintenance/password mode [Woo parity]. `[P1-core]`
- Legal-page link mapping (used by checkout/footer/consent flows) [standard practice]. `[P1-core]` Every mapped link must point to a published page (QA 2026-10-03).

### 14.15 Admin platform

- **Roles & permissions**: Owner (everything), Manager (catalog/promos/content), Support (orders/customers/reviews, no settings), Fulfillment (orders, shipments) [standard practice]. `[P1-core]`
- 2FA for all admin users; session management [standard practice]. `[P1-core]` Second-factor attempts are bounded and the refusal says so (QA 2026-10-03).
- Admin not-found page inside the admin; wide tables show that they scroll (QA 2026-10-03). `[P1-core]`
- **Audit log** (who changed what, when — esp. prices, refunds, coupon rules) [standard practice]. `[P2-growth]`
- API keys/webhooks (ERP/3PL/ESP hooks), import/export tools [standard practice]. `[P2-growth]`
- Staging environment + preview links for content [standard practice]. `[P1-core]`

---

## 15. Deliberate omissions & "do not copy" list

| Decision | Rationale (grounded) |
|---|---|
| No multi-store/multi-region architecture at launch | Single SI/EU market; one EUR store with region-config layer keeps the door open (07 §2, §9.6) |
| No Help Centre, About Us, Explore or standalone Delivery page | User's 2026-09-09 shopping-focused scope; support stays in contact/tracking/legal, delivery in checkout, product education/FAQs on PDPs |
| No subscriptions | HiSmile wound Club Hismile down (Aug 2025); bundles/multi-buy carry retention (02 §1, 05 §5) |
| No loyalty/referral at launch | Task-scheduled later phase; HiSmile has none live either (05 §5) |
| No faceted filters, no pagination UI | 3 SKUs; merchandising order does the work (02 §3.2) |
| No drawer cart at P1 (page first) | HiSmile deliberately trades drawer speed for cart-page merchandising (03 §2); we add drawer in P2 |
| No coupon field on cart page | Codes via auto-apply links + checkout field; fewer support tickets (03 §7) |
| No text baked into promo images (we render live HTML) | HiSmile's baked text is untranslatable/unselectable — unacceptable for SI localization (01 §5.6) |
| No pre-checked marketing consent | GDPR; HiSmile pre-checks (05 §3.3) — we deliberately don't |
| No session-only cosmetic cookie bar | EU needs a real CMP (05 §12) |
| No `mailto:` contact form | Real tickets (05 §8.3, §12) |
| Never copy: product names (V34, PAP+, iD Stain…), copy lines, creative, magenta identity | Explicit in every dossier (01 §5, 02 §10) |

---

## 16. Phase summary (checklist view)

**P1-core (launch):** SSR Next.js storefront · Docker deployment (compose: app + DB) · 3 products + fixed routine bundle + deal-SKU-ready data model · Slovenian/EUR/VAT-incl. · full PDP anatomy w/ breadcrumbs, delivery accordion, unit prices, Klarna line, sticky ATC · **reviews w/ photos (collect + display + moderate)** · **site search (instant)** · cart page w/ free-shipping bar + curated cross-sell · custom checkout (Stripe cards/Apple Pay/Google Pay, PayPal, Klarna) · Pošta Slovenije/GLS rates · GDPR CMP + consent log · Omnibus 30-day-low price display · 14-day withdrawal pages/forms · adverse-event form · welcome popup 10 % · back-in-stock capture · abandoned-cart flow · account w/ order cards + **tracking links** + guest lookup · shopping-focused navigation · real contact triage form · GA4/Meta/TikTok via GTM w/ Consent Mode · full JSON-LD + per-page meta · **Admin**: dashboard+charts, products/variants/images/inventory, collections, coupons (%/fixed/free-shipping + limits + dates + eligibility), fixed-bundle builder, orders (7 statuses + transitions + notes + refunds + invoices), customers (+GDPR anonymize), reviews moderation, homepage/menus/marquee CMS, popup config, email templates, shipping zones/rates/tracking templates, VAT/invoice settings, roles+2FA.

**P2-growth:** drawer cart + hover preview · deal-SKU ladder (2-packs, B3G2, hot deals) + rule-based upsell engine (Upgrade & Save / Bundle & Save / Unlocked formats) · GWP mystery-gift engine · campaign presets + sale mode · BXGY coupons + unique-code bulk generation · escalating abandon codes · replenishment + win-back + browse-abandon flows · review incentives + helpful votes · OSS multi-country VAT · parcel lockers + label printing · English version · blog/SEO hub · before/after gallery · social login · express wallets · address autocomplete · withdrawal initiation from account · GDPR self-service · ops-notice banner · segments + CAPI · search analytics · redirects manager · audit log.

**P3-later:** BYO bundle wizard · loss-leader traffic product · gift cards · refer-a-friend · loyalty program · affiliate program · community (student/key-worker) discounts · AI chatbot w/ commerce actions · live chat · SMS marketing · subscriptions (only if data demands) · unlock-free-shipping SKU · additional regions/currencies.

---

*End of master spec. Copy patterns (Slovenian microcopy formulas) and design tokens live in `docs/research/06-design-system.md` §19; all HiSmile mechanics cited per dossier section.*
