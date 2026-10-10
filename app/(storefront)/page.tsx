import type { Metadata } from "next";
import Link from "next/link";
import { getCatalogProducts } from "@/lib/catalog";
import { getSetting, getShippingSettings, SETTING_KEYS, type BundleBannerSetting, type HeroSlotSetting, type RoutineBannerSetting } from "@/lib/settings";
import { bundleBannerWithDefaults, normaliseHomeSections, routineBannerWithDefaults } from "@/lib/admin/cms";
import { heroWithAvailableLinks, linkIsAvailable, linkedProductSlug, productSlugsIn, purchasableSlugs } from "@/lib/content-links";
import { formatEUR, standardShippingMethod } from "@/lib/pricing";
import { getHomeReviews } from "@/lib/reviews/home";
import { isTestMode } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { home } from "@/lib/copy";
import { HeroSection } from "@/components/storefront/home/HeroSection";
import { BundleBanner } from "@/components/storefront/home/BundleBanner";
import { HomeReviews } from "@/components/storefront/home/HomeReviews";
import { RoutineBanner } from "@/components/storefront/home/RoutineBanner";
import { CatalogCard } from "@/components/storefront/catalog/CatalogCard";
import { UiCarousel } from "@/components/storefront/ui/UiCarousel";
import { uiButtonClasses } from "@/components/storefront/ui/UiButton";
import { UiIcon } from "@/components/storefront/ui/UiIcon";

// SSR by design (AGENTS §5.1): copy, prices and config render in initial HTML.
export const dynamic = "force-dynamic";

const homeMetadata = buildMetadata({ title: home.seo.title, description: home.seo.description, path: "" });
// Absolute: the site template would otherwise append the store name a second time (QA L1).
export const metadata: Metadata = { ...homeMetadata, title: { absolute: home.seo.title } };

export default async function HomePage() {
  const [hero, products, sectionSetting, bundleSetting, routineSetting, shipping, reviews] = await Promise.all([
    getSetting<HeroSlotSetting>(SETTING_KEYS.homeHero),
    getCatalogProducts(),
    getSetting<unknown>(SETTING_KEYS.homeSections),
    getSetting<BundleBannerSetting>(SETTING_KEYS.homeBundleBanner),
    getSetting<RoutineBannerSetting>(SETTING_KEYS.homeRoutineBanner),
    getShippingSettings(),
    // null below three published reviews: the grid is then absent, never thin
    getHomeReviews(),
  ]);
  const sections = normaliseHomeSections(sectionSetting).filter((section) => section.visible);
  const bundleBanner = bundleBannerWithDefaults(bundleSetting);
  const routineBanner = routineBannerWithDefaults(routineSetting);
  // No block links to a product page that answers 404 (QA v-a): a banner for a product nobody can
  // buy is left out; the hero's button leads to the shop instead and such a promo line is dropped.
  const heroSetting = hero && typeof hero === "object" ? hero : null;
  const purchasable = await purchasableSlugs(
    productSlugsIn([heroSetting?.ctaHref, heroSetting?.promoOverlayHref, bundleBanner.href, routineBanner.href]),
  );
  const heroContent = heroSetting ? heroWithAvailableLinks(heroSetting, purchasable) : null;
  // the hero trust strip reads the same shipping Setting as the PDP delivery accordion
  const trust = {
    estimate: standardShippingMethod(shipping.methods, shipping.standardCostCents)?.estimate.trim() || null,
    freeThreshold: shipping.freeThresholdCents > 0 ? formatEUR(shipping.freeThresholdCents) : null,
  };
  // cards carry their Omnibus-backed reduction from getCatalogProducts
  const rail = products.slice(0, 4);
  // The price beside the hero's button is the listed price of the product it links to —
  // computed from the catalog, never typed into the Setting (AGENTS §8.23).
  const heroProduct = heroContent ? products.find((product) => product.slug === linkedProductSlug(heroContent.ctaHref)) ?? null : null;
  const heroPrice = heroProduct ? formatEUR(heroProduct.priceCents) : null;
  // The routine block is a bundle card when its link is a bundle the catalog lists (components, price
  // and value line computed), otherwise the clickable image banner.
  const routineProduct = products.find((product) => product.isBundle && product.slug === linkedProductSlug(routineBanner.href)) ?? null;
  const routineBundle = routineProduct && routineProduct.bundleComponents.length > 0 ? routineProduct : null;

  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  // §4 sections in the order and visibility set in /admin/vsebina/domov.
  const rendered = {
    hero: <HeroSection key="hero" hero={heroContent} trust={trust} price={heroPrice} />,
    rail: (
      <section
        key="rail"
        id="izdelki"
        className="ui-reveal mx-auto max-w-(--container-wide) px-(--padding) py-16"
      >
        {/* heading, subline and the link to the whole shop in one left column (research 06 §4 rail header);
            the carousel's own controls keep the right edge above the track */}
        <div className="flex flex-col items-start gap-4">
          <div>
            <h2 className="text-2xl md:text-[2rem]">{home.rail.title}</h2>
            <p className="mt-2 max-w-md text-sm text-mid-1">{home.rail.subtitle}</p>
          </div>
          <Link href="/trgovina" className={uiButtonClasses("outline", false, "group !h-11 w-fit px-6 text-sm")} data-rail-all>
            {home.rail.shopAll}
            <UiIcon name="arrow-right" className="h-4 w-4 transition-transform duration-300 ease-out-quart group-hover:translate-x-1" />
          </Link>
        </div>
        {rail.length === 0 ? (
          <p className="mt-6 text-mid-2">{home.rail.empty}</p>
        ) : (
          <div className="mt-8">
            <UiCarousel label={home.rail.carouselLabel}>
              {rail.map((product) => (
                // the slide sets the card width (research 06 §4 rail: 262 → 300 px)
                <div key={product.slug} className="w-[15rem] shrink-0 snap-start md:w-[17rem]">
                  <CatalogCard product={product} testToken={testToken} />
                </div>
              ))}
            </UiCarousel>
          </div>
        )}
      </section>
    ),
    bundleBanner: linkIsAvailable(bundleBanner.href, purchasable) ? <BundleBanner key="bundleBanner" banner={bundleBanner} /> : null,
    routineBanner: linkIsAvailable(routineBanner.href, purchasable) ? (
      <RoutineBanner key="routineBanner" banner={routineBanner} bundle={routineBundle} testToken={testToken} />
    ) : null,
    reviews: reviews ? <HomeReviews key="reviews" data={reviews} /> : null,
  };

  // The hero carries the page's <h1>; with the hero hidden the page keeps one for its outline (QA T7-F15).
  const heroShown = sections.some((section) => section.id === "hero");
  return (
    <>
      {heroShown ? null : <h1 className="sr-only">{home.seo.heading}</h1>}
      {sections.map((section) => rendered[section.id])}
    </>
  );
}
