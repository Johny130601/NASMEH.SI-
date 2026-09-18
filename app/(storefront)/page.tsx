import type { Metadata } from "next";
import { getCatalogProducts } from "@/lib/catalog";
import { getSetting, getShippingSettings, SETTING_KEYS, type BundleBannerSetting, type HeroSlotSetting, type RoutineBannerSetting } from "@/lib/settings";
import { bundleBannerWithDefaults, normaliseHomeSections, routineBannerWithDefaults } from "@/lib/admin/cms";
import { formatEUR, standardShippingMethod } from "@/lib/pricing";
import { isTestMode } from "@/lib/turnstile";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/lib/seo";
import { common, home } from "@/lib/copy";
import { HeroSection } from "@/components/storefront/home/HeroSection";
import { BundleBanner } from "@/components/storefront/home/BundleBanner";
import { RoutineBanner } from "@/components/storefront/home/RoutineBanner";
import { CatalogCard } from "@/components/storefront/catalog/CatalogCard";
import { UiCarousel } from "@/components/storefront/ui/UiCarousel";

// SSR by design (AGENTS §5.1): copy, prices and config render in initial HTML.
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: common.siteName,
  description: common.siteTagline,
  path: "",
});

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
    hero: <HeroSection key="hero" hero={hero} trust={trust} />,
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
    bundleBanner: <BundleBanner key="bundleBanner" banner={bundleBanner} />,
    routineBanner: <RoutineBanner key="routineBanner" banner={routineBanner} />,
  };

  return <>{sections.map((section) => rendered[section.id])}</>;
}
