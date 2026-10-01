import { db } from "@/lib/db";
import { getCartLines } from "@/lib/cart/server";
import { hydrateCartLines } from "@/lib/cart/hydrate";
import { variantIsPurchasable } from "@/lib/cart/visibility";
import { readKodaCode } from "@/lib/koda";
import { getPriceReductions } from "@/lib/omnibus";
import { withReducedFlags } from "@/lib/promo/reductions";
import { resolveCouponInput } from "@/lib/promo/resolve";
import type { CouponLine, CouponType } from "@/lib/promo/coupons";
import type { PromoSettings } from "@/lib/promo";
import type { PriceReduction } from "@/lib/pricing";
import { getBundleBuilder, getShippingSettings, getVatRatePercent } from "@/lib/settings";
import { buildQuoteTable, bestOfferIndex, committedUnits, quoteKey, type BundleQuote } from "./quote";

/**
 * Server-side assembly for /sestavi-paket (AGENTS §5.2). Everything the module
 * shows is read here from the database and the Settings; the client island is
 * handed flat values and does no pricing of its own.
 */

export interface BundleItemView {
  variantId: string;
  productSlug: string;
  title: string;
  priceCents: number;
  imageUrl: string | null;
  imageAlt: string;
  /** History-backed Art. 6a reduction — the only figure entitled to a strikethrough. */
  reduction: PriceReduction | null;
}

export interface BundleOfferView {
  index: number;
  /** Units this offer commits to. */
  units: number;
  /** Units the cart ends up with (never fewer than it already holds). */
  committedUnits: number;
  /** Goods price of those units before any discount. */
  priceCents: number;
  unitPriceCents: number;
  /** The cart already holds this many or more, so picking it changes nothing. */
  redundant: boolean;
}

export interface BundleAddOnView extends BundleItemView {
  existingQuantity: number;
}

export interface BundleBaseView extends BundleItemView {
  maxCartQuantity: number;
  /** The variant the offers are quantities of, named for the shopper. */
  variantTitle: string;
  sku: string;
}

export interface BundleBuilderView {
  base: BundleBaseView;
  offers: BundleOfferView[];
  addOns: BundleAddOnView[];
  table: Record<string, BundleQuote>;
  badgeOfferIndex: number | null;
  defaultOfferIndex: number;
  defaultMask: number;
  /** The code the submit will apply, or null when there is nothing to apply. */
  applyCouponCode: string | null;
  /** That code's type, which picks its terms sentence (§9.1: every code shows one); null with no code to apply. */
  applyCouponType: CouponType | null;
  /** A code the shopper already carries; it is kept, never replaced. */
  activeCouponCode: string | null;
  /** Lines already in the cart that this module does not own. */
  otherLineCount: number;
  subscriptionRow: boolean;
  vatRatePercent: number;
}

const PRODUCT_SELECT = {
  id: true,
  slug: true,
  title: true,
  status: true,
  hiddenDeal: true,
  bundle: { select: { id: true } },
  collections: { select: { collection: { select: { slug: true } } } },
  media: {
    where: { kind: "CARD" as const },
    orderBy: { sortOrder: "asc" as const },
    take: 1,
    select: { url: true, alt: true },
  },
  variants: {
    orderBy: { createdAt: "asc" as const },
    take: 1,
    select: {
      id: true,
      sku: true,
      title: true,
      priceCents: true,
      compareAtPriceCents: true,
      stock: true,
      allowBackorder: true,
      maxCartQuantity: true,
    },
  },
} as const;

async function findProduct(slug: string) {
  return db.product.findUnique({ where: { slug }, select: PRODUCT_SELECT });
}

type LoadedProduct = NonNullable<Awaited<ReturnType<typeof findProduct>>>;

/** A product this module can build on: purchasable, has a SKU, is not a bundle. */
function isBuildable(product: LoadedProduct | null): product is LoadedProduct {
  return (
    product !== null &&
    product.variants.length > 0 &&
    product.bundle === null &&
    // not a bundle (checked above), so no bundle switch applies
    variantIsPurchasable({ status: product.status, hiddenDeal: product.hiddenDeal, bundle: null })
  );
}

function inStock(variant: { stock: number; allowBackorder: boolean }, units = 1): boolean {
  return variant.allowBackorder || variant.stock >= units;
}

function toLine(product: LoadedProduct, quantity: number): Omit<CouponLine, "reduced"> {
  const variant = product.variants[0];
  return {
    variantId: variant.id,
    sku: variant.sku,
    title: product.title,
    quantity,
    priceCents: variant.priceCents,
    compareAtPriceCents: variant.compareAtPriceCents,
    vatRatePercent: 22,
    maxCartQuantity: variant.maxCartQuantity,
    isBundle: false,
    bundleComponents: [],
    product: {
      productId: product.id,
      collectionSlugs: product.collections.map((entry) => entry.collection.slug),
    },
  };
}

function toItemView(product: LoadedProduct, reductions: Map<string, PriceReduction>): BundleItemView {
  const variant = product.variants[0];
  return {
    variantId: variant.id,
    productSlug: product.slug,
    title: product.title,
    priceCents: variant.priceCents,
    imageUrl: product.media[0]?.url ?? null,
    imageAlt: product.media[0]?.alt ?? product.title,
    reduction: reductions.get(variant.id) ?? null,
  };
}

/** Add-ons: the operator list when set, otherwise the base product's own shelf. */
async function findAddOns(base: LoadedProduct, slugs: string[]): Promise<LoadedProduct[]> {
  const collectionSlugs = base.collections.map((entry) => entry.collection.slug);
  let candidates: LoadedProduct[] = [];
  if (slugs.length > 0) {
    const found = await db.product.findMany({ where: { slug: { in: slugs } }, select: PRODUCT_SELECT });
    candidates = slugs
      .map((slug) => found.find((product) => product.slug === slug))
      .filter((product): product is LoadedProduct => product !== undefined);
  } else if (collectionSlugs.length > 0) {
    candidates = await db.product.findMany({
      where: {
        id: { not: base.id },
        status: "ACTIVE",
        hiddenDeal: false,
        bundle: { is: null },
        collections: { some: { collection: { slug: { in: collectionSlugs } } } },
      },
      select: PRODUCT_SELECT,
      orderBy: { createdAt: "asc" },
      take: 8,
    });
  }

  return candidates
    .filter((product) => product.id !== base.id && isBuildable(product) && inStock(product.variants[0]))
    .slice(0, 3);
}

export async function loadBundleBuilder(
  slug: string | null,
  userId: string | null,
  email: string,
): Promise<BundleBuilderView | null> {
  if (!slug) return null;
  const [config, product] = await Promise.all([getBundleBuilder(), findProduct(slug)]);
  if (!isBuildable(product)) return null;

  const baseVariant = product.variants[0];
  const [addOnProducts, cartLines, shipping, vatRatePercent, activeCode] = await Promise.all([
    findAddOns(product, config.addOnSlugs),
    getCartLines(userId).then(hydrateCartLines),
    getShippingSettings(),
    getVatRatePercent(),
    readKodaCode(),
  ]);

  // A code the shopper already carries wins: one code per order, and replacing
  // it silently would cost them a discount they chose (lib/promo/coupons.ts).
  const codeToPrice = activeCode ?? (config.couponCode || null);
  const coupon = codeToPrice ? await resolveCouponInput(codeToPrice, email) : null;

  const settings: PromoSettings = {
    vatRatePercent,
    freeShippingThresholdCents: shipping.freeThresholdCents,
    shippingCostCents: shipping.standardCostCents,
  };

  const ownedIds = new Set([baseVariant.id, ...addOnProducts.map((item) => item.variants[0].id)]);
  const quantityOf = (variantId: string) =>
    cartLines.find((line) => line.variantId === variantId)?.quantity ?? 0;

  const [baseLine, ...addOnLines] = await withReducedFlags([
    toLine(product, 1),
    ...addOnProducts.map((item) => toLine(item, 1)),
  ]);
  const otherLines = cartLines.filter((line) => !ownedIds.has(line.variantId));

  const existingBaseQuantity = quantityOf(baseVariant.id);
  const addOnExisting = addOnProducts.map((item) => quantityOf(item.variants[0].id));

  // An offer the cap or the stock cannot honour is never shown, so the row can
  // never offer a quantity the cart would clamp.
  const offerUnits = config.offerUnits.filter(
    (units) => units <= baseVariant.maxCartQuantity && inStock(baseVariant, units),
  );
  if (offerUnits.length === 0) return null;

  const table = buildQuoteTable({
    base: baseLine,
    addOns: addOnLines,
    addOnExisting,
    otherLines,
    existingBaseQuantity,
    offerUnits,
    settings,
    coupon,
    ctx: { email, hasCodeAlready: false },
    now: new Date(),
  });

  const reductions = await getPriceReductions([
    {
      variantId: baseVariant.id,
      priceCents: baseVariant.priceCents,
      compareAtPriceCents: baseVariant.compareAtPriceCents,
    },
    ...addOnProducts.map((item) => ({
      variantId: item.variants[0].id,
      priceCents: item.variants[0].priceCents,
      compareAtPriceCents: item.variants[0].compareAtPriceCents,
    })),
  ]);

  const offers: BundleOfferView[] = offerUnits.map((units, index) => ({
    index,
    units,
    committedUnits: committedUnits(units, existingBaseQuantity),
    priceCents: baseVariant.priceCents * units,
    unitPriceCents: baseVariant.priceCents,
    redundant: units < existingBaseQuantity,
  }));

  // Spec default: the smallest offer with every add-on ticked — but never an
  // offer that would change nothing because the cart already holds more.
  const firstUsable = offers.findIndex((offer) => !offer.redundant);
  const defaultOfferIndex = firstUsable === -1 ? 0 : firstUsable;

  return {
    base: {
      ...toItemView(product, reductions),
      maxCartQuantity: baseVariant.maxCartQuantity,
      // A single-variant product seeds `Variant.title` to the product title;
      // the page only shows it when it says something the name does not.
      variantTitle: baseVariant.title,
      sku: baseVariant.sku,
    },
    offers,
    addOns: addOnProducts.map((item, index) => ({
      ...toItemView(item, reductions),
      existingQuantity: addOnExisting[index],
    })),
    table,
    badgeOfferIndex: bestOfferIndex(table, offers.length),
    defaultOfferIndex,
    defaultMask: (1 << addOnProducts.length) - 1,
    applyCouponCode: activeCode ? null : config.couponCode || null,
    // without a code of the shopper's own, the coupon priced above is the configured one
    applyCouponType: activeCode ? null : (coupon?.type ?? null),
    activeCouponCode: activeCode,
    otherLineCount: otherLines.length,
    subscriptionRow: config.subscriptionRow,
    vatRatePercent,
  };
}

export { quoteKey };
