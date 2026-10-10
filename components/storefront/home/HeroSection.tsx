import Link from "next/link";
import type { HeroSlotSetting } from "@/lib/settings";
import { home } from "@/lib/copy/home";
import { trust as trustCopy } from "@/lib/copy/pdp";
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

const MEDIA_CLASSES = "aspect-[4/5] w-full object-cover transition-transform duration-500 ease-out-quart group-hover:scale-[1.02]";

/** The poster (the LCP element, never lazy) or the neutral placeholder. */
function HeroStill({ poster, alt }: { poster?: string | null; alt: string }) {
  return poster ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={poster} alt={alt} fetchPriority="high" className={MEDIA_CLASSES} />
  ) : (
    <div aria-hidden="true" className="aspect-[4/5] w-full bg-light-3" />
  );
}

/**
 * Hero product-launch slot (§4.1): split layout, Setting-driven content.
 * Video (mobile/desktop crops via <source media>) when D2 assets exist,
 * poster/image fallback otherwise. Optional claim footnote and promo overlay banner.
 *
 * Home redesign (2026-10-10): the headline is set bold and uppercase with an
 * optional brand-coloured second line (`titleAccent`), the section sits on a
 * static brand-tinted backdrop, the CTA row states the linked product's price
 * (computed by the page from the catalog, never typed) and the guarantee line
 * sits under it. The trust strip under the grid states delivery, threshold,
 * guarantee and payment from live settings. Nothing in the first viewport
 * animates on load: the poster is the LCP element (AGENTS §8.20); the media
 * frame only zooms on hover and the CTA's shine answers a hover.
 */
export function HeroSection({
  hero,
  trust,
  price = null,
}: {
  hero: HeroSlotSetting | null;
  trust: HeroTrust;
  /** Formatted price of the product the CTA links to, when it is one the catalog lists. */
  price?: string | null;
}) {
  const content = hero ?? {
    title: home.hero.title,
    subtitle: home.hero.subtitle,
    ctaLabel: home.hero.cta,
    ctaHref: "#izdelki",
    kicker: home.hero.kicker,
  } satisfies HeroSlotSetting;
  const alt = content.imageAlt ?? home.hero.mediaAlt;

  return (
    <section className="ui-hero-bg border-b border-light-3">
      <div className="mx-auto grid max-w-(--container-wide) items-center gap-10 px-(--padding) py-12 md:grid-cols-[1.05fr_1fr] md:gap-12 md:py-20">
        <div>
          {content.kicker ? (
            <UiPill variant="brand" className="mb-6 uppercase tracking-[0.08em]">
              {content.kicker}
            </UiPill>
          ) : null}
          <h1 className="text-[2.5rem] font-bold uppercase leading-[1.02] tracking-[-0.035em] text-dark-1 md:text-[3.5rem] lg:text-[4rem]">
            {content.title}
            {content.titleAccent ? (
              <span className="block text-brand" data-hero-accent>
                {content.titleAccent}
              </span>
            ) : null}
          </h1>
          <p className="mt-5 max-w-md text-base text-mid-1 md:text-lg">{content.subtitle}</p>
          {content.footnote ? (
            // Claim qualifier as LIVE text next to the claim, like the routine banner footnote (§4.4, §12.6).
            <p className="mt-3 max-w-md text-xs leading-5 text-mid-2" data-hero-footnote>
              {content.footnote}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <UiButton variant="primary" href={content.ctaHref} className="group ui-shine">
              {content.ctaLabel}
              <UiIcon name="arrow-right" className="h-4 w-4 transition-transform duration-300 ease-out-quart group-hover:translate-x-1" />
            </UiButton>
            {price ? (
              <p className="text-xl font-semibold text-brand" data-hero-price>
                {price} <span className="text-xs font-normal text-mid-2">{home.vatIncluded}</span>
              </p>
            ) : null}
          </div>
          {/* the guarantee, right under the action (research 04 §8); its terms page is one click away */}
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-dark-1" data-hero-guarantee>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-btn bg-success/15 text-success">
              <UiIcon name="check" className="h-3.5 w-3.5" />
            </span>
            <Link href={trustCopy.guaranteeHref} className="underline-offset-2 hover:underline">
              {trustCopy.guarantee}
            </Link>
          </p>
        </div>

        <div className="group ui-halo">
          <div className="overflow-hidden rounded-panel shadow-card">
            {content.videoDesktop ? (
              <video
                autoPlay
                muted
                loop
                playsInline
                poster={content.poster}
                aria-label={alt}
                className={MEDIA_CLASSES}
              >
                {content.videoMobile ? (
                  <source src={content.videoMobile} media="(width < 768px)" />
                ) : null}
                <source src={content.videoDesktop} media="(width >= 768px)" />
              </video>
            ) : content.videoMobile ? (
              // Only a phone crop is set (QA T7-F13): phones play it, wider screens keep the still.
              <>
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster={content.poster}
                  aria-label={alt}
                  className={`${MEDIA_CLASSES} md:hidden`}
                  data-hero-video="mobile"
                >
                  <source src={content.videoMobile} media="(width < 768px)" />
                </video>
                <div className="max-md:hidden">
                  <HeroStill poster={content.poster} alt={alt} />
                </div>
              </>
            ) : (
              <HeroStill poster={content.poster} alt={alt} />
            )}
          </div>
        </div>
      </div>

      {/* Trust strip (research 04 §8): the reasons to buy, stated once, from settings */}
      <div className="border-t border-light-3 bg-white">
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
