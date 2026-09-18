import Link from "next/link";
import type { RoutineBannerSetting } from "@/lib/settings";

/**
 * Full-width clickable routine-bundle banner (§4.4): legal footnote is LIVE
 * HTML text under the image — selectable, translatable, SEO-visible.
 * Copy and image come from Setting home.routineBanner. Reveals on scroll;
 * the artwork zooms slightly inside its clipped frame on hover.
 */
export function RoutineBanner({ banner }: { banner: RoutineBannerSetting }) {
  return (
    <section className="ui-reveal mx-auto max-w-(--container-bleed) px-(--padding) py-16">
      <Link
        href={banner.href}
        aria-label={banner.title}
        className="group block overflow-hidden rounded-card shadow-card transition-shadow duration-300 ease-out-quart hover:shadow-card-hover"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={banner.image}
          alt={banner.imageAlt}
          loading="lazy"
          className="w-full object-cover transition-transform duration-700 ease-out-quart group-hover:scale-[1.02]"
        />
      </Link>
      {banner.footnote ? (
        <p className="mt-4 text-xs leading-5 text-mid-2">
          {banner.footnote}
        </p>
      ) : null}
    </section>
  );
}
