import Link from "next/link";
import type { HeroSlotSetting } from "@/lib/settings";
import { home } from "@/lib/copy";
import { TrustRow } from "../pdp/TrustRow";
import { UiButton } from "../ui/UiButton";
import { UiIcon } from "../ui/UiIcon";
import { UiPill } from "../ui/UiPill";

export interface HeroTrust {
  /** The standard Slovenian method's estimate, or null when none is configured. */
  estimate: string | null;
  /** Formatted free-shipping threshold, or null when every order ships free. */
  freeThreshold: string | null;
}

/**
 * Hero product-launch slot (§4.1): split layout, Setting-driven content.
 * Video (mobile/desktop crops via <source media>) when D2 assets exist,
 * poster/image fallback otherwise. Optional claim footnote and promo overlay banner.
 * The trust strip under the grid states delivery, threshold, guarantee and
 * payment from live settings. Nothing in the first viewport animates on load:
 * the poster is the LCP element (AGENTS §8.20).
 */
export function HeroSection({ hero, trust }: { hero: HeroSlotSetting | null; trust: HeroTrust }) {
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
          {content.footnote ? (
            // Claim qualifier as LIVE text next to the claim, like the routine banner footnote (§4.4, §12.6).
            <p className="mt-3 max-w-md text-xs leading-5 text-mid-2" data-hero-footnote>
              {content.footnote}
            </p>
          ) : null}
          <div className="mt-8">
            <UiButton variant="primary" href={content.ctaHref} className="group">
              {content.ctaLabel}
              <UiIcon name="arrow-right" className="h-4 w-4 transition-transform duration-300 ease-out-quart group-hover:translate-x-1" />
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

      {/* Trust strip (research 04 §8): the reasons to buy, stated once, from settings */}
      <div className="border-t border-light-3 bg-light-4">
        <div className="mx-auto max-w-(--container-wide) px-(--padding) py-5">
          <TrustRow variant="strip" estimate={trust.estimate} freeThreshold={trust.freeThreshold} />
        </div>
      </div>

      {content.promoOverlayText ? (
        <Link
          href={content.promoOverlayHref ?? "/trgovina"}
          className="group flex items-center justify-center gap-2 bg-brand py-3 text-center text-sm font-medium text-dark-1 transition-opacity hover:opacity-90"
        >
          {content.promoOverlayText}
          <UiIcon name="arrow-right" className="h-4 w-4 transition-transform duration-300 ease-out-quart group-hover:translate-x-1" />
        </Link>
      ) : null}
    </section>
  );
}
