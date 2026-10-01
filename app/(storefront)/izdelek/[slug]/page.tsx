import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  bundleSavingsFor,
  descriptionSummary,
  displayBadges,
  getCatalogProducts,
  hasCaretClaim,
  lowStockUnits,
  parseBadges,
  plainTextFromHtml,
} from "@/lib/catalog";
import {
  addableUnits,
  isSoldOut,
  productHasSellableUnits,
  sellableStock,
} from "@/lib/bundle/availability";
import { PURCHASABLE_PRODUCT_WHERE } from "@/lib/cart/visibility";
import { getPriceReductions } from "@/lib/omnibus";
import {
  formatEUR,
  formatUnitPrice,
  klarnaInstallmentCents,
  standardShippingMethod,
} from "@/lib/pricing";
import { sanitizeContentHtml } from "@/lib/security/html-sanitizer";
import { getBundleBuilder, getLowStockThreshold, getShippingSettings } from "@/lib/settings";
import { isTestMode } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { catalog, pdp as copy, common } from "@/lib/copy";
import { UiAccordion } from "@/components/storefront/ui/UiAccordion";
import { UiIcon } from "@/components/storefront/ui/UiIcon";
import { UiPill } from "@/components/storefront/ui/UiPill";
import { TrustRow } from "@/components/storefront/pdp/TrustRow";
import { JsonLd } from "@/components/storefront/seo/JsonLd";
import { CatalogCard } from "@/components/storefront/catalog/CatalogCard";
import { BadgePill } from "@/components/storefront/catalog/BadgePill";
import { RatingStars } from "@/components/storefront/catalog/RatingStars";
import { BuyBox } from "@/components/storefront/pdp/BuyBox";
import { StickyBuyBar } from "@/components/storefront/pdp/StickyBuyBar";
import { ReviewsSection } from "@/components/storefront/reviews/ReviewsSection";
import { TrackViewItem } from "@/components/storefront/analytics/TrackViewItem";
import { buildViewItemEvent } from "@/lib/analytics";
import { aggregateRatings } from "@/lib/reviews/aggregate";
import { reviewStructuredData } from "@/lib/reviews/display";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * The product page answers only for what can be bought (lib/cart/visibility):
 * a draft, an archived product, a hidden deal SKU and an inactive bundle are
 * all 404 — nothing surfaces what the add-to-cart action would refuse.
 */
async function getProduct(slug: string) {
  return db.product.findFirst({
    where: { slug, ...PURCHASABLE_PRODUCT_WHERE },
    include: {
      variants: { orderBy: { priceCents: "asc" } },
      media: {
        where: { kind: "GALLERY" },
        orderBy: { sortOrder: "asc" },
      },
      bundle: {
        include: {
          items: { include: { variant: true }, orderBy: { id: "asc" } },
        },
      },
      reviews: {
        where: { status: "PUBLISHED" },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  // A hidden, fully sold-out product still answers but asks not to be indexed.
  const hidden = !productHasSellableUnits(product);
  return buildMetadata({
    title: product.seoTitle ?? product.title,
    // the rich description as plain text when no SEO description is written (QA T6-07)
    description: product.seoDescription || descriptionSummary(product.description),
    path: `/izdelek/${product.slug}`,
    image: product.media[0]?.url,
    noindex: hidden,
  });
}

interface CustomFields {
  uspChips?: string[];
  intro?: string;
  bullets?: string[];
  unitPrice?: { quantity: number; unit: string };
  crossSell?: string[];
}

/** PDP template (§6, DOM order 1–15) — one template, all products + bundle. */
export default async function ProductPage({
  params,
  searchParams,
}: Params & {
  searchParams: Promise<{ pregled?: string | string[]; zvezdice?: string | string[]; foto?: string | string[] }>;
}) {
  const [{ slug }, filters] = await Promise.all([params, searchParams]);
  const product = await getProduct(slug);
  if (!product) notFound();

  const variant = product.variants[0];
  if (!variant) notFound();

  const cf = (product.customFields ?? {}) as CustomFields;
  const accordionBodies = (product.accordions ?? {}) as Record<string, string>;
  const faqItems = Array.isArray(product.faq)
    ? (product.faq as Array<{ q: string; a: string }>)
    : [];
  const education = Array.isArray(product.education)
    ? (product.education as Array<{ heading: string; body: string }>)
    : [];
  // A bundle's availability is its components' (lib/bundle/availability), the
  // same figure the cards, the sitemap and the add-to-cart action use.
  const availability = sellableStock(variant, product.bundle);
  const soldOut = isSoldOut(availability);
  const backorder = availability.stock <= 0 && availability.allowBackorder;
  // The computed sold-out pill states the sold-out fact; an admin badge saying the same is dropped.
  const badges = displayBadges(parseBadges(product.badges));
  // Operator HTML is sanitised on render as well as on save (AGENTS §8.24, QA S1).
  const description = product.description.trim() ? sanitizeContentHtml(product.description) : "";

  // Omnibus gate (lib/pricing priceReduction): strikethrough + 30-day line
  // only with a history-backed prior price above the current price.
  const [reductions, shipping, reviewAggregate, crossSellProducts, lowStockThreshold, bundleBuilder] =
    await Promise.all([
      getPriceReductions([
        { variantId: variant.id, priceCents: variant.priceCents, compareAtPriceCents: variant.compareAtPriceCents },
      ]),
      getShippingSettings(),
      Promise.resolve(aggregateRatings(product.reviews.map((review) => review.rating))),
      getCatalogProducts().then((all) =>
        all.filter((p) => p.slug !== product.slug),
      ),
      getLowStockThreshold(),
      getBundleBuilder(),
    ]);

  // A clean add hands off to the bundle builder (§7.1). Never from a bundle
  // PDP: a bundle is already a fixed selection, and the builder has nothing to
  // offer on top of it.
  const bundleBuilderHref =
    bundleBuilder.enabled && product.bundle === null
      ? `/sestavi-paket?izdelek=${encodeURIComponent(product.slug)}`
      : null;

  const reduction = reductions.get(variant.id) ?? null;
  // the real remaining units, only while the stock is at or under the admin's threshold
  const lowStock = soldOut ? null : lowStockUnits(availability.stock, lowStockThreshold);
  // the units one add may take: the per-line cap, and no more than the stock can fill
  const maxQuantity = Math.max(1, addableUnits(availability, variant.maxCartQuantity));
  // Delivery accordion and trust row from the shipping Setting (the cart's standard method and threshold)
  const deliveryEstimate = standardShippingMethod(shipping.methods, shipping.standardCostCents)?.estimate.trim() || null;
  const freeThreshold = shipping.freeThresholdCents > 0 ? formatEUR(shipping.freeThresholdCents) : null;
  const deliveryShipping = copy.delivery.shipping({ estimate: deliveryEstimate, freeThreshold });
  const unitPrice = cf.unitPrice
    ? formatUnitPrice(variant.priceCents, cf.unitPrice.quantity, cf.unitPrice.unit)
    : null;
  const klarnaEnabled = !soldOut && product.klarnaEligible && getEnv().STRIPE_KLARNA_ENABLED === "true";

  const rating =
    reviewAggregate.count > 0
      ? { average: reviewAggregate.average, count: reviewAggregate.count }
      : null;

  const crossSell = (cf.crossSell ?? [])
    .map((s) => crossSellProducts.find((p) => p.slug === s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const alsoBought = crossSellProducts.slice(0, 4);

  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  const base = siteUrl();
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    sku: variant.sku,
    // structured data carries text, never markup
    description: product.seoDescription || plainTextFromHtml(product.description),
    image: product.media.map((m) => `${base}${m.url}`),
    brand: { "@type": "Brand", name: common.siteName },
    offers: {
      "@type": "Offer",
      url: `${base}/izdelek/${product.slug}`,
      priceCurrency: "EUR",
      price: (variant.priceCents / 100).toFixed(2),
      availability: soldOut
        ? "https://schema.org/OutOfStock"
        : backorder
          ? "https://schema.org/BackOrder"
          : "https://schema.org/InStock",
    },
    ...reviewStructuredData(product.reviews),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: copy.breadcrumbs.home, item: base },
      {
        "@type": "ListItem",
        position: 2,
        name: copy.breadcrumbs.shop,
        item: `${base}/trgovina`,
      },
      { "@type": "ListItem", position: 3, name: product.title },
    ],
  };
  const faqLd =
    faqItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }
      : null;

  // A marker only where a claim resolves to it: the guarantee title carries its
  // caret only when a claim this page shows is marked "^" (QA T1-14) — the
  // description, the intro, bullets and chips, or the accordion, FAQ and education text.
  const guaranteeTitle = hasCaretClaim(product)
    ? copy.accordions.guarantee
    : copy.accordions.guarantee.replace(/^\^/, "");
  const accordionItems = [
    { key: "howItWorks", title: copy.accordions.howItWorks },
    { key: "inci", title: copy.accordions.inci },
    { key: "guarantee", title: guaranteeTitle },
    { key: "tested", title: copy.accordions.tested },
  ]
    .filter((item) => accordionBodies[item.key])
    .map((item) => ({
      title: item.title,
      content: (
        <div
          className="content-prose"
          dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(accordionBodies[item.key]) }}
        />
      ),
    }));

  const bundle = product.bundle;
  // the same helper the card uses: measured against the price shown below and
  // charged (the variant's), null when there is no saving or a reduction is announced
  const savings = bundleSavingsFor(bundle, variant.priceCents, reduction);

  return (
    <>
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd} />
      {faqLd ? <JsonLd data={faqLd} /> : null}

      <div className="mx-auto max-w-(--container-wide) px-(--padding) pb-10 pt-6">
        {/* 1. Breadcrumbs */}
        <nav aria-label={copy.breadcrumbs.shop}>
          <ol className="flex flex-wrap items-center gap-2 text-xs text-mid-2">
            <li>
              <Link href="/" className="transition-colors hover:text-dark-1">
                {copy.breadcrumbs.home}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/trgovina" className="transition-colors hover:text-dark-1">
                {copy.breadcrumbs.shop}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-dark-1">
              {product.title}
            </li>
          </ol>
        </nav>

        <div className="mt-6 grid gap-10 md:grid-cols-2 md:gap-16">
          {/* 2. Portrait gallery (0.6875:1): first image fetchpriority=high, second eager (it enters the
              first mobile viewport and must not be the lazy-loaded LCP), the rest lazy */}
          <div className="flex flex-col gap-4">
            {product.media.length === 0 ? (
              <div aria-hidden="true" className="aspect-[0.6875] w-full rounded-card bg-light-3" />
            ) : (
              product.media.map((image, index) => (
                // the frame clips a slow zoom on hover; the image keeps its intrinsic box (no shift)
                <div key={image.id} className="group overflow-hidden rounded-card bg-light-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.alt}
                    width={880}
                    height={1280}
                    {...(index === 0
                      ? { fetchPriority: "high" }
                      : index === 1
                        ? { loading: "eager" }
                        : { loading: "lazy" })}
                    className="aspect-[0.6875] w-full object-cover transition-transform duration-500 ease-out-quart group-hover:scale-[1.04]"
                  />
                </div>
              ))
            )}
          </div>

          <div>
            {/* 3. Badge + H1 — the computed sold-out pill, then the admin badges (never one that repeats it) */}
            <div className="flex flex-wrap items-center gap-2" data-pdp-badges>
              {soldOut ? (
                <BadgePill badge={{ label: catalog.card.soldOut, style: "grey" }} />
              ) : null}
              {badges.map((badge) => (
                <BadgePill key={badge.label} badge={badge} />
              ))}
            </div>
            <h1 className="mt-3 text-[2rem] md:text-[2.5rem]">{product.title}</h1>

            {/* 4. Rating summary — one count, linked to the reviews (a tap-sized target) */}
            <div className="mt-2">
              {rating ? (
                <a href="#mnenja" className="inline-flex items-center gap-1.5 py-1 text-mid-2" data-rating-link>
                  <RatingStars rating={rating} showCount={false} />
                  <span className="text-xs underline underline-offset-2">({rating.count})</span>
                </a>
              ) : (
                <RatingStars rating={rating} />
              )}
            </div>

            {/* 5. USP chips (max 3) */}
            {cf.uspChips?.length ? (
              <ul className="mt-5 flex flex-wrap gap-2">
                {cf.uspChips.slice(0, 3).map((chip) => (
                  <li key={chip}>
                    <UiPill variant="neutral">
                      <UiIcon name="check" className="h-3.5 w-3.5 text-brand" />
                      {chip}
                    </UiPill>
                  </li>
                ))}
              </ul>
            ) : null}

            {/* 6. Intro + checkmark bullets, then the rich description (operator HTML, sanitised) */}
            {cf.intro ? (
              <p className="mt-5 text-sm leading-6 text-mid-1">{cf.intro}</p>
            ) : null}
            {cf.bullets?.length ? (
              <ul className="mt-4 flex flex-col gap-2">
                {cf.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2 text-sm text-dark-1">
                    <span aria-hidden="true" className="mt-0.5 text-success">✓</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
            {description ? (
              <div
                className="content-prose mt-5 text-sm leading-6 text-mid-1"
                data-pdp-description
                dangerouslySetInnerHTML={{ __html: description }}
              />
            ) : null}

            {/* 7. Accordion set #1 — server-rendered bodies (asterisk claims resolve here) */}
            {accordionItems.length > 0 ? (
              <div className="mt-8">
                <UiAccordion items={accordionItems} />
              </div>
            ) : null}

            {/* Bundle components + savings (§6.6): bundle vs its components at today's prices,
                not an Art. 6a reduction — no strikethrough, no Omnibus line. The contents
                always show; the value line only while there is a saving to state. */}
            {bundle ? (
              <div className="mt-8 rounded-card border border-light-2 bg-white p-5">
                <h2 className="text-lg">{copy.bundle.components}</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {bundle.items.map((item) => (
                    <li key={item.id} className="flex justify-between text-sm">
                      <span className="text-dark-1">
                        {item.variant.title}{" "}
                        <span className="text-mid-2">
                          {copy.bundle.quantitySuffix}
                          {item.quantity}
                        </span>
                      </span>
                      <span className="text-mid-1">
                        {formatEUR(item.variant.priceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
                {savings ? (
                  <p className="mt-4 border-t border-light-3 pt-3 text-sm font-medium text-dark-1" data-bundle-savings>
                    {copy.bundle.savingsLine(formatEUR(savings.valueCents), savings.savingsPercent)}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* 8. Buy box */}
            <div className="mt-8 rounded-card border border-light-2 bg-white p-5 shadow-card" data-pdp-price-box>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl text-dark-1">
                {reduction ? (
                  <span className="text-base text-mid-2 line-through">
                    {formatEUR(reduction.priorPriceCents)}
                  </span>
                ) : null}
                <span>
                  {formatEUR(variant.priceCents)}{" "}
                  <span className="text-sm text-mid-2">{copy.buyBox.vatIncluded}</span>
                </span>
                {reduction && !soldOut ? (
                  <UiPill variant="brand" data-percent-off>
                    {catalog.card.percentOff(reduction.percentOff)}
                  </UiPill>
                ) : null}
              </p>
              {reduction ? (
                <p className="mt-1 text-xs text-mid-2" data-omnibus-line>
                  {copy.buyBox.omnibusPrefix}: {formatEUR(reduction.priorPriceCents)}
                </p>
              ) : null}
              {unitPrice ? (
                <p className="mt-1 text-xs text-mid-2">({unitPrice})</p>
              ) : null}
              {lowStock !== null ? (
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-dark-1" data-low-stock>
                  <span aria-hidden="true" className="ui-pulse-dot h-2 w-2 rounded-btn bg-warning" />
                  {copy.buyBox.lowStock(lowStock)}
                </p>
              ) : null}
              {backorder ? (
                <p className="mt-2 text-sm text-warning" data-backorder-note>{copy.buyBox.backorder}{variant.backorderNote ? ` ${variant.backorderNote}` : ""}</p>
              ) : null}
              {klarnaEnabled ? (
                <p className="mt-1 text-xs text-mid-2">
                  {copy.buyBox.klarnaPrefix}{" "}
                  {formatEUR(klarnaInstallmentCents(variant.priceCents))}{" "}
                  {copy.buyBox.klarnaSuffix}
                </p>
              ) : null}

              <div className="mt-5">
                <BuyBox
                  productSlug={product.slug}
                  variantId={variant.id}
                  sku={variant.sku}
                  title={product.title}
                  priceCents={variant.priceCents}
                  maxQuantity={maxQuantity}
                  soldOut={soldOut}
                  testToken={testToken}
                  imageUrl={product.media[0]?.url ?? null}
                  nextHref={bundleBuilderHref}
                />
              </div>

              {/* Trust row (research 04 §8 risk reversal; every figure from the shipping Setting) */}
              <TrustRow estimate={deliveryEstimate} freeThreshold={freeThreshold} guarantee={false} className="mt-5 border-t border-light-3 pt-4" />
            </div>

            {/* 9. Delivery & returns accordion */}
            <div className="mt-6">
              <UiAccordion
                items={[
                  {
                    title: copy.accordions.delivery,
                    content: (
                      <p data-pdp-delivery>
                        {deliveryShipping} {copy.delivery.body}
                      </p>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        </div>

        {/* 10. Cross-sell */}
        {crossSell.length > 0 ? (
          <section className="ui-reveal mt-20">
            <h2 className="text-2xl md:text-[2rem]">{copy.crossSell}</h2>
            <ul className="mt-8 grid grid-cols-2 gap-x-2 gap-y-8 md:grid-cols-3 md:gap-x-5">
              {crossSell.map((p) => (
                <li key={p.slug}>
                  <CatalogCard product={p} testToken={testToken} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 11. Education sections */}
        {education.length > 0 ? (
          <section className="mt-20 grid gap-6 md:grid-cols-2">
            {education.map((section) => (
              <div key={section.heading} className="ui-reveal rounded-card bg-light-3 p-8 transition-colors duration-300 hover:bg-light-2">
                <h2 className="text-2xl">{section.heading}</h2>
                <p className="mt-3 text-sm leading-6 text-mid-1">{section.body}</p>
              </div>
            ))}
          </section>
        ) : null}

        {/* 12. FAQ + FAQPage JSON-LD */}
        {faqItems.length > 0 ? (
          <section className="ui-reveal mt-20 max-w-(--container-narrow)">
            <h2 className="text-2xl md:text-[2rem]">{copy.faq.title}</h2>
            <div className="mt-6">
              <UiAccordion
                items={faqItems.map((item) => ({
                  title: item.q,
                  content: <p>{item.a}</p>,
                }))}
              />
            </div>
          </section>
        ) : null}

        {/* 13. Reviews section (§10) */}
        <ReviewsSection
          reviews={product.reviews}
          sort={filters.pregled}
          stars={filters.zvezdice}
          photos={filters.foto}
        />

        {/* 14. "Ljudje tudi kupujejo" */}
        {alsoBought.length > 0 ? (
          <section className="ui-reveal mt-20">
            <h2 className="text-2xl md:text-[2rem]">{copy.alsoBought}</h2>
            <ul className="mt-8 grid grid-cols-2 gap-x-2 gap-y-8 md:grid-cols-4 md:gap-x-5">
              {alsoBought.map((p) => (
                <li key={p.slug}>
                  <CatalogCard product={p} testToken={testToken} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* 15. Sticky bottom buy bar — the last child of <main>, so it sticks to the viewport
          bottom while the page scrolls and comes to rest above the footer, never over it */}
      <StickyBuyBar
        klarnaEnabled={klarnaEnabled}
        productSlug={product.slug}
        variantId={variant.id}
        sku={variant.sku}
        title={product.title}
        priceCents={variant.priceCents}
        unitPrice={unitPrice}
        maxQuantity={maxQuantity}
        soldOut={soldOut}
        testToken={testToken}
        imageUrl={product.media[0]?.url ?? null}
        nextHref={bundleBuilderHref}
      />
      <TrackViewItem
        event={buildViewItemEvent({
          sku: variant.sku,
          title: product.title,
          priceCents: variant.priceCents,
        })}
      />
    </>
  );
}
