import type { Metadata } from "next";
import { getCatalogProducts } from "@/lib/catalog";
import { getSetting, SETTING_KEYS, type BundleBannerSetting, type HeroSlotSetting, type RoutineBannerSetting } from "@/lib/settings";
import { bundleBannerWithDefaults, normaliseHomeSections, routineBannerWithDefaults } from "@/lib/admin/cms";
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
  const [hero, products, sectionSetting, bundleSetting, routineSetting] = await Promise.all([
    getSetting<HeroSlotSetting>(SETTING_KEYS.homeHero),
    getCatalogProducts(),
    getSetting<unknown>(SETTING_KEYS.homeSections),
    getSetting<BundleBannerSetting>(SETTING_KEYS.homeBundleBanner),
    getSetting<RoutineBannerSetting>(SETTING_KEYS.homeRoutineBanner),
  ]);
  const sections = normaliseHomeSections(sectionSetting).filter((section) => section.visible);
  const bundleBanner = bundleBannerWithDefaults(bundleSetting);
  const routineBanner = routineBannerWithDefaults(routineSetting);
  // cards carry their Omnibus-backed reduction from getCatalogProducts
  const rail = products.slice(0, 4);

  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  // §4 sections in the order and visibility set in /admin/vsebina/domov.
  const rendered = {
    hero: <HeroSection key="hero" hero={hero} />,
    rail: (
      <section
        key="rail"
        id="izdelki"
        className="mx-auto max-w-(--container-wide) px-(--padding) py-16"
      >
        <h2 className="text-2xl md:text-[2rem]">{home.rail.title}</h2>
        {rail.length === 0 ? (
          <p className="mt-6 text-mid-2">{home.rail.empty}</p>
        ) : (
          <div className="mt-8">
            <UiCarousel label={home.rail.carouselLabel}>
              {rail.map((product) => (
                <CatalogCard
                  key={product.slug}
                  product={product}
                  testToken={testToken}
                />
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
