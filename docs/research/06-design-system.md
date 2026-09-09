# Hismile — Visual Design System Analysis

> Research date: 2026-09-09 · Source: live store `hismileteeth.com` (the `hismile.com` domain now resolves to 127.0.0.1/parked; the brand's live Shopify storefront is `hismileteeth.com`, Shopify shop id 9164078, theme id 151475093569).
> All values below were extracted directly from the production CSS/JS bundles served at `hismileteeth.com/cdn/shop/t/994/assets/*` (`theme-E5itcjEW.css`, `MainView-*.css`, `UiButton-*.css`, `UiPill-*.css`, `UiCard-*.css`, `CollectionProductCard-*.css`, `BasicProductTemplate-*.css`, `HomeDefault-*.css`, `PageSectionHero-*.css`, `CartDefault-*.css`, etc.) and from page-injected JSON (`window.productArray`, theme-setting defaults in `theme-CwMsJ38v.js`). Nothing here is guesswork; where a value could not be verified it is marked as such.

---

## 1. Technical architecture (why the design system looks the way it does)

- **Platform:** Shopify (`powered-by: Shopify`, `myshopify` domain `hismile.myshopify.com`), but the storefront theme is a **custom Vue 3 SPA** (Vue + Vite + Pinia) mounted into `<div id="app"></div>`. The Liquid theme renders an empty shell; all UI is client-rendered.
- **Component library:** a bespoke `Ui*` design-system: `UiButton`, `UiPill`, `UiCard`, `UiInput`, `UiModal`, `UiAccordion`, `UiMarquee`, `UiStickyBar`, `UiImage`, `UiPrice`, `UiLazyComponent`, `UiPageSkeleton`, plus page-section components (`PageSectionHero`, `PageSectionCatalog`, `PageSectionContentOnBackground`, `PageSectionBanner`, `PageSectionCardGrid`) — each a Vue SFC with scoped CSS shipped as a separate Vite chunk.
- **Design-token mechanism:** CSS custom properties on `:root`, stored as **RGB triplets** (e.g. `--brand-pink: 236, 0, 140`) and consumed as `rgb(var(--brand-pink))` / `rgba(var(--mid-1), .8)`. Components expose their own overridable custom properties (e.g. `--button-background`, `--pill-border-radius`), so variants are created by re-declaring variables, not by overriding rules. **This is an excellent pattern to copy for Nasmeh.si.**
- **Theming:** multiple campaign "themes" ship in one bundle (`window.global_theme = "toothWipesTheme"` was active); per-theme defaults (hero media, copy, marquee) swap without code changes. Landing pages have per-product CSS (`ProductMwFeatureLp`, `ProductTaParent`, `ProductV34WhiteningStripsLanding`…), each with its own namespaced palette (`--mw-*`, `--ta-*`).

---

## 2. Color system

### 2.1 Neutral scale — literally Apple's iOS system-gray palette
The entire neutral ramp is copied from iOS dark-mode grays. This gives the UI its "native app" cleanliness and lets the loud brand colors do all the talking.

| Token | RGB | Hex | Typical use |
|---|---|---|---|
| `--black` | 0,0,0 | `#000000` | primary button bg |
| `--dark-1` | 28,28,30 | `#1C1C1E` | headings, primary text, dark surfaces, footer newsletter block |
| `--dark-2` | 44,44,46 | `#2C2C2E` | button hover, pill text |
| `--dark-3` | 58,58,60 | `#3A3A3C` | button hover (alt) |
| `--dark-4` | 72,72,74 | `#48484A` | button active/pressed |
| `--mid-1` | 99,99,102 | `#636366` | **body copy**, secondary text, modal overlay (`rgba(--mid-1,.8)`) |
| `--mid-2` | 142,142,147 | `#8E8E93` | compare-at prices, footer body, faded nav |
| `--mid-3` | 174,174,178 | `#AEAEB2` | input icons, chevrons, disabled |
| `--mid-4` | 199,199,204 | `#C7C7CC` | placeholder/disabled buttons |
| `--light-1` | 209,209,214 | `#D1D1D6` | disabled primary button bg, variant-selector scrim (`rgba .4`) |
| `--light-2` | 229,229,234 | `#E5E5EA` | accordion borders, pill borders, pressed white button |
| `--light-3` | 242,242,247 | `#F2F2F7` | **hairline borders everywhere**, input borders, image placeholder bg, secondary-nav/footer-bar bg |
| `--light-4` | 250,250,252 | `#FAFAFC` | **page background** (`body`), mobile-nav drawer, mega-menu bg |
| `--white` | 255,255,255 | `#FFFFFF` | cards, header, modals, product-description panels |

### 2.2 Brand & functional colors

| Token | RGB | Hex | Use |
|---|---|---|---|
| `--brand-pink` | 236,0,140 | **`#EC008C`** | THE brand color — sale text, prices, promo pills, cart dot, announcement marquee bg, sale-banner bg |
| `--brand-purple` | 129,0,140 | `#81008C` | legacy/secondary brand |
| `--brand-blue` | 17,36,92 | `#11245C` | deep navy (campaign graphics) |
| `--brand-v34` | 68,0,153 | `#440099` | V34 Color-Corrector line color |
| `--brand-nhpro` | 255,117,0 | `#FF7500` | NHPro line |
| `--brand-ha5` | 80,192,232 | `#50C0E8` | HA5 line |
| `--link` | 0,122,255 | `#007AFF` | text links, sticky info banner bg (iOS system blue — again Apple-flavored) |
| `--success` | 52,199,89 | `#34C759` | "added to cart" button state, input focus border, positive pills |
| `--error` | 221,60,95 | `#DD3C5F` | form errors, negative pills |
| `--warning` | 255,170,113 | `#FFAA71` | — |
| `--sale` / `--discount-text` | 236,0,140 | `#EC008C` | same pink, semantic alias |
| `--sale-primary-outline` | 192,1,114 | `#C00172` | darker pink outline |
| `--sale-secondary` | 229,229,234 | `#E5E5EA` | neutral sale chip |
| `--sale-tertiary` | 252,161,199 | `#FCA1C7` | light pink chip, outline `#FD5A9E` |
| `--hero-banner` | 236,57,72 | `#EC3948` | red-pink promo banner |

### 2.3 Flavor/product-line accent colors (used on flavor swatches & cards)
`--brand-coconut #ABE2BF` · `--brand-mango #F2C65E` · `--brand-mint #9EB5CB` · `--brand-peach #FFB386` · `--brand-watermelon #EC86D0` · `--brand-yellow #EBFF00` (acid lime — used for "FREE" type in promo art).

### 2.4 Landing-page palettes (proof they namespace per campaign)
- **Mouthwash LP (`--mw-*`):** green `#2E8B4F`, red `#EE2727`, yellow `#FFE700`, gold icon `#F5A623`, stock-pill bg `#FFE7DC` / text `#C2410C` / dot `#EA580C`, grey `#F8F8F8`, muted `#A2A8AA`.
- **Tooth Armour LP (`--ta-*`):** pink-accent `#E91E8C`, pink-light `#F5C9D6`, pink-soft `#FCE4EC`, green `#16A34A`, red `#D41C1C`, yellow `#FFC107`, gray-bg `#FAF7F9`, gray-line `#E6E6E3`.
- **Bundle save bar (`--bsb-*`):** acid-lime free-gift header `#BEF803` on `#E8FF9E`; paid tier header `#E3E3E7`.

**Pattern to copy:** one near-invisible neutral system + ONE hero brand color (pink) + per-product-line accent colors. Promotions always = brand pink; success = iOS green; never introduce new ad-hoc colors outside a namespaced LP palette.

---

## 3. Typography

### 3.1 Families (all self-hosted on Shopify CDN except Newsreader)

| Family | Weights loaded | Role | Foundry / license |
|---|---|---|---|
| **Circular** (CircularXX subset) | 300 Book, 400 Regular, 500 Medium | **Workhorse**: body, buttons, nav, inputs, section titles | Lineto, paid. Fallback stack `"Helvetica Neue", Helvetica, Arial, sans-serif` |
| **CircularXX** | 450 Book | occasional variant | Lineto |
| **Pulp** (Pulp Display Medium) | 500 (rendered at `font-weight:300` contexts) | **Display headlines**: hero title, content-on-background title | Pulp Display (Spilled Ink), paid |
| **PP Right Grotesk** | TallBlack 400, SpatialBlack 500, WideBlack 900 | Chunky campaign/sale typography (largely baked into promo images) | Pangram Pangram, paid |
| **Newsreader** | 400 | Editorial/quote accent (Google Fonts, free) | Google Fonts |

- `font-display: swap` on every face. Base font stack on `<body>` and all form controls: `Circular, "Helvetica Neue", Helvetica, Arial, sans-serif`.
- **Root font size:** `html{font-size:16px}`, shrinking to `14px` ≤370px width and `12px` ≤300px — so the whole rem-based UI scales down on tiny phones.

### 3.2 Type scale (measured from components)

| Element | Family / weight | Mobile | ≥768px | ≥991px | Extras |
|---|---|---|---|---|---|
| Hero H1 | Pulp 300 | 2rem | 2rem | **3rem** | `letter-spacing:-.03em; line-height:1.25` |
| Overlay/display H1 (content-on-background) | Pulp 300 | 2rem | — | 3rem | same tracking/leading; `.light` variant = `#E5E5EA` |
| Page/banner H1 | Circular 500 | 2rem | — | 3rem | `line-height:1.25` |
| Section H2 (catalog, sale banner) | Circular 300 | 1.5rem | — | 2rem | `letter-spacing:-.03em; line-height:1.25` |
| PDP split-content H2 | Circular 300 | 1.5rem | — | 2.25rem | same |
| Modal / welcome title | Circular 300 | 1.5rem | — | 2.5rem | `letter-spacing:-.03em` |
| FAQ section title | Circular 300 | 1.1rem | — | 1.5rem | hairline bottom border |
| Product card title | Circular 300 | .75rem | — | 1rem | `line-height:1.5`, dark-1 |
| Nav links (desktop & mobile) | Circular 500 | 1rem | — | 1rem | **`text-transform:uppercase; letter-spacing:.1em; line-height:1`** |
| Secondary top bar | Circular 400 | hidden | — | .75rem | muted, 2.5rem bar |
| Announcement marquee | Circular 400 | .9rem | — | .9rem | white on brand pink, `line-height:1.5` |
| Body copy / descriptions | Circular 400 | .9–1rem | — | 1rem | `line-height:1.5`, color `--mid-1` |
| Hero description | Circular 400 | 1rem (one decl .9rem superseded) | — | 1rem, max-width 23rem | `--mid-1` |
| Small print / legal / disclaimers | Circular 400 | .75rem | — | .75rem | `--mid-1`/`--mid-2`, `line-height:1.5–1.8` |
| Buttons | Circular 500 | 1rem | — | 1rem | `line-height:1` |
| Pills/badges | Circular 500 | .75rem | — | .75rem | `line-height:1` |
| Prices | Circular 300 | inherits | — | — | sale color `#EC008C`; compare-at `.75–1rem` strikethrough `#8E8E93` |

**Typography rules of the system:** light (300) large headlines with tight `-0.03em` tracking and 1.25 leading; medium (500) for interactive elements; 400 for prose at 1.5 leading; generous use of `.75rem/.9rem` microcopy in mid-gray; ALL-CAPS + .1em tracking reserved for navigation only. Big loud type lives in *images* (PP Right Grotesk), not in live text — live text stays quiet and Swiss.

### 3.3 Free alternatives for Nasmeh.si (paid fonts above)
- Circular → **Plus Jakarta Sans** or **Figtree** (Google Fonts; per [Learn UI Design](https://learnui.design/blog/circular-similar-fonts.html) the closest free matches; Montserrat also workable per [iamsteve](https://iamsteve.me/blog/alternatives-to-circular)).
- Pulp Display → **Quicksand** / **Comfortaa** (rounded geometric display feel).
- PP Right Grotesk TallBlack/WideBlack → **Archivo Black**, **Anton**, or **Bebas Neue** (closest free per [FontAlternatives](https://fontalternatives.com/alternatives/right-grotesk/)); **Clash Display** (Fontshare, free) for a more premium cut.
- Newsreader → already free (Google Fonts).

---

## 4. Layout, spacing & grid

- **Global gutter token:** `--padding: 1.25rem` (20px) — used as page padding and card rhythm everywhere.
- **Containers:**
  - `.padding-container` / header / collection / footer: `max-width: calc(1248px + var(--padding)*2)` ≈ **1288px** incl. gutters.
  - `.container` (narrow): **1120px**.
  - Homepage & full-bleed sections: **1440px** cap.
  - Mega-menu content: 1060px. PDP grid area: media `minmax(400px,560px)` + content `minmax(350px,480px)` with **5rem column gap**.
- **Breakpoints (range syntax):** `@media (width >= 768px)` and `@media (width >= 991px)` are the two real breakpoints; mobile-first. Also `<=767px` mobile-only overrides, `<=370px`/`<=300px` root-font shrink, `>=1248px` for the catalog edge case. **Mobile-first, two-breakpoint system: 768 / 991.**
- **Section rhythm:** homepage sections `margin-bottom: 4rem` mobile → **6rem** desktop (hero 5.5rem; footer pushed 4.5rem→8rem). Sale banner internal padding 4.75rem→3.2rem.
- **Collection grid:** 2 columns mobile (`column-gap:.5rem; row-gap:2.5rem`) → wider multi-column ≥768px (`grid-auto-flow:row dense`).
- **Home "catalog" rail:** horizontal scroll-snap strip — `grid-auto-flow:column; grid-auto-columns:minmax(262px,1fr)` (300px on desktop), `gap: var(--padding)`, items fade from `opacity:.3` to `1` when active.
- **Footer nav:** desktop `grid-template-columns:repeat(5,minmax(150px,200px)); gap:4rem`; mobile = accordions.
- **PDP:** mobile = stacked cards; desktop = 2-col grid, left sticky media gallery, right buy-box; description/FAQ panels become bordered cards (`border:1px solid light-3; radius:.5rem`).

---

## 5. Radius, borders, shadows

| Token-ish value | Where |
|---|---|
| `3rem` (full pill) | **all buttons**, pill-button shapes |
| `.5rem` (8px) | **cards, product cards, catalog items, pills, cart items (desktop), image containers** |
| `.25rem` (4px) | inputs, money-back pill, small chips |
| `50px` | burger menu lines |
| `1px solid rgb(var(--light-3))` | the universal hairline — header bottom, card borders, FAQ borders, cart items, mega-menu bottom |
| `1px solid rgb(var(--light-2))` | accordion dividers |
| Card shadow (`UiCard.raised`) | `0 1px 5px rgba(--dark-1,.1), 0 2px 2px rgba(--mid-1,.1)` — very subtle |
| Mega menu | `box-shadow: 0 1.5rem 2rem #d1d1d680` |
| Cart sticky footer | `box-shadow: 0 -5px 10px #6666661a` |
| Modal overlay | `rgba(--mid-1, .8)` — gray, not black |
| Mobile nav overlay | `rgba(--mid-1, .8)` |

Everything is flat, light, hairline-separated; depth is rare and soft. No gradients except promo gradients.

---

## 6. Buttons (`UiButton` + legacy `.hs-btn`)

Fully tokenized (`--button-*` custom props). Anatomy: `display:flex; gap:.5rem; border-radius:3rem; font: Circular 500 1rem/1; padding:0 3rem; height: calc(padding*.75*2 + 1rem)` → default **52px** tall. Transition `.2s ease-in-out` on background/color/border/transform.

**Sizes:** `sm` (.75rem font, 1rem pad) · `md` (1rem/1.5rem) · default (1rem/3rem) · `lg` (1.25rem/2rem) · `xl` (1.5rem/3rem, reduced height ratio). **Widths:** `max-content` default, `full-width`, `half`, `quarter`, `auto`.

**Variants (measured):**

| Variant | Background | Text | Hover |
|---|---|---|---|
| `primary` | `--dark-1` #1C1C1E | white | `--dark-3` #3A3A3C |
| `white` | white + 2px `--light-3` border | `--dark-1` | `rgba(--light-4,.8)` bg |
| `blue` | `--link` #007AFF | white | 70% opacity |
| `negative` | `--error` | white | 70% opacity |
| `positive` | `--success` | white | 70% opacity |
| `redeem` / `club` | **animated rainbow gradient** `linear-gradient(270deg,#ff9cdc,#d298f9,#7ae28d,#59cdc9,#ff9cdc)`, `background-size:200%`, `animation: cycle 5s linear infinite` | white | keeps animating |
| `outline` | transparent, 2px border in bg color | bg color | border swaps to hover color |
| `text` | none, underline, weight 400 | bg color | — |

**States:** `disabled` → `opacity:.5`; `adding` → `opacity:.75`; **`added` → background `#34C759` green** (success flash on ATC). Legacy `.hs-btn-primary` (black bg, hover #2C2C2E, active #48484A, disabled #D1D1D6) and `.hs-btn-primary-alt` (white; **hover lifts `translateY(-.25rem)`** — the one playful motion on buttons) still used in places.

Mobile pattern: primary CTAs go `width:100%` (hero button container max-width 360px).

---

## 7. Pills, badges & stickers

### 7.1 `UiPill` (chips/labels) — radius `.5rem`, font .75rem/500, height ~ calc(.75*1rem*2 + .75rem)
| Variant | Look |
|---|---|
| `information` | white bg, 1px `--light-2` border, `--dark-2` text |
| `promotion` | **brand-pink bg #EC008C, white text** |
| `new` | white bg, **pink text + pink border** |
| `selling-fast` | `#EB001B` red bg, white text |
| `money-back-pill` | `#3BD358` green bg, dark text, **radius .25rem, uppercase**, centered under buy box |
| `negative` / `positive` | error/success bg |
| `club` | animated rainbow gradient (7.5s cycle) |

### 7.2 `ProductBadgeOverlay` (starburst stickers)
- **Image-based badges** (PNG starbursts/stickers), `width:7.5rem`, absolutely positioned in any card corner (`top-left` etc.), `pointer-events:none`, z-index 2. Global defaults exist (`globalProductCardBadge`, `globalProductImageBadge`) plus per-product metafields.
- Sold-out: pill at 40% opacity; variant-level "Sold out" pill overlapping the variant selector.

### 7.3 Stock/urgency chips (LPs)
`--mw-stock-pill-*`: orange-tinted pill (`#FFE7DC` bg, `#C2410C` text) with pulsing `#EA580C` dot.

**Pattern:** promo = pink pill; new = pink outline; urgency = red pill; guarantee = green uppercase pill; decorative = image starburst. Never more than ~1 badge + 1 pill per card.

---

## 8. Cards & product cards

- `UiCard`: white bg, `--mid-1` text, radius .5rem, optional 1px `--light-3` border, optional raised shadow, horizontal/vertical, pill can dock on any edge (half-offset via `--pill-height`).
- **Product card** (`CollectionProductCard`): radius .5rem, white; **media area has `--light-3` (#F2F2F7) backdrop** with the product PNG on top; content centered column, padding 1.5rem/.75rem; title 300-weight; price under it in **pink** with gray strikethrough compare-at; **full-width "Add to cart" primary button** at card bottom (max-width 248px). `double-wide` variant splits into grid with left-aligned text + right button.
- **Hover variant selector:** a vertical swatch rail slides over the card's left edge — `background: rgba(--light-1,.4)` scrim, square 1:1 thumb buttons (`border-radius:5px`, active = **2px black border**, sold-out = grayscale + 50%), "+N remaining" tile in `--light-4`.
- Price component (`UiPrice`): sale pink 300-weight; "from" prefix in `--mid-1` .75rem; compare-at strike `--mid-2`; superscript asterisk for promo terms.

---

## 9. Forms & inputs

- **Input:** 52px tall, radius .25rem, 1px `--light-3` border on white, font .9–1rem; **floating label** (label starts centered, shrinks up on fill — cubic-bezier(.4,0,.2,1) .15s); **focus → border `--success` green**; error state → 2px `--error` bottom border + red message fading in; success → 2px green bottom border. Right-side icon slot in `--mid-3`.
- **Newsletter/footer form:** dark block (`--dark-1` bg, white text); input max-width 366px; submit = arrow button inside input (36px, color animates `--mid-4`→`--dark-1` when valid); success = animated mail icon flying away (`send_mail` keyframes) + check scale-in.
- **Forms container:** max-width 600px, 2-col grid ≥768px, labels .8rem `--mid-1`, grid-gap 1.5rem; checkboxes use `accent-color: --link`.
- Error/success boxes: white bg, `border:1px solid currentColor` in error/success color.

---

## 10. Navigation

- **Header:** white bg, 1px `--light-3` bottom border; height **56px mobile / 64px desktop**; hide-on-scroll (`translateY(-100%)`→0, .35s ease-in-out). Layout: burger (left, mobile) / wordmark / icon cluster right (search, account, cart).
- **Cart icon:** 1.5rem; when items exist a **6px brand-pink dot** appears with `pulsegentle` animation (2.5s infinite, soft box-shadow ring).
- **Announcement marquee:** brand-pink band (`background-pink`), white Circular .9rem, padding .25rem→.5rem; infinite CSS marquee (see §13).
- **Secondary utility bar (desktop only):** `--light-3` bg, 2.5rem tall, .75rem links in `--mid-1`→hover `--dark-1`; includes region selector (flag + text + chevron).
- **Desktop nav links:** uppercase, .1em tracking, 500 weight, padding 0 1.75rem, full-height; chevron rotates 180° on open (`.25s`). Sale link = pink with icon.
- **Mega menu:** full-width dropdown, `--light-4` bg, 3rem vertical padding, hairline bottom border + soft shadow; content grid `grid-auto-flow:column; gap:2.5rem`; column titles 500-weight; list items `--mid-1`→hover `--dark-1`; includes image promo blocks (nav-media-link, 366×240 images). Opens by opacity 0→1 (.3s, .15s delay).
- **Mobile nav:** left drawer `max-width:329px; width:90vw`, `--light-4` chrome + white content, slide `translateX(-100%)→0` (.2s); links 4.1875rem tall, uppercase; drill-down sub-panels slide in from right (`translate(100%)→0`); scrim `rgba(--mid-1,.8)`; burger = 2px lines, radius 50px, morphs to X with staggered transitions.

---

## 11. Footer

- **Newsletter block:** full-width `--dark-1` (#1C1C1E) band, white text; desktop = 3-col grid (250px title / two form columns, gap 93px), title 1.5rem/300.
- **Link columns:** 5-col grid on desktop, accordion-collapse on mobile; titles `--dark-2`; links .9rem `--mid-1`, hover `--dark-1`; social icons 16px inline before some links.
- **Bottom bar:** `--light-3` bg, min-height 2.5rem, .75rem legal links in `--mid-1`, gap 1.5rem.
- Cookie notice: `rgba(--dark-1,.8)` dark strip, white text, underline links, stacked→row buttons.

---

## 12. Modals, overlays & sticky bars

- `UiModal`: positions center/top/bottom (+ `-md`/`-lg` responsive variants); enter/exit via opacity + translate (center: `translate(-50%,-30%)`→`-50%`; bottom sheet: `translate(-50%,100%)`→`-50%`). Dialog widths **360 / 560 / 768 / 991 / 1140px**. Close = circle button (3.1rem, `--mid-1` bg at .8, **backdrop-blur 1.25rem**, white icon).
- Welcome/exit modal: centered text, title 1.5→2.5rem/300, description `--mid-1` lh 1.8 max 560px, full-width CTA max 366px, dismiss = underlined text button.
- Sold-out modal: email capture + inline arrow submit, max 366px.
- `UiStickyBar`: top/bottom bars slide from `translateY(±200%)`→0 (.5s); used for **PDP sticky add-to-cart** (white, shadow `0 -5px 10px #6666661a`) and session-dismissible **sticky info banner** (`--link` blue bg, white .875rem text, underline link, ✕ close, remembers via sessionStorage).
- Overlay pattern: fixed full-screen `--mid-1` at 80% + .35s fade — same for nav & modals.

---

## 13. Carousels & marquees

- **`UiMarquee`:** pure-CSS infinite loop — duplicated flex tracks, `animation: marqueescroll var(--marquee-animation-duration,10s) linear infinite` translating `-100% - gap`; `gap:1rem`; items `.25rem` margin; `.reverse` direction option; pauses unless `.scroll`; fades in on mount. Used for the pink announcement bar and promo strips.
- **Home catalog rail:** native horizontal scroll (`-webkit-overflow-scrolling:touch`), items `opacity:.3→1` when scrolled into center.
- **PDP gallery:** thumbnail strip (3 per view, 1:1 thumbs, .5rem gap, .3s transform); desktop left column can be a long-scroll gallery.
- Hero "banners": absolutely-positioned image strips over hero top/bottom (the FREE GIFT blue band is one such bottom banner image).

---

## 14. Motion & animation spec

Global easing = **`ease-in-out`**, durations .15s (micro) / .2s (buttons, hovers) / .25–.35s (panels, overlays, header) / .5s (sticky bars, catalog fades). Vue route transitions: `fade` .25s, `fast-fade` .15s, `instant-fade` .1s.

| Animation | Keyframes | Duration / use |
|---|---|---|
| `marqueescroll` | translateX 0 → calc(-100% − gap) | **10s linear infinite**, announcement/promo strips |
| `cycle` | background-position-x 0→200% | **5s** (buttons) / **7.5s** (pills) linear infinite — rainbow gradient shimmer on "club/redeem" CTAs |
| `pulsegentle` | scale .95→1 + fading pink ring | **2.5s infinite**, cart-has-items dot |
| `skeleton_pulse` | background-position 0→-135% over a 400% gray gradient | 1.2s infinite, loading skeletons (`#c8c8c880/#e6e6e680`) |
| `spinner` / `spin` | rotate 360° | .8s linear infinite, loaders |
| `send_mail` | mail icon tilts, flies off right, scales down | .75s, newsletter submit success |
| `scale_icon` | pop-in | .75s, success check |
| Hover lift | `translateY(0→-.25rem)` | .2s, white alt buttons |
| Accordion | height JS + opacity .15s | footer/FAQ |
| Catalog item focus | opacity .3→1 | .5s |
| Header hide/show | translateY | .35s |

Motion is restrained and functional — the "loud" lives in color and graphics, not in scroll-jacking or parallax.

---

## 15. Iconography & logo

- **Icons = inline-SVG Vue components** (`IconHismile`, `IconChevronDown`, `IconChevronRightAlt`, `IconSpinner`, `IconTikTok`, `IconClick`…), props `width/height` default **24×24**, `color` default `currentColor` — single-color filled/line glyphs, sized via rem (1rem–1.5rem typical, chevrons .6–.8rem).
- Line details: 2px strokes with rounded caps (burger lines `border-radius:50px`).
- **Region selector uses circular flag SVGs.**
- Payment icons (Visa/MC/PayPal/Afterpay/Klarna/Zip…) rendered in cart via `CartPaymentIcons`; Klarna + Zip widgets present on PDP messaging.
- **Logo:** lowercase "hismile" wordmark (custom geometric sans, single color, works on white or dark); on packaging the wordmark is set **vertically (rotated 90°)** — a signature branding move.
- Rating stars: gold (`--mw-icon-gold #F5A623`) 5-star row with numeric rating (Amazon-review feature block on LPs).

---

## 16. Photography & art direction (verified by downloading assets)

- **Product card images:** 1041×1041 PNG on pure white/`#F2F2F7` tile, **photorealistic 3D packshots**, single product heroed, slight dynamic tilt, soft contact shadow, lots of negative space. Packaging is color-coded per line (V34 = deep purple `#440099`; iD mouthwash = chrome bottle + neon red cap).
- **Packaging design language:** oversized lowercase wordmark rotated 90°; clinical vertical type + hairline rules listing benefits on bottles ("WHITENING / TARGETS GUNK & BUILD-UP / FRESH BREATH / ALCOHOL FREE"); bold color blocking with white type on boxes; circular die-cut stickers/icons. Mix of "clinical lab" and "candy store".
- **Campaign/promo art (hero banners, collection banners):** flat saturated backgrounds (royal blue, brand pink), **huge condensed uppercase display type** (PP Right Grotesk TallBlack) with one word in acid lime `#EBFF00`, **3D claymation-style props** (gift box covered in stickers, chunky question marks, sparkles), Y2K sticker-bomb energy. Bottom overlay band format ~2280×1920 PNG; collection banners 2160×450.
- **Hero media:** full-bleed autoplay **MP4 video**, separate mobile (414×272) and desktop (760×640) crops, `object-fit:cover`; content sits left (desktop 60/40 split) or below (mobile), text centered mobile / left desktop.
- **Content-on-background sections:** fixed-height media panels (`height:calc(100vh - 3rem)`, min 640px / max 700px) with optional black-60% gradient overlay, 9-position content grid, Pulp display title 2→3rem.
- OG/social image: 1200×628 brand landscape.

**For Nasmeh.si:** budget for (a) clean white packshot renders per SKU, (b) 1–2 loud campaign banner sets per promo with chunky type + 3D props, (c) short looping hero videos per hero product. Keep these three art buckets stylistically separate, exactly as Hismile does.

---

## 17. Tone of voice (from extracted copy)

- **Playful, direct, Gen-Z clinical.** Short declaratives + imperative CTAs: "Shop now", "Order NOW", "Wipe away stains with Tooth Wipes", "Tough teeth use Tooth Armour".
- Casual invented/clinical mashups: "The viral gunk mouthwash", "Target the gunk your toothbrush may be leaving behind", "Supercharge your routine with the ingredients your teeth and mouth love".
- Community framing: "Shop our best sellers" / "Explore our range of fan-favourites".
- Science-credibility sprinkled in: "Engineered with hydroxyapatite and xylitol to lift the day's build-up off your teeth", "industry leading colour correcting technology".
- Urgency in caps: "NEW Tooth Wipes, available NOW".
- Australian/British spelling ("colour", "whitening") — **Nasmeh.si should map this to Slovenian equivalents of the same registers: kratki imperativi, igrive besede, en sam "znanstveni" argument na trditev.**
- Promo mechanics language: "FREE Mystery Gift with any purchase" (sitewide `global_free_gift=true`), "Save on select products in our available bundles".
- SEO titles follow `Shop {Product} | Hismile™`.

---

## 18. Page anatomy cheat-sheets

**Home:** pink marquee bar → header → hero (video + H1 + full-width CTA, optional top/bottom image banners) → "best sellers" horizontal product rail (title left on desktop) → full-width pink sale banner (H2 + underlined link) → showcase media/content-on-background → footer. Sticky bottom info banner (dismissible).
**Collection:** banner image (240/300px, overlaid H1 2→3rem/500) → white options bar (3.1rem, native-select sort, chevron icon) → 2-col→multi-col product grid → light-3 footer band with clamped SEO text + "read more" underline button.
**PDP:** sticky-ATC top/bottom bar; mobile = white stacked cards (title+pills → gallery → price/ATC → description accordions); desktop = 2-col grid (sticky media | buy box), description & FAQ as bordered cards, upsell rail, split-content 50/50 image-text blocks (2.25rem titles), related catalog.
**Cart:** page (not drawer) — item rows (grid 3→4 cols, bordered cards on desktop, pink price), quantity via invisible select over underlined text, sticky bottom checkout bar with upsell slot (max 26rem) + payment icons, full-width black checkout button.

---

## 19. Implementation starter tokens for Nasmeh.si (drop-in CSS)

```css
:root {
  /* neutrals (iOS ramp) */
  --black: 0,0,0;  --white: 255,255,255;
  --dark-1: 28,28,30;  --dark-2: 44,44,46;  --dark-3: 58,58,60;  --dark-4: 72,72,74;
  --mid-1: 99,99,102;  --mid-2: 142,142,147; --mid-3: 174,174,178; --mid-4: 199,199,204;
  --light-1: 209,209,214; --light-2: 229,229,234; --light-3: 242,242,247; --light-4: 250,250,252;
  /* brand (Nasmeh should pick ONE hero color; Hismile's is #EC008C) */
  --brand: 236,0,140; --sale: 236,0,140;
  --link: 0,122,255; --success: 52,199,89; --error: 221,60,95; --warning: 255,170,113;
  /* metrics */
  --padding: 1.25rem;              /* global gutter */
  --radius-btn: 3rem; --radius-card: .5rem; --radius-input: .25rem;
  --container-wide: calc(1248px + var(--padding)*2);
  --container-narrow: 1120px; --container-bleed: 1440px;
  --hairline: 1px solid rgb(var(--light-3));
  --ease: ease-in-out;
}
html { font-size: 16px; }
@media (width <= 370px) { html { font-size: 14px; } }
body { background: rgb(var(--light-4)); color: rgb(var(--mid-1));
       font: 400 1rem/1.5 "Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif; }
/* H1/H2: 300 weight, -.03em, 1.25 · buttons: 500 1rem/1 pill 52px · nav: 500 uppercase .1em */
```

Component recipes to replicate verbatim-in-spirit: tokenized `UiButton` (§6), pill variants (§7), product card with hover swatch rail + pink price + full-width ATC (§8), floating-label input with green focus (§9), hide-on-scroll header + pink marquee + uppercase nav (§10), bottom-sheet modals with blurred circle close (§12), 10s CSS marquee + rainbow `cycle` CTA (§14).

---

## 20. Evidence & sources

- Live extraction (2026-09-09): `https://hismileteeth.com/` HTML shell (Shopify, `window.global_theme="toothWipesTheme"`, AUD default, `localization=AU`), `theme-E5itcjEW.css` (all `:root` tokens, fonts, `.hs-btn`), `MainView-MAk7YG19.css` (header/nav/footer/cookie/welcome-modal), `UiButton-CRpBoieG.css`, `UiPill-DWHzrbeh.css`, `UiCard-CL2edoA1.css`, `UiPrice-BAcTneN-.css`, `UiMarquee-p9GPFjX1.css`, `UiStickyBar-9mb_W-BS.css`, `UiAccordion-FTUA0vFR.css`, `UiModal-ZeNJ7BCm.css`, `UiInput-DECKclyV.css`, `CollectionProductCard-BBDBe4JJ.css`, `PageSectionHero-DPWBpPMz.css`, `PageSectionCatalog-BUBG_7fa.css`, `PageSectionContentOnBackground-BR4JenpL.css`, `PageSectionBanner-BOGOu5kz.css`, `HomeDefault-D23zVx4y.css/.js` (home copy: "Shop our best sellers", sale banner config), `theme-CwMsJ38v.js` (theme-setting defaults: hero videos/copy, marqueeData, per-theme variants), `BasicProductTemplate-udpZumN_.css` (PDP), `CartDefault-DczdpYLF.css` (cart).
- Asset inspection: `Collection-V34Strips-Single.png` (1041² purple packshot), `Collection-Stain_Mouthwash-Single.png` (chrome/red bottle), `Hero_Banner_-_FREE_Mystery_Gift_-_D.png` (2280×1920 blue band, lime/white chunky type, 3D gift).
- Font licensing/alternatives: [Learn UI Design — Circular alternatives](https://learnui.design/blog/circular-similar-fonts.html), [iamsteve — Alternatives to Circular](https://iamsteve.me/blog/alternatives-to-circular), [FontAlternatives — Right Grotesk](https://fontalternatives.com/alternatives/right-grotesk/), [Pangram Pangram](https://pangrampangram.com/blogs/journal/alternatives-to-google-fonts-part-2).
- Not verified (client-rendered only, no SSR): exact live order/visibility of some home sections at a given moment, Klaviyo popup creative, checkout-page styling (Shopify checkout is off-theme).
