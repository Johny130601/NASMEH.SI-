import type { Metadata } from "next";
import { getCatalogProducts } from "@/lib/catalog";
import { getSetting, getShippingSettings, SETTING_KEYS, type BundleBannerSetting, type HeroSlotSetting, type RoutineBannerSetting } from "@/lib/settings";
import { bundleBannerWithDefaults, normaliseHomeSections, routineBannerWithDefaults } from "@/lib/admin/cms";
import { heroWithAvailableLinks, linkIsAvailable, productSlugsIn, purchasableSlugs } from "@/lib/content-links";
import { formatEUR, standardShippingMethod } from "@/lib/pricing";
import { isTestMode } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { home } from "@/lib/copy";
import { HeroSection } from "@/components/storefront/home/HeroSection";
import { BundleBanner } from "@/components/storefront/home/BundleBanner";
import { RoutineBanner } from "@/components/storefront/home/RoutineBanner";
import { CatalogCard } from "@/components/storefront/catalog/CatalogCard";
import { UiCarousel } from "@/components/storefront/ui/UiCarousel";

// SSR by design (AGENTS §5.1): copy, prices and config render in initial HTML.
export const dynamic = "force-dynamic";

const homeMetadata = buildMetadata({ title: home.seo.title, description: home.seo.description, path: "" });
// Absolute: the site template would otherwise append the store name a second time (QA L1).
export const metadata: Metadata = { ...homeMetadata, title: { absolute: home.seo.title } };

export default async function HomePage() {
  const [hero, products, sectionSetting, bundleSetting, routineSetting, shipping] = await Promise.all([
    getSetting<HeroSlotSetting>(SETTING_KEYS.homeHero),
    getCatalogProducts(),
    getSetting<unknown>(SETTING_KEYS.homeSections),
    getSetting<BundleBannerSetting>(SETTING_KEYS.homeBundleBanner),
    getSetting<RoutineBannerSetting>(SETTING_KEYS.homeRoutineBanner),
    getShippingSettings(),
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

  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  // §4 sections in the order and visibility set in /admin/vsebina/domov.
  const rendered = {
    hero: <HeroSection key="hero" hero={heroContent} trust={trust} />,
    rail: (
      <section
        key="rail"
        id="izdelki"
        className="ui-reveal mx-auto max-w-(--container-wide) px-(--padding) py-16"
      >
        <h2 className="text-2xl md:text-[2rem]">{home.rail.title}</h2>
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
    routineBanner: linkIsAvailable(routineBanner.href, purchasable) ? <RoutineBanner key="routineBanner" banner={routineBanner} /> : null,
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
