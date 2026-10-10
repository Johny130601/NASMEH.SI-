import Link from "next/link";
import type { BundleBannerSetting } from "@/lib/settings";
import { uiButtonClasses } from "../ui/UiButton";
import { UiIcon } from "../ui/UiIcon";

/**
 * Brand-colour bundle band (§4.3); copy from Setting home.bundleBanner. Since
 * the 2026-10-10 redesign it is a rounded panel inside the page width rather
 * than a full-bleed strip. An ambient highlight drifts across the block
 * (.ui-glow) and the CTA is a white pill: dark text on white reads at full
 * contrast, which the earlier white-on-brand link did not (Phase 9 step 2
 * marquee finding).
 */
export function BundleBanner({ banner }: { banner: BundleBannerSetting }) {
  return (
    <section className="ui-reveal mx-auto max-w-(--container-wide) px-(--padding) py-4" data-bundle-banner>
      <div className="ui-glow rounded-panel bg-brand px-6 py-12 text-center md:py-16">
        <h2 className="text-3xl font-semibold text-white md:text-[2.5rem]">
          {banner.title}
        </h2>
        <Link
          href={banner.href}
          className={uiButtonClasses("light", false, "group ui-shine mt-7")}
        >
          {banner.cta}
          <UiIcon name="arrow-right" className="h-4 w-4 transition-transform duration-300 ease-out-quart group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}
