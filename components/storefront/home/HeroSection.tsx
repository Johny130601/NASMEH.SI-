import Link from "next/link";
import type { HeroSlotSetting } from "@/lib/settings";
import { home } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { UiPill } from "../ui/UiPill";

/**
 * Hero product-launch slot (§4.1): split layout, Setting-driven content.
 * Video (mobile/desktop crops via <source media>) when D2 assets exist,
 * poster/image fallback otherwise. Optional promo overlay banner.
 */
export function HeroSection({ hero }: { hero: HeroSlotSetting | null }) {
  const content = hero ?? {
    title: home.hero.title,
    subtitle: home.hero.subtitle,
    ctaLabel: home.hero.cta,
    ctaHref: "#izdelki",
    kicker: home.hero.kicker,
  } satisfies HeroSlotSetting;

  return (
    <section className="border-b border-light-3 bg-white">
      <div className="mx-auto grid max-w-(--container-wide) items-center gap-8 px-(--padding) py-12 md:grid-cols-2 md:py-20">
        <div>
          {content.kicker ? (
            <UiPill variant="brand" className="mb-6">
              {content.kicker}
            </UiPill>
          ) : null}
          <h1 className="text-[2rem] md:text-[3rem]">{content.title}</h1>
          <p className="mt-4 max-w-md text-base text-mid-1">{content.subtitle}</p>
          <div className="mt-8">
            <UiButton variant="primary" href={content.ctaHref}>
              {content.ctaLabel}
            </UiButton>
          </div>
        </div>

        <div className="relative">
          {content.videoDesktop ? (
            <video
              autoPlay
              muted
              loop
              playsInline
              poster={content.poster}
              aria-label={content.imageAlt ?? home.hero.mediaAlt}
              className="aspect-[4/5] w-full rounded-card object-cover"
            >
              {content.videoMobile ? (
                <source src={content.videoMobile} media="(width < 768px)" />
              ) : null}
              <source src={content.videoDesktop} media="(width >= 768px)" />
            </video>
          ) : content.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={content.poster}
              alt={content.imageAlt ?? home.hero.mediaAlt}
              fetchPriority="high"
              className="aspect-[4/5] w-full rounded-card object-cover"
            />
          ) : (
            <div aria-hidden="true" className="aspect-[4/5] w-full rounded-card bg-light-3" />
          )}
        </div>
      </div>

      {content.promoOverlayText ? (
        <Link
          href={content.promoOverlayHref ?? "/trgovina"}
          className="block bg-brand py-3 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {content.promoOverlayText}
        </Link>
      ) : null}
    </section>
  );
}
