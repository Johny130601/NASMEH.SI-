/**
 * Idempotent seed (AGENTS §7): mirrors the launch catalog (spec §2.1).
 * Everything upserts by unique keys — safe to run repeatedly.
 * Initial PriceHistory rows are appended only when a variant has none.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  changeVariantPriceInTx,
  recordInitialPriceInTx,
} from "../lib/price-history";
import { setVariantStockInTx } from "../lib/inventory/stock";
import { LEGAL_PAGES } from "./seed-legal";
import { PDP_CONTENT } from "./seed-pdp";
import { DEFAULT_CONTACT_SETTINGS } from "../lib/support/settings";

// tsx does not read .env (the Prisma CLI does). Load it for direct
// `npm run db:seed` runs without overriding values exported in the shell.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: Prisma reports the missing DATABASE_URL below.
  }
}

const prisma = new PrismaClient();

const VAT_RATE_PERCENT = 22;
const FREE_SHIPPING_THRESHOLD_CENTS = 4500; // €45 (spec §7.1)

// Badge styles are admin-data-driven: outline | solid | grey | warning | promo
const PRODUCTS = [
  {
    title: "Belilni trakci za zobe (14 uporab)",
    slug: "belilni-trakci-za-zobe",
    description:
      "Naš vodilni izdelek: belilni trakci za vidno svetlejši nasmeh v 14 dneh. Nežni do sklenine, brez peroksida.",
    sku: "NAS-TRK-14",
    priceCents: 3499,
    compareAtPriceCents: null as number | null,
    stock: 100,
    maxCartQuantity: 5,
    badges: [{ label: "USPEŠNICA", style: "solid" }],
  },
  {
    title: "Ustna voda za globinsko čiščenje",
    slug: "ustna-voda-globinsko-ciscenje",
    description:
      "Ustna voda za vsakodnevno rutino — odstrani nečistoče in osveži dih. Vidni rezultat že po prvi uporabi.",
    sku: "NAS-UST-500",
    priceCents: 1999,
    compareAtPriceCents: null as number | null,
    stock: 100,
    maxCartQuantity: 5,
    badges: [{ label: "NOVO", style: "outline" }],
  },
  {
    title: "Serum korektor barve zob",
    slug: "serum-korektor-barve-zob",
    description:
      "Korektor za zobe: serum takoj optično nevtralizira rumene tone. Za posebne priložnosti in vsakdan.",
    sku: "NAS-SER-30",
    priceCents: 1999,
    compareAtPriceCents: 2499 as number | null, // Omnibus demo (scripted history below)
    stock: 100,
    maxCartQuantity: 5,
    badges: [{ label: "AKCIJA", style: "promo" }],
  },
  {
    title: "Paket popolna rutina",
    slug: "paket-popolna-rutina",
    description:
      "Celotna rutina v enem paketu: trakci, ustna voda in serum. Najboljša vrednost — brezplačna dostava vključena.",
    sku: "NAS-PAK-RUTINA",
    priceCents: 4999,
    compareAtPriceCents: null as number | null,
    stock: 100,
    maxCartQuantity: 1, // bundles: 1 (AGENTS §4)
    badges: [{ label: "PRIHRANI", style: "promo" }],
  },
  {
    // Phase 2 documented choice: 5th demo product, sold out → Obvestite me
    title: "Belilni trakci — potovalno pakiranje (7 uporab)",
    slug: "belilni-trakci-potovalni-7",
    description:
      "Potovalno pakiranje belilnih trakov: 7 uporab za na pot. Trenutno razprodano.",
    sku: "NAS-TRK-07",
    priceCents: 1999,
    compareAtPriceCents: null as number | null,
    stock: 0,
    maxCartQuantity: 5,
    badges: [
      { label: "NOVO", style: "outline" },
      { label: "RAZPRODANO", style: "grey" },
    ],
  },
] as const;

async function seedCatalog() {
  const variantIdBySku = new Map<string, string>();

  for (const item of PRODUCTS) {
    const pdp = PDP_CONTENT[item.slug];
    const contentData = {
      customFields: pdp.customFields as object,
      accordions: pdp.accordions as object,
      faq: pdp.faq as object[],
      education: pdp.education as object[],
      seoTitle: pdp.seoTitle,
      seoDescription: pdp.seoDescription,
    };
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: {
        title: item.title,
        description: item.description,
        badges: [...item.badges],
        ...contentData,
      },
      create: {
        title: item.title,
        slug: item.slug,
        status: "ACTIVE",
        description: item.description,
        badges: [...item.badges],
        ...contentData,
      },
    });

    // AGENTS §8.9: ALL price writes go through the shared PriceHistory path.
    // changeVariantPriceInTx no-ops when the price is unchanged, and the
    // initial row is written only on create — so re-runs stay idempotent.
    const variantId = await prisma.$transaction(async (tx) => {
      const existing = await tx.variant.findUnique({
        where: { sku: item.sku },
      });
      if (existing) {
        await tx.variant.update({
          where: { id: existing.id },
          data: {
            title: item.title,
            maxCartQuantity: item.maxCartQuantity,
          },
        });
        // Stock changes go through the restock-aware helper (plan rule 13).
        await setVariantStockInTx(tx, existing.id, item.stock);
        await changeVariantPriceInTx(tx, {
          variantId: existing.id,
          priceCents: item.priceCents,
          compareAtPriceCents: item.compareAtPriceCents,
        });
        return existing.id;
      }

      const created = await tx.variant.create({
        data: {
          productId: product.id,
          title: item.title,
          sku: item.sku,
          priceCents: item.priceCents,
          compareAtPriceCents: item.compareAtPriceCents,
          stock: item.stock,
          maxCartQuantity: item.maxCartQuantity,
        },
      });
      await recordInitialPriceInTx(tx, {
        variantId: created.id,
        priceCents: item.priceCents,
        compareAtPriceCents: item.compareAtPriceCents,
      });
      return created.id;
    });

    variantIdBySku.set(item.sku, variantId);
  }

  await seedOmnibusDemoHistory(variantIdBySku.get("NAS-SER-30"));

  return variantIdBySku;
}

/**
 * Omnibus demo (§9.2): scripted history for the serum so the
 * "Najnižja cena v zadnjih 30 dneh: 24,99 €" line has real data.
 * Rebuilds only when no 2499 row exists → idempotent.
 */
async function seedOmnibusDemoHistory(serumVariantId: string | undefined) {
  if (!serumVariantId) return;
  const existing = await prisma.priceHistory.findFirst({
    where: { variantId: serumVariantId, priceCents: 2499 },
  });
  if (existing) return;

  await prisma.priceHistory.deleteMany({
    where: { variantId: serumVariantId },
  });
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  await prisma.priceHistory.createMany({
    data: [
      {
        variantId: serumVariantId,
        priceCents: 2499,
        createdAt: new Date(now - 40 * DAY),
      },
      {
        variantId: serumVariantId,
        priceCents: 2499,
        createdAt: new Date(now - 10 * DAY),
      },
      {
        variantId: serumVariantId,
        priceCents: 1999,
        compareAtPriceCents: 2499,
        createdAt: new Date(now - 1 * DAY),
      },
    ],
  });
}

const PLACEHOLDER_IMAGES: Record<string, string> = {
  "belilni-trakci-za-zobe": "/uploads/placeholder-trakci.svg",
  "ustna-voda-globinsko-ciscenje": "/uploads/placeholder-ustna-voda.svg",
  "serum-korektor-barve-zob": "/uploads/placeholder-serum.svg",
  "paket-popolna-rutina": "/uploads/placeholder-paket.svg",
  "belilni-trakci-potovalni-7": "/uploads/placeholder-travel.svg",
};

// Gallery (PDP): product image + two generic content placeholders
const GALLERY_IMAGES: Array<{ url: string; altSuffix: string }> = [
  { url: "", altSuffix: "" }, // index 0 = product image (filled per product)
  { url: "/uploads/placeholder-gallery-detail.svg", altSuffix: " — podrobnost" },
  { url: "/uploads/placeholder-gallery-lifestyle.svg", altSuffix: " — uporaba" },
];

async function seedMedia() {
  for (const item of PRODUCTS) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: item.slug },
    });
    const url = PLACEHOLDER_IMAGES[item.slug];

    await prisma.mediaImage.upsert({
      where: {
        productId_kind_sortOrder: {
          productId: product.id,
          kind: "CARD",
          sortOrder: 0,
        },
      },
      update: { url, alt: item.title },
      create: {
        productId: product.id,
        kind: "CARD",
        sortOrder: 0,
        url,
        alt: item.title,
      },
    });

    for (const [index, gallery] of GALLERY_IMAGES.entries()) {
      const galleryUrl = index === 0 ? url : gallery.url;
      await prisma.mediaImage.upsert({
        where: {
          productId_kind_sortOrder: {
            productId: product.id,
            kind: "GALLERY",
            sortOrder: index,
          },
        },
        update: { url: galleryUrl, alt: `${item.title}${gallery.altSuffix}` },
        create: {
          productId: product.id,
          kind: "GALLERY",
          sortOrder: index,
          url: galleryUrl,
          alt: `${item.title}${gallery.altSuffix}`,
        },
      });
    }
  }
}

async function seedCollections() {
  const collections: Array<{
    slug: string;
    title: string;
    products: string[];
  }> = [
    {
      slug: "beljenje",
      title: "Beljenje",
      products: [
        "belilni-trakci-za-zobe",
        "ustna-voda-globinsko-ciscenje",
        "serum-korektor-barve-zob",
        "belilni-trakci-potovalni-7",
      ],
    },
    {
      slug: "paketi",
      title: "Paketi",
      products: ["paket-popolna-rutina"],
    },
  ];

  for (const { slug, title, products } of collections) {
    const collection = await prisma.collection.upsert({
      where: { slug },
      update: { title, type: "MANUAL" },
      create: { slug, title, type: "MANUAL" },
    });

    for (const [position, productSlug] of products.entries()) {
      const product = await prisma.product.findUniqueOrThrow({
        where: { slug: productSlug },
      });
      await prisma.collectionProduct.upsert({
        where: {
          collectionId_productId: {
            collectionId: collection.id,
            productId: product.id,
          },
        },
        update: { position },
        create: {
          collectionId: collection.id,
          productId: product.id,
          position,
        },
      });
    }
  }
}

async function seedBundle(variantIdBySku: Map<string, string>) {
  const bundleProduct = await prisma.product.findUniqueOrThrow({
    where: { slug: "paket-popolna-rutina" },
  });

  const bundle = await prisma.bundle.upsert({
    where: { productId: bundleProduct.id },
    update: { priceCents: 4999, active: true },
    create: { productId: bundleProduct.id, priceCents: 4999, active: true },
  });

  // Bundle components: 1× each hero SKU (expanded for fulfillment at order time).
  for (const sku of ["NAS-TRK-14", "NAS-UST-500", "NAS-SER-30"] as const) {
    const variantId = variantIdBySku.get(sku);
    if (!variantId) continue;
    await prisma.bundleItem.upsert({
      where: { bundleId_variantId: { bundleId: bundle.id, variantId } },
      update: { quantity: 1 },
      create: { bundleId: bundle.id, variantId, quantity: 1 },
    });
  }
}

async function seedAdmin() {
  const email = (
    process.env.SEED_ADMIN_EMAIL ?? "admin@nasmeh.si"
  ).toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 10);
  // These explicitly provisioned seed accounts do not use email signup.
  // Keep their verification stable across seeds and preserve user passwords.
  const verifiedAt = new Date("2026-09-09T00:00:00Z");

  await prisma.user.upsert({
    where: { email },
    update: { role: "OWNER", emailVerified: verifiedAt },
    create: { email, name: "Admin", role: "OWNER", passwordHash, emailVerified: verifiedAt },
  });

  // Demo CUSTOMER (merge-on-login e2e + account flows)
  const customerEmail = (
    process.env.SEED_CUSTOMER_EMAIL ?? "customer@nasmeh.si"
  ).toLowerCase();
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? "Customer123!";
  const customerHash = await bcrypt.hash(customerPassword, 10);
  await prisma.user.upsert({
    where: { email: customerEmail },
    update: { role: "CUSTOMER", emailVerified: verifiedAt },
    create: {
      email: customerEmail,
      name: "Testna Stranka",
      role: "CUSTOMER",
      passwordHash: customerHash,
      emailVerified: verifiedAt,
    },
  });
}

async function seedSettings() {
  const settings: Array<{ key: string; value: unknown }> = [
    { key: "support.contact", value: DEFAULT_CONTACT_SETTINGS },
    { key: "shipping.freeThresholdCents", value: FREE_SHIPPING_THRESHOLD_CENTS },
    { key: "shipping.standardCostCents", value: 390 },
    {
      // checkout shipping methods (§8.1) — id/carrier/label/price/estimate
      key: "shipping.methods",
      value: [
        {
          id: "ps-standard",
          carrier: "Pošta Slovenije",
          label: "Pošta Slovenije — standard",
          priceCents: 390,
          estimate: "2–4 delovna dneva",
        },
        {
          id: "ps-express",
          carrier: "Pošta Slovenije",
          label: "Pošta Slovenije — express",
          priceCents: 690,
          estimate: "1–2 delovna dneva",
        },
        {
          id: "gls",
          carrier: "GLS",
          label: "GLS — paketna dostava",
          priceCents: 490,
          estimate: "2–3 delovni dnevi",
        },
      ],
    },
    { key: "vat.ratePercent", value: VAT_RATE_PERCENT },
    {
      key: "marquee.text",
      value: "Brezplačna dostava pri naročilih nad 45 €",
    },
    { key: "marquee.href", value: "/checkout" },
    { key: "marquee.active", value: true },
    {
      // Homepage section order and visibility (§14.10)
      key: "home.sections",
      value: [
        { id: "hero", visible: true },
        { id: "rail", visible: true },
        { id: "bundleBanner", visible: true },
        { id: "routineBanner", visible: true },
      ],
    },
    { key: "home.bundleBanner", value: { title: "Naši paketi", cta: "Nakupuj zdaj", href: "/trgovina?kolekcija=paketi" } },
    {
      key: "home.routineBanner",
      value: {
        title: "Vaša vsakodnevna rutina beljenja — urejena.",
        href: "/izdelek/paket-popolna-rutina",
        image: "/uploads/placeholder-rutina-wide.svg",
        imageAlt: "Paket popolna rutina — trakci, ustna voda in serum",
        footnote: "*Rezultati se lahko razlikujejo od osebe do osebe. Izdelki niso nadomestilo ustne higiene pri zobozdravniku.",
      },
    },
    {
      key: "company",
      value: {
        name: "Nasmeh.si, d.o.o.",
        address: "Trg nasmeha 1, 1000 Ljubljana, Slovenija",
        registrationNumber: "0000000000",
        vatId: "SI00000000",
        email: "info@nasmeh.si",
      },
    },
    {
      // Homepage hero content slot (§4.1) — image fallback until D2 video exists
      key: "home.hero",
      value: {
        kicker: "NOVO",
        title: "Nasmeh, ki ga opazite",
        subtitle:
          "Belilni trakci z nežno formulo brez peroksida — vidno svetlejši nasmeh že v 14 dneh, nežno do sklenine.",
        ctaLabel: "Nakupuj zdaj",
        ctaHref: "/izdelek/belilni-trakci-za-zobe",
        poster: "/uploads/placeholder-hero.svg",
        imageAlt: "Belilni trakci Nasmeh.si — predstavitveni vizual",
        promoOverlayText: "Brezplačna dostava pri naročilih nad 45 €",
        promoOverlayHref: "/checkout",
      },
    },
    { key: "analytics.gtmId", value: "" },
    { key: "seo.googleVerification", value: "" },
    {
      // Carrier tracking URL templates (§14.12) — {number} interpolated
      key: "tracking.templates",
      value: {
        ps: "https://sledenje.posta.si/?q={number}",
        gls: "https://gls-group.eu/SI/sl/sledenje-paketom?match={number}",
      },
    },
    // Auto-publish verified reviews with rating ≥ N stars (0 = moderation always)
    // Low-stock threshold for the dashboard and product list (§14.2)
    { key: "inventory.lowStockThreshold", value: 5 },
    { key: "reviews.autoPublishMinStars", value: 0 },
    { key: "reviews.requestDelayDays", value: 7 },
    {
      // Welcome popup (§9.3/§14.11) — all copy/timing/code/active as admin data
      key: "welcomePopup",
      value: {
        active: true,
        delaySeconds: 55,
        couponCode: "WELCOME10",
        title: "10 % popusta na prvo naročilo",
        body: "Prijavite se na e-novice in prejmite kodo za 10 % popusta na vaše prvo naročilo — plus možnost testiranja novih izdelkov.",
        cta: "Pošlji kodo",
        thankYouTitle: "Koda je vaša! 🎉",
        thankYouBody:
          "Preverite nabiralnik in potrdite prijavo. Koda WELCOME10 je že shranjena za blagajno.",
      },
    },
    {
      key: "maintenance",
      value: {
        enabled: false,
        password: "nasmeh-vzdrzevanje",
        message: "Trgovina se pripravlja — vrnite se kmalu.",
      },
    },
  ];

  for (const { key, value } of settings) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: value as object },
      create: { key, value: value as object },
    });
  }
}

async function seedMenus() {
  const shopChildren = [
    { label: "Vsi izdelki", href: "/trgovina" },
    { label: "Paketi", href: "/trgovina?kolekcija=paketi" },
    { label: "Belilni trakci", href: "/izdelek/belilni-trakci-za-zobe" },
    { label: "Ustna voda", href: "/izdelek/ustna-voda-globinsko-ciscenje" },
    { label: "Serum korektor", href: "/izdelek/serum-korektor-barve-zob" },
  ];
  const featured = ["belilni-trakci-za-zobe", "serum-korektor-barve-zob"];

  const menus: Array<{ handle: string; title: string; items: unknown }> = [
    {
      handle: "header",
      title: "Glavni meni",
      items: [
        {
          label: "TRGOVINA",
          href: "/trgovina",
          children: shopChildren,
          featured,
        },
        { label: "PAKETI & PRIHRANKI", href: "/trgovina?kolekcija=paketi", color: "sale" },
      ],
    },
    {
      handle: "utility",
      title: "Pripomočna vrstica",
      items: [
        { label: "Prijava", href: "/prijava" },
      ],
    },
    {
      handle: "footer-trgovina",
      title: "Noga — Trgovina",
      items: [
        { label: "Belilni trakci", href: "/izdelek/belilni-trakci-za-zobe" },
        { label: "Ustna voda", href: "/izdelek/ustna-voda-globinsko-ciscenje" },
        { label: "Serum korektor", href: "/izdelek/serum-korektor-barve-zob" },
        { label: "Paketi", href: "/izdelek/paket-popolna-rutina" },
      ],
    },
    {
      handle: "footer-pomoc",
      title: "Noga — Podpora",
      items: [
        { label: "Kontakt", href: "/kontakt" },
        { label: "Sledi naročilu", href: "/sledi" },
        { label: "Odstop od pogodbe", href: "/odstop-od-pogodbe" },
        { label: "Reklamacije", href: "/reklamacije" },
        { label: "Prijava neželenega učinka", href: "/prijava-nezelenega-ucinka" },
      ],
    },
    {
      handle: "footer-sledite",
      title: "Noga — Sledite nam",
      items: [
        { label: "Instagram", href: "https://instagram.com/" },
        { label: "TikTok", href: "https://tiktok.com/" },
        { label: "Facebook", href: "https://facebook.com/" },
      ],
    },
    {
      handle: "footer-pravno",
      title: "Noga — Pravno",
      items: [
        { label: "Pogoji poslovanja", href: "/pogoji-poslovanja" },
        { label: "Politika zasebnosti", href: "/politika-zasebnosti" },
        { label: "Politika piškotkov", href: "/politika-piskotkov" },
        { label: "Odstop od pogodbe", href: "/odstop-od-pogodbe" },
        { label: "Reklamacije", href: "/reklamacije" },
        { label: "Jamstvo vračila denarja", href: "/garancija-vracila-denarja" },
      ],
    },
    {
      handle: "mobile",
      title: "Mobilni predal",
      items: [
        {
          label: "TRGOVINA",
          href: "/trgovina",
          children: shopChildren,
          featured,
        },
        { label: "PAKETI & PRIHRANKI", href: "/trgovina?kolekcija=paketi", color: "sale" },
      ],
    },
  ];

  for (const { handle, title, items } of menus) {
    await prisma.menu.upsert({
      where: { handle },
      update: { title, items: items as object[] },
      create: { handle, title, items: items as object[] },
    });
  }
}

async function seedCoupons() {
  const coupons = [
    {
      code: "TEST10",
      type: "PERCENT" as const,
      percentOff: 10,
      usageLimitPerCustomer: null as number | null,
      usageLimitTotal: null as number | null,
    },
    {
      // Welcome popup code: 10 % off, once per customer ("first order")
      code: "WELCOME10",
      type: "PERCENT" as const,
      percentOff: 10,
      usageLimitPerCustomer: 1 as number | null,
      usageLimitTotal: null as number | null,
    },
  ];
  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {
        type: coupon.type,
        percentOff: coupon.percentOff,
        usageLimitPerCustomer: coupon.usageLimitPerCustomer,
        usageLimitTotal: coupon.usageLimitTotal,
        active: true,
      },
      create: {
        code: coupon.code,
        type: coupon.type,
        percentOff: coupon.percentOff,
        usageLimitPerCustomer: coupon.usageLimitPerCustomer,
        usageLimitTotal: coupon.usageLimitTotal,
        active: true,
      },
    });
  }
}

async function seedContentPages() {  for (const page of LEGAL_PAGES) {
    await prisma.contentPage.upsert({
      where: { slug: page.slug },
      update: {
        title: page.title,
        body: page.body,
        seoDescription: page.seoDescription,
        template: "LEGAL",
        published: true,
      },
      create: {
        title: page.title,
        slug: page.slug,
        body: page.body,
        seoDescription: page.seoDescription,
        template: "LEGAL",
        published: true,
        reviewed: false, // D4: drafts pending professional review
      },
    });
  }
}

async function main() {
  const variantIdBySku = await seedCatalog();
  await seedBundle(variantIdBySku);
  await seedMedia();
  await seedCollections();
  await seedAdmin();
  await seedSettings();
  await seedMenus();
  await seedContentPages();
  await seedCoupons();

  const [
    products,
    variants,
    priceHistory,
    mediaImages,
    users,
    settings,
    menus,
    contentPages,
    collections,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.variant.count(),
    prisma.priceHistory.count(),
    prisma.mediaImage.count(),
    prisma.user.count(),
    prisma.setting.count(),
    prisma.menu.count(),
    prisma.contentPage.count(),
    prisma.collection.count(),
  ]);
  console.log("Seed complete:", {
    products,
    variants,
    priceHistory,
    mediaImages,
    users,
    settings,
    menus,
    contentPages,
    collections,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
