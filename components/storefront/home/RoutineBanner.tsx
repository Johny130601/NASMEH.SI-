import Link from "next/link";
import type { RoutineBannerSetting } from "@/lib/settings";

/**
 * Full-width clickable routine-bundle banner (§4.4): legal footnote is LIVE
 * HTML text under the image — selectable, translatable, SEO-visible.
 * Copy and image come from Setting home.routineBanner. Reveals on scroll;
 * the artwork zooms slightly inside its clipped frame on hover, and the lift
 * shadow fades in on a pseudo-element — opacity and transform only, within
 * .2–.5 s (AGENTS §8.23, QA L5).
 */
export function RoutineBanner({ banner }: { banner: RoutineBannerSetting }) {
  return (
    <section className="ui-reveal mx-auto max-w-(--container-bleed) px-(--padding) py-16">
      <Link
        href={banner.href}
        aria-label={banner.title}
        className="group relative block rounded-card shadow-card after:pointer-events-none after:absolute after:inset-0 after:rounded-card after:opacity-0 after:shadow-card-hover after:transition-opacity after:duration-300 after:ease-out-quart hover:after:opacity-100"
      >
        <div className="overflow-hidden rounded-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={banner.image}
            alt={banner.imageAlt}
            loading="lazy"
            className="w-full object-cover transition-transform duration-500 ease-out-quart group-hover:scale-[1.02]"
          />
        </div>
      </Link>
      {banner.footnote ? (
        <p className="mt-4 text-xs leading-5 text-mid-2">
          {banner.footnote}
        </p>
      ) : null}
    </section>
  );
}
