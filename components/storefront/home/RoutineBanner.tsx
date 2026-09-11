import Link from "next/link";
import type { RoutineBannerSetting } from "@/lib/settings";

/**
 * Full-width clickable routine-bundle banner (§4.4): legal footnote is LIVE
 * HTML text under the image — selectable, translatable, SEO-visible.
 * Copy and image come from Setting home.routineBanner.
 */
export function RoutineBanner({ banner }: { banner: RoutineBannerSetting }) {
  return (
    <section className="mx-auto max-w-(--container-bleed) px-(--padding) py-16">
      <Link
        href={banner.href}
        aria-label={banner.title}
        className="block overflow-hidden rounded-card"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={banner.image}
          alt={banner.imageAlt}
          loading="lazy"
          className="w-full object-cover transition-transform duration-300 hover:scale-[1.01]"
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
