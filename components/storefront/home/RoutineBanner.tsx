import Link from "next/link";
import { home } from "@/lib/copy";

/**
 * Full-width clickable routine-bundle banner (§4.4): legal footnote is LIVE
 * HTML text under the image — selectable, translatable, SEO-visible.
 */
export function RoutineBanner() {
  return (
    <section className="mx-auto max-w-(--container-bleed) px-(--padding) py-16">
      <Link
        href="/izdelek/paket-popolna-rutina"
        aria-label={home.routineBanner.title}
        className="block overflow-hidden rounded-card"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/uploads/placeholder-rutina-wide.svg"
          alt={home.routineBanner.imageAlt}
          loading="lazy"
          className="w-full object-cover transition-transform duration-300 hover:scale-[1.01]"
        />
      </Link>
      <p className="mt-4 text-xs leading-5 text-mid-2">
        {home.routineBanner.footnote}
      </p>
    </section>
  );
}
