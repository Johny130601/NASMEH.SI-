import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCatalogProducts, parseBadges } from "@/lib/catalog";
import { getOmnibusLowestCents } from "@/lib/omnibus";
import {
  formatEUR,
  formatUnitPrice,
  klarnaInstallmentCents,
  bundleSavings,
} from "@/lib/pricing";
import { getFreeThresholdCents } from "@/lib/settings";
import { isTestMode } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { pdp as copy, common } from "@/lib/copy";
import { UiAccordion } from "@/components/storefront/ui/UiAccordion";
import { UiPill } from "@/components/storefront/ui/UiPill";
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

async function getProduct(slug: string) {
  return db.product.findFirst({
    where: { slug, status: "ACTIVE" },
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
  const hidden = product.soldOutBehavior === "HIDE" && !product.variants.some((variant) => variant.stock > 0 || variant.allowBackorder);
  return buildMetadata({
    title: product.seoTitle ?? product.title,
    description: product.seoDescription ?? product.description,
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
  const badges = parseBadges(product.badges);
  const soldOut = variant.stock <= 0 && !variant.allowBackorder;
  const backorder = variant.stock <= 0 && variant.allowBackorder;
  const discounted =
    variant.compareAtPriceCents !== null &&
    variant.compareAtPriceCents > variant.priceCents;

  const [omnibusLowest, thresholdCents, reviewAggregate, crossSellProducts] =
    await Promise.all([
      discounted ? getOmnibusLowestCents(variant.id) : Promise.resolve(null),
      getFreeThresholdCents(),
      Promise.resolve(aggregateRatings(product.reviews.map((review) => review.rating))),
      getCatalogProducts().then((all) =>
        all.filter((p) => p.slug !== product.slug),
      ),
    ]);

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
    description: product.seoDescription ?? product.description,
    image: product.media.map((m) => `${base}${m.url}`),
    brand: { "@type": "Brand", name: common.siteName },
    offers: {
      "@type": "Offer",
      url: `${base}/izdelek/${product.slug}`,
      priceCurrency: "EUR",
      price: (variant.priceCents / 100).toFixed(2),
      availability: soldOut
        ? "https://schema.org/OutOfStock"
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

  const accordionItems = [
    { key: "howItWorks", title: copy.accordions.howItWorks },
    { key: "inci", title: copy.accordions.inci },
    { key: "guarantee", title: copy.accordions.guarantee },
    { key: "tested", title: copy.accordions.tested },
  ]
    .filter((item) => accordionBodies[item.key])
    .map((item) => ({
      title: item.title,
      content: (
        <div
          className="content-prose"
          dangerouslySetInnerHTML={{ __html: accordionBodies[item.key] }}
        />
      ),
    }));

  const bundle = product.bundle;
  const savings = bundle
    ? bundleSavings(
        bundle.items.map((item) => item.variant.priceCents * item.quantity),
        bundle.priceCents,
      )
    : null;

  return (
    <>
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd} />
      {faqLd ? <JsonLd data={faqLd} /> : null}

      <div className="mx-auto max-w-(--container-wide) px-(--padding) pb-32 pt-6">
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
          {/* 2. Portrait gallery (0.6875:1), first image fetchpriority=high */}
          <div className="flex flex-col gap-4">
            {product.media.length === 0 ? (
              <div aria-hidden="true" className="aspect-[0.6875] w-full rounded-card bg-light-3" />
            ) : (
              product.media.map((image, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.id}
                  src={image.url}
                  alt={image.alt}
                  width={880}
                  height={1280}
                  {...(index === 0
                    ? { fetchPriority: "high" }
                    : { loading: "lazy" })}
                  className="aspect-[0.6875] w-full rounded-card bg-light-3 object-cover"
                />
              ))
            )}
          </div>

          <div>
            {/* 3. Badge + H1 */}
            <div className="flex flex-wrap items-center gap-2">
              {soldOut ? (
                <BadgePill badge={{ label: "Razprodano", style: "grey" }} />
              ) : null}
              {badges.map((badge) => (
                <BadgePill key={badge.label} badge={badge} />
              ))}
            </div>
            <h1 className="mt-3 text-[2rem] md:text-[2.5rem]">{product.title}</h1>

            {/* 4. Rating summary */}
            <div className="mt-2">
              <RatingStars rating={rating} />
              {rating ? (
                <a href="#mnenja" className="ml-2 text-xs text-mid-2 underline underline-offset-2">
                  ({rating.count})
                </a>
              ) : null}
            </div>

            {/* 5. USP chips (max 3) */}
            {cf.uspChips?.length ? (
              <ul className="mt-5 flex flex-wrap gap-2">
                {cf.uspChips.slice(0, 3).map((chip) => (
                  <li key={chip}>
                    <UiPill variant="neutral">{chip}</UiPill>
                  </li>
                ))}
              </ul>
            ) : null}

            {/* 6. Intro + checkmark bullets */}
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

            {/* 7. Accordion set #1 — server-rendered bodies (asterisk claims resolve here) */}
            {accordionItems.length > 0 ? (
              <div className="mt-8">
                <UiAccordion items={accordionItems} />
              </div>
            ) : null}

            {/* Bundle components + savings (§6.6) */}
            {bundle && savings ? (
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
                <p className="mt-4 border-t border-light-3 pt-3 text-sm font-medium text-dark-1">
                  {copy.bundle.savingsLine} {formatEUR(savings.valueCents)}{" "}
                  {copy.bundle.savingsSave} {savings.savingsPercent} %
                </p>
              </div>
            ) : null}

            {/* 8. Buy box */}
            <div className="mt-8 rounded-card border border-light-2 bg-white p-5">
              <p className="text-2xl text-dark-1">
                {discounted ? (
                  <span className="mr-2 text-base text-mid-2 line-through">
                    {formatEUR(variant.compareAtPriceCents!)}
                  </span>
                ) : null}
                {formatEUR(variant.priceCents)}{" "}
                <span className="text-sm text-mid-2">{copy.buyBox.vatIncluded}</span>
              </p>
              {discounted && omnibusLowest !== null ? (
                <p className="mt-1 text-xs text-mid-2">
                  {copy.buyBox.omnibusPrefix}: {formatEUR(omnibusLowest)}
                </p>
              ) : null}
              {cf.unitPrice ? (
                <p className="mt-1 text-xs text-mid-2">
                  (
                  {formatUnitPrice(
                    variant.priceCents,
                    cf.unitPrice.quantity,
                    cf.unitPrice.unit,
                  )}
                  )
                </p>
              ) : null}
              {backorder ? (
                <p className="mt-2 text-sm text-warning" data-backorder-note>{copy.buyBox.backorder}{variant.backorderNote ? ` ${variant.backorderNote}` : ""}</p>
              ) : null}
              {!soldOut && product.klarnaEligible && env.STRIPE_KLARNA_ENABLED === "true" ? (
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
                  maxQuantity={variant.maxCartQuantity}
                  soldOut={soldOut}
                  testToken={testToken}
                />
              </div>
            </div>

            {/* 9. Delivery & returns accordion */}
            <div className="mt-6">
              <UiAccordion
                items={[
                  {
                    title: copy.accordions.delivery,
                    content: (
                      <p>
                        {copy.delivery.body.replace(
                          "45 €",
                          `${formatEUR(thresholdCents ?? 4500)}`,
                        )}
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
          <section className="mt-20">
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
              <div key={section.heading} className="rounded-card bg-light-3 p-8">
                <h2 className="text-2xl">{section.heading}</h2>
                <p className="mt-3 text-sm leading-6 text-mid-1">{section.body}</p>
              </div>
            ))}
          </section>
        ) : null}

        {/* 12. FAQ + FAQPage JSON-LD */}
        {faqItems.length > 0 ? (
          <section className="mt-20 max-w-(--container-narrow)">
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
          <section className="mt-20">
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

      {/* 15. Sticky bottom buy bar */}
      <StickyBuyBar
        klarnaEnabled={product.klarnaEligible && env.STRIPE_KLARNA_ENABLED === "true"}
        productSlug={product.slug}
        variantId={variant.id}
        sku={variant.sku}
        title={product.title}
        priceCents={variant.priceCents}
        soldOut={soldOut}
        testToken={testToken}
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
