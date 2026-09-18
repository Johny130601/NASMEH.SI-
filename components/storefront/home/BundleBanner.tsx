import Link from "next/link";
import type { BundleBannerSetting } from "@/lib/settings";
import { uiButtonClasses } from "../ui/UiButton";
import { UiIcon } from "../ui/UiIcon";

/**
 * Full-width brand-color bundle banner (§4.3); copy from Setting home.bundleBanner.
 * An ambient highlight drifts across the block (.ui-glow) and the CTA is a
 * white pill: dark text on white reads at full contrast, which the earlier
 * white-on-brand link did not (Phase 9 step 2 marquee finding).
 */
export function BundleBanner({ banner }: { banner: BundleBannerSetting }) {
  return (
    <section className="ui-glow ui-reveal bg-brand">
      <div className="mx-auto flex max-w-(--container-wide) flex-col items-center gap-6 px-(--padding) py-14 text-center">
        <h2 className="text-2xl text-white md:text-[2rem]">
          {banner.title}
        </h2>
        <Link
          href={banner.href}
          className={uiButtonClasses("outline", false, "group border-transparent shadow-card-hover")}
        >
          {banner.cta}
          <UiIcon name="arrow-right" className="h-4 w-4 transition-transform duration-300 ease-out-quart group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}
