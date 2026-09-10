# Nasmeh.si — Architecture & Agent Guide

> Canonical architecture document for all agents working on this repo. The decisions below are **decided** — document your code against them, do not relitigate them. Feature-level truth lives in `docs/NASMEH_FEATURES.md`; research basis in `docs/research/01–07`.

## 1. Project overview

Nasmeh.si is a Slovenian/EU e-commerce store selling teeth-whitening products (3 hero SKUs + 1 routine bundle at launch), inspired by — never copied from — hismileteeth.com. Single market, single currency (EUR, VAT-inclusive prices, SI VAT 22 %), Slovenian-first UI.

Strategy in one paragraph: replicate HiSmile's *merchandising* (promo playbook, design-token system, conversion patterns) while beating their documented weaknesses: client-only rendering (their storefront is an empty `<div id="app">` — no SSR, empty meta descriptions, JS-injected JSON-LD), zero on-site reviews, no site search, and a cosmetic cookie bar. We win on SSR SEO, real reviews, real GDPR consent, and EU/Omnibus compliance as first-class features.

Hard rules (from the master spec, §15):
- **Never copy** HiSmile product names (V34, PAP+, iD Stain…), copy lines, imagery, or brand identity.
- All displayed prices are VAT-inclusive in EUR.
- Slovenian is the primary UI language; English is a `[P2]` addition.
- Marketing opt-ins are **never pre-checked**; cookie consent is a real CMP with a server-side consent log.
- Phase discipline: `[P1-core]` launch-blocking, `[P2-growth]` 3–6 months, `[P3-later]` 6+ months. Build nothing from a later phase early.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router, TypeScript, **SSR**) | One app serves all three surfaces (storefront, admin, API). SSR chosen explicitly to beat HiSmile's client-only-SEO weakness: content, meta, JSON-LD, reviews all in initial HTML (research 07 §7, §9.8). |
| Language | TypeScript (strict) | Single language across storefront, admin, API, tests. |
| Database | **PostgreSQL 16** | Relational order/pricing data, JSONB for HiSmile-style custom fields (metafields are their #1 content pattern, 07 §9.4). |
| ORM | **Prisma** (schema-first) | Migrations via `prisma migrate deploy` at container start; type-safe queries in Server Components/Actions. |
| Auth | **Auth.js v5** | Credentials provider (email + password, bcrypt) for **both** customers and staff, one `User` model with `role: CUSTOMER \| OWNER \| MANAGER \| SUPPORT \| FULFILLMENT`. Staff sign in with a mandatory TOTP second factor (`/prijava/2fa`) and hold 12-hour sessions. OAuth (Google/Facebook) is phase 2 — the login UI is laid out social-first per the HiSmile pattern (05 §3.1), so OAuth slots in without redesign. |
| Styling | **Tailwind CSS v4** + CSS custom properties | Tokens lifted from research 06 §19: RGB-triplet custom properties consumed as `rgb(var(--token))`, iOS-gray neutral ramp, ONE hero brand color, pill buttons (`3rem` radius), 20px gutter (`--padding: 1.25rem`), mobile-first breakpoints **768 / 991**. |
| Payments | **Stripe** (cards w/ SCA+3DS2, Apple Pay, Google Pay, Klarna) + **PayPal** | Covers the spec's SI/EU payment matrix (§8.3). Webhooks — not client redirects — drive order status transitions. |
| Email | **Nodemailer over SMTP**, MJML/React-email templates | Transactional mail (order confirmation, shipped, password reset, …) at P1. ESP integration (Klaviyo/Brevo-class) deliberately deferred. |
| Media | Local volumes at P1: `/catalog-uploads` for product and collection media (public, served by the `/uploads/{products\|collections}/…` route), `/review-uploads` for moderated reviews, `/support-uploads` for ticket photos; `/public/uploads` holds committed placeholders only | Runtime uploads never land in `public/`: the production server inventories that directory once at startup, so a file added later would not be served. Customer photos use authorized routes so private uploads cannot bypass access checks through static files. S3-compatible storage is an optional later swap behind the same upload interface. |
| Validation | **zod** | At every input boundary: Server Actions, Route Handlers, webhooks, env parsing. |
| Testing | **Vitest** (unit, incl. promo engine) + **Playwright** (e2e: browse→cart→checkout, admin CRUD) | Promo math must be provably correct; checkout is the revenue path. |
| Packaging | **Docker** multi-stage (`node:20-alpine`, non-root, Next.js standalone output, healthcheck) + **docker-compose** | Target host is a **home server already running other containers** behind a reverse proxy. |

## 3. Directory layout

```
/
├── app/                    # Next.js App Router — ALL routes for all three surfaces
│   ├── (storefront)/       # public storefront: /, /trgovina, /izdelek/[slug], /cart, /checkout, /racun, /kontakt, /sledi, /odstop-od-pogodbe, /reklamacije, /prijava-nezelenega-ucinka, token routes (/potrdi*, /odjava-zaloga) …
│   ├── admin/              # admin dashboard (/admin/...) — staff roles; (shell) group = 2FA gate + sidebar, 2fa/ = enrolment
│   └── api/                # Route Handlers: /api/webhooks/stripe, /api/webhooks/paypal, public JSON endpoints
├── components/
│   ├── storefront/         # Ui* primitives (button, pill, card, marquee, modal…), sections, product card
│   └── admin/              # admin tables, forms, editors
├── lib/
│   ├── db.ts               # Prisma client singleton
│   ├── cart/               # guest cookie cart, DB cart, merge-on-login
│   ├── promo/              # promo engine — PURE functions (see §7)
│   ├── payments/           # Stripe + PayPal clients, webhook handlers
│   ├── pricing.ts          # VAT math, Omnibus 30-day-low lookups
│   ├── price-history.ts    # the ONLY write path for Variant prices (appends PriceHistory)
│   ├── inventory/          # stock.ts: the ONLY write path for stock increases (arms restock alerts); restock.ts operator entry
│   ├── orders/             # transitions.ts (paid/shipped/delivered state machine), confirmation + shipped email delivery
│   ├── jobs/               # streams of POST /api/jobs/daily (review requests, restock alerts)
│   ├── support/            # tickets, topic routing, private attachments, ticket-mail delivery
│   ├── back-in-stock/      # signed one-click unsubscribe tokens
│   ├── auth.ts             # Auth.js config
│   ├── admin/              # permission matrix, access gate (requirePermission), TOTP, pre-auth, dashboard/catalog/coupon/review queries, managed media
│   ├── koda-code.ts        # coupon code schema shared by /koda, the cart and the admin form (no server imports)
│   └── copy/               # Slovenian UI copy files (see §7)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts             # 3 hero SKUs + bundle, admin user, settings, menus, demo data
├── public/uploads/         # committed placeholders only (the server lists public/ once at startup)
├── catalog-uploads/        # product + collection media volume; public /uploads/{products|collections} route
├── review-uploads/         # private review-photo volume; authorized /uploads/reviews route
├── support-uploads/        # private ticket photos; authorized /api/support/attachments route
├── tests/
│   ├── unit/               # Vitest
│   └── e2e/                # Playwright
├── docs/                   # research dossiers 01–07, NASMEH_FEATURES.md, HISMILE_FEATURES.md, plans
├── Dockerfile
├── docker-compose.yml
└── AGENTS.md               # this file
```

Route ownership: storefront lives at the root, the entire admin is under `/admin/*` and gated by the Auth.js middleware (staff roles) plus `requirePermission` on every page and action, machine-to-machine traffic under `/api/*`.

## 4. Data model overview (core Prisma models)

Schema-first in `prisma/schema.prisma`; evolve only via migrations.

| Model | Purpose |
|---|---|
| **User** | Customers and staff in one table, distinguished by `role (CUSTOMER \| OWNER \| MANAGER \| SUPPORT \| FULFILLMENT)`; credentials auth (bcrypt hash) at P1, OAuth accounts linked later; staff carry the encrypted TOTP secret, recovery-code hashes and the replay guard. Holds marketing-consent status/history (GDPR). |
| **Product** | A sellable/catalog entity: title, slug, status (draft/active/archived), rich description, PDP content fields (accordions, FAQ, education sections), badges/USP chips, SEO fields, JSON `customFields` (the HiSmile metafield pattern), visibility flags (catalog/search/**hidden deal-SKU**), sold-out behaviour (`NOTIFY` keeps the card and capture, `HIDE` drops a fully sold-out product from lists and the sitemap while the PDP answers with noindex), Klarna eligibility. |
| **Variant** | A purchasable SKU of a product: SKU code, price, compareAtPrice, cost, barcode, weight, stock, `maxCartQuantity` (default 5; bundles/gifts 1), backorder flag + note (purchasable at zero stock; deduction may go negative for such variants only). Every price change appends a **PriceHistory** row (see §5). |
| **Collection** | Manual (ordered) or rules-based product groupings with desktop and mobile banner images, hide-banner-text, SEO fields, noindex toggle. Powers `/trgovina` tabs and merchandising. |
| **Order** | Order head: `NS-`-prefixed number, status (`pending → paid → processing → shipped → delivered`; `cancelled`; `refunded`), totals + VAT breakdown snapshot, customer/guest email, addresses (snapshotted), PSP references, tracking number/carrier, timeline/activity log. |
| **OrderItem** | Order line: variant snapshot (title, SKU, unit price, VAT), quantity, discount/gift label, line properties (`_free_gift`, bundle component expansion for fulfillment). |
| **Coupon** | Discount codes: type (% / fixed / free shipping / BXGY), amount, usage limits (total + per customer), date ranges, min. spend, eligibility/exclusions, **no stacking** by default. Feeds `/koda/{CODE}` auto-apply links. |
| **Promotion / FreeGiftRule** | Code-less campaign rules: automatic discounts and the GWP engine — active flag, trigger (any cart / min spend / products), gift SKU pool with weights, max 1, auto-add/auto-remove, display copy. `[P2]` but modeled at P1. |
| **Bundle** | Fixed bundle definitions: component variants + quantities, bundle price; order lines expand components for fulfillment and inventory deduction. BYO wizard is `[P3]`. |
| **Review** | Star rating, title, text, photos (≤4), verified-buyer link to OrderItem, moderation status (pending/published/rejected), merchant reply. Feeds AggregateRating JSON-LD. |
| **Cart** | Persisted cart for logged-in users; guest carts live in a **signed cookie** and merge into this table on login (§5). Lines mirror OrderItem shape. |
| **Address** | Customer address book (multiple, one default) — Slovenian 4-digit postal codes, EU country list. Order addresses are snapshotted onto the Order, not referenced. |
| **Setting** | Key-value store config: shipping zones/rates/free-shipping threshold, VAT config, pixel/GTM IDs, marquee text, invoice/company data, consent config. Everything the storefront treats as "config" is data, not code (research 07 §9.3–9.5). |
| **ContentPage** | CMS pages: title, slug, rich body, template (default/legal-with-TOC/contact/landing), SEO fields. Powers legal and other approved content pages. Generic CMS capacity does not require a Help Centre, About Us, Explore or standalone Delivery page; these are outside the current page scope. |
| **Ticket** | Durable support request with a receipt reference, topic/reason, reporter, checked order context and privacy acknowledgment; private attachments and independent retryable staff/customer email-delivery rows. |
| **Menu** | Navigation builder: header (incl. mega-menu featured cards + colored sale link), utility bar, footer columns, mobile drawer. |

Supporting tables not listed: `PriceHistory`, `ConsentLog`, `OrderNote` (internal and customer-visible notes), `Refund` (one row per operator refund; the row id is the provider idempotency key), email/template tables, sessions — add them as the spec demands, with migrations.

## 5. Key architectural decisions — and WHY

1. **SSR everywhere content matters.** HiSmile ships `<div id="app">` and forces Google to execute JS for content and JSON-LD; their meta descriptions are mostly empty. We server-render product copy, prices, reviews, and JSON-LD (Product/Offer/AggregateRating, FAQPage, BreadcrumbList) so organic search is a structural win, not a hope. Server Components are the default (§7).
2. **All pricing/discount/gift logic is server-side.** Prices, coupon application, bundle math, free-gift auto-add, and shipping thresholds are computed on the server from the database. The client sends *intent* (variant id, quantity, coupon code) — **never prices**. This kills an entire class of tampering attacks and keeps one source of truth for cart totals.
3. **Promo engine = pure functions.** `lib/promo` is a pure `(cart, coupons, rules) → pricedCart` pipeline with no I/O. It is unit-testable in Vitest without a database, reusable across cart page, checkout, and order creation, and the same code prices the confirmation the customer sees and the order we persist.
4. **Guest cart via signed cookie + merge-on-login.** Guests get a full cart with zero accounts (guest checkout is the default per spec §8.1). The cookie is HMAC-signed so quantities/ids can't be forged to reference nonexistent variants. On login/registration the guest cart merges into the user's DB cart (maxCartQuantity rules re-applied), so no shopper ever loses a cart to signing in.
5. **Webhooks are the source of truth for payment status.** Order status transitions (`pending → paid`, refunds, cancellations) are driven by verified Stripe/PayPal webhook events, never by the browser returning from a redirect. Redirects are UX; webhooks are state. Webhook handlers must be idempotent (PSPs retry) and signature-verified.
6. **PriceHistory table for Omnibus compliance.** EU Omnibus (ZVPot) requires that any announced reduction display the **lowest price in the previous ≥30 days**. Every variant price change appends an immutable PriceHistory row; the "Najnižja cena v zadnjih 30 dneh: €X" line is computed from it automatically. Never log prices ad hoc — the table is the compliance record.
7. **One Next.js app, three surfaces.** Storefront, admin, and API share the Prisma client, promo engine, and auth. No separate backend service to deploy on a home server; role-gating happens in middleware + server-side checks on every admin action (never rely on hiding UI).
8. **Config-driven merchandising.** Marquee, badges, hero slot, thresholds, pixel IDs, shipping rates are `Setting`/admin data. HiSmile's whole promo engine is content, not code (07 §9.3) — operators must be able to launch a campaign without a deploy.
9. **Transactional email only at P1.** SMTP + MJML/React-email covers order/shipping/auth emails. ESP marketing flows (welcome series, abandoned cart) are deliberately deferred; the data model (consent, customer) is built so the ESP plugs in later.
10. **Delivery information in checkout.** Per the user's 2026-09-09 scope correction, delivery methods, prices, estimates and destination eligibility are handled in checkout using shipping settings. Do not build a separate `/dostava` page. Existing cart/PDP shipping summaries and the separately planned public order-tracking page remain in scope.
11. **Shopping-focused navigation and page scope.** Per the user's 2026-09-09 screenshot direction, use promotion/account rows, a shop mega-menu with product links and two Nasmeh featured cards, and a highlighted bundles link. Remove Help Centre, About Us and Explore pages/links; keep contact, tracking and legal links in the footer, plus the account and existing support/ticket flows. Preserve product copy, PDP FAQs and Nasmeh's own teal tokens; the screenshot is a layout reference, not permission to copy branding or assets. Legacy URLs redirect: `/pomoc` → `/kontakt`, `/o-nas` and `/razisli` → `/`, `/dostava` → `/checkout`, `/paketi` → `/trgovina?kolekcija=paketi`. Phase 6 step 2 delivered this simplification (2026-09-09).
12. **Sessions are issued at sign-in only.** The Auth.js middleware response never carries `Set-Cookie` (`middleware.ts` strips it): its sliding refresh raced sign-out, because link prefetches still in flight answered with a fresh session cookie after the sign-out had cleared it (Phase 7 step 1 finding). JWTs are validated against the database on every request (`sessionVersion`, role, 2FA state) and expire at their `maxAge`: 30 days for customers, 12 hours for staff.

### Design-token decision (TBD — with recommendation)

We adopt HiSmile's token *system* verbatim (RGB-triplet custom properties, iOS-gray neutral ramp, hairline borders, 3rem pill buttons, 20px gutters, 768/991 breakpoints — drop-in CSS in research 06 §19) but **not** their color: their hero pink `#EC008C` is brand identity and must not be copied.

- **TBD:** our single hero brand color (`--brand` / `--sale`).
- **Recommendation:** a mint/teal green (e.g. `#00A88F`) — reads "oral freshness" and "clean/clinical", is unmistakably different from HiSmile pink on the same neutral ramp, and keeps the system's rule that promotions/success/link semantics stay in their existing functional tokens. Alternatives considered: deep dental blue (too close to `--link` iOS blue), violet (too close to V34 `#440099`). Decide before theming components; until then keep `--brand` behind the token, never hardcode a hex in components.

## 6. Docker & deployment (home server)

Target host: a home server that already runs other containers behind its own reverse proxy (Traefik/nginx). The compose file is built to drop into that, not to own the machine.

### Build & run

```bash
docker compose build
docker compose up -d                 # app + db
docker compose --profile tools up -d # also adminer (DB UI) on demand
```

- **Dockerfile:** multi-stage on `node:20-alpine` → deps → build → slim runner with Next.js **standalone output** (`output: "standalone"`), **non-root** user, `HEALTHCHECK` hitting `/api/health`.
- **Container start:** the entrypoint first moves generated legacy review photos out of `public/uploads/reviews` into private `review-uploads`, then runs `npx prisma migrate deploy` and `node server.js`. The media guard verifies durable matching copies before removing public files and refuses startup on collisions, symlinks or unexpected files; investigate preserved files rather than bypassing the guard. Migrations are applied automatically on every deploy; never run `migrate dev` against the deployed database.
- **Services:** `app` (this repo) + `db` (`postgres:16-alpine`, named volume `pgdata`) + optional `adminer` (profile `tools`). All services `restart: unless-stopped`.
- **Ports:** nothing is hardcoded. `app` publishes `${PORT:-3000}:3000` — override `PORT` in `.env` so it never collides with other containers on the host. `db` is **not** published to the host by default (reachable on the internal network; use the adminer profile for inspection).
- **Reverse proxy:** the app serves plain HTTP on its port and expects TLS termination at the host's existing proxy. Optional: attach `app` to an **external docker network** (e.g. `proxy`, `docker network create proxy` once on the host) by uncommenting the `networks:` block in compose, and point Traefik/nginx at `app:3000`. Set `NEXT_PUBLIC_SITE_URL` to the public origin so auth callbacks, sitemaps, and email links are absolute and correct.
- **Resource limits:** document/keep `deploy.resources.limits` in compose (suggested: app 1 CPU / 512M, db 1 CPU / 512M) so the store can't starve neighboring containers.

### Environment variables

| Var | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://…` — compose wires it to the `db` service |
| `PORT` | Published host port, default **3000** |
| `AUTH_SECRET` | Auth.js session secret (required) |
| `AUTH_URL` / `NEXT_PUBLIC_SITE_URL` | Public origin, e.g. `https://nasmeh.si` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe; webhook endpoint `/api/webhooks/stripe` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | PayPal; webhook `/api/webhooks/paypal` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Transactional mail |
| `JOBS_SECRET` | Dedicated Bearer secret for `POST /api/jobs/daily`; the host scheduler invokes it once a day for the five delivery streams: order-confirmation retries, shipped-email retries, review requests, restock alerts and ticket-email retries. Never expose it to the browser. |
| `NEXT_PUBLIC_*` | Anything the browser needs (site URL, Stripe publishable key, GTM ID) — **never** put secrets behind `NEXT_PUBLIC_` |

Secrets live in the host's `.env` (gitignored). No secret is ever baked into the image.

### Backups (postgres volume)

```bash
# backup — run on the host, cron it
docker compose exec -T db pg_dump -U postgres nasmeh | gzip > backups/nasmeh-$(date +%F).sql.gz

# restore
gunzip -c backups/nasmeh-2026-09-09.sql.gz | docker compose exec -T db psql -U postgres nasmeh
```

Also back up all four media volumes with `tar`: `/app/catalog-uploads` (product and collection media), `/app/public/uploads` (placeholders), `/app/review-uploads` (reviews) and `/app/support-uploads` (ticket photos). Restore them alongside the database; never restore private customer files into `public`. Daily host-level cron is sufficient at our scale.

## 7. Development workflow

```bash
npm run dev            # Next.js dev server (uses local DATABASE_URL, e.g. compose db)
npm run build          # production build
npm run start          # serve production build
npm run lint           # eslint + tsc --noEmit
npm run test           # Vitest unit tests (incl. lib/promo)
npm run test:e2e       # Playwright: browse→cart→checkout, admin CRUD
npm run prisma:migrate # prisma migrate dev (local schema evolution)
npm run prisma:studio  # Prisma Studio data browser
npm run db:seed        # seed 3 hero SKUs + bundle, admin user, settings, menus
```

Workflow rules:
- New/changed models → `npm run prisma:migrate` locally, commit the migration; deploys apply it via `migrate deploy`.
- Seed data mirrors the launch catalog (spec §2.1): strips €34.99, mouthwash €19.99, serum €19.99, routine bundle, plus an `ADMIN` user and baseline `Setting` rows.
- Promo engine changes are **not done** until Vitest coverage exists for the new rule.
- Before merging: `lint`, `test`, `test:e2e` green, and a production `docker compose build` succeeds.

## 8. Coding conventions for agents

1. **Server Components by default.** A component gets `"use client"` only when it genuinely needs interactivity (state, effects, event handlers, browser APIs). Data fetching happens in Server Components/Route Handlers via Prisma; mutations via Server Actions.
2. **zod at every input boundary.** Validate and narrow all external input: Server Action payloads, Route Handler bodies, webhook payloads, search params, and env vars (fail fast at boot on malformed env).
3. **Never trust the client with money.** Client sends variant id + quantity + coupon code. Prices, discounts, gift rules, shipping, and VAT are always recomputed server-side. If a price arrives from the browser, that's a bug.
4. **Promo engine purity.** `lib/promo` takes plain typed inputs and returns a priced cart; no DB, no fetch, no clock (pass `now` in). Deterministic and fully unit-tested.
5. **Slovenian copy lives in copy files.** No hardcoded Slovenian strings inside components. UI text is imported from `lib/copy/` (keyed modules per surface) so the English `[P2]` version is an added file, not a refactor.
6. **Design tokens, not hex codes.** Components consume `rgb(var(--token))` / Tailwind token utilities. Never introduce ad-hoc colors outside a namespaced palette (research 06 §2.4 rule); radii are `--radius-btn: 3rem` / `--radius-card: .5rem` / `--radius-input: .25rem`.
7. **Auth checks server-side, always.** Hiding an admin link in UI is not security. Every `/admin` page and Server Action calls `requirePermission(<permission>)` from `lib/admin/access.ts` (staff role, completed 2FA, matrix in `lib/admin/permissions.ts`); Route Handlers that serve private data re-check the session the same way. Each admin step ships a direct action-call unit test that proves every disallowed role is refused.
8. **Webhooks: verify, then be idempotent.** Verify signatures before parsing; store processed event ids; handlers must be safe to receive twice.
9. **Price changes go through the price-history path.** Any code that updates `Variant.price` must append `PriceHistory` in the same transaction (use a shared helper, don't hand-roll per call site).
10. **VAT-inclusive display, always.** Money is stored as integer cents; formatting/VAT breakdown ("vključen DDV 22 %: €X") goes through `lib/pricing` helpers — never format currency inline.
11. **Accessibility and SSR are features.** Semantic landmarks, descriptive alt text, keyboard-navigable menus/modals, content in initial HTML. We're beating HiSmile on exactly these axes — don't regress them.
12. **Copy patterns, never assets.** Mechanics from the research dossiers are fair game; HiSmile names, copy lines, imagery, and the pink identity are not.
14. **Refunds go through `lib/orders/refunds.ts`.** Operator refunds and paid-order cancellations create a `Refund` row first, move the money through the provider abstraction (`PaymentProvider.refund`, keyed by the row id so a retry cannot pay twice), then apply the local state and restock through the stock helper; webhook handlers only reconcile provider-originated refunds (Stripe amounts are cumulative, PayPal refund ids already recorded are skipped). No other code raises `Order.refundedCents`.
13. **Stock increases go through the stock helper.** Any code that raises `Variant.stock` calls `setVariantStockInTx` / `adjustVariantStockInTx` from `lib/inventory/stock.ts` inside the caller's transaction: the helper locks the row and arms back-in-stock alerts on a 0 → N transition in the same transaction; sending happens post-commit (`lib/inventory/restock.ts`) with the daily job as the retry path. `deductOrderInventory` (paid orders) stays the only decrement path. Seeds and tests use the helper too; a hand-written `stock` update is a bug.
15. **Catalog media go through `lib/admin/media.ts`.** Every upload is decoded and re-encoded to WebP, written under `catalog-uploads/<owner>/<ownerId>/` with a random name and served by `app/uploads/[owner]/[ownerId]/[filename]/route.ts`; deleting a `MediaImage` row or a banner removes its file. Nothing writes into `public/` at runtime (the standalone server copies that directory at start and lists it once).

---

*Sources: `docs/NASMEH_FEATURES.md` (master spec, phase tags), `docs/research/06-design-system.md` (tokens, §19 drop-in CSS), `docs/research/07-tech-stack.md` (HiSmile platform analysis, §8–9 implications).*
