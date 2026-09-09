import type { Metadata } from "next";
import { getCatalogProducts } from "@/lib/catalog";
import { getOmnibusLowestCents } from "@/lib/omnibus";
import { getSetting, SETTING_KEYS, type HeroSlotSetting } from "@/lib/settings";
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
  const [hero, products] = await Promise.all([
    getSetting<HeroSlotSetting>(SETTING_KEYS.homeHero),
    getCatalogProducts(),
  ]);
  const rail = products.slice(0, 4);

  // Omnibus lines for discounted cards
  const omnibusBySlug = new Map<string, number>();
  for (const product of rail) {
    if (
      product.compareAtPriceCents !== null &&
      product.compareAtPriceCents > product.priceCents
    ) {
      const lowest = await getOmnibusLowestCents(product.variantId);
      if (lowest !== null) omnibusBySlug.set(product.slug, lowest);
    }
  }

  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  return (
    <>
      {/* §4.1 hero product-launch slot */}
      <HeroSection hero={hero} />

      {/* §4.2 "Naše uspešnice" rail */}
      <section
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
                  omnibusLowestCents={omnibusBySlug.get(product.slug) ?? null}
                  testToken={testToken}
                />
              ))}
            </UiCarousel>
          </div>
        )}
      </section>

      {/* §4.3 bundle banner */}
      <BundleBanner />

      {/* §4.4 full-width routine-bundle banner + live-HTML footnote */}
      <RoutineBanner />
    </>
  );
}
