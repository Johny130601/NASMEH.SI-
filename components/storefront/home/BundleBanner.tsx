import Link from "next/link";
import type { BundleBannerSetting } from "@/lib/settings";

/** Full-width brand-color bundle banner (§4.3); copy from Setting home.bundleBanner. */
export function BundleBanner({ banner }: { banner: BundleBannerSetting }) {
  return (
    <section className="bg-brand">
      <div className="mx-auto flex max-w-(--container-wide) flex-col items-center gap-4 px-(--padding) py-14 text-center">
        <h2 className="text-2xl text-white md:text-[2rem]">
          {banner.title}
        </h2>
        <Link
          href={banner.href}
          className="text-base font-medium text-white underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          {banner.cta}
        </Link>
      </div>
    </section>
  );
}
