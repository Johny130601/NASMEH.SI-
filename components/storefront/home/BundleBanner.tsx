import Link from "next/link";
import { home } from "@/lib/copy";

/** Full-width brand-color bundle banner (§4.3). */
export function BundleBanner() {
  return (
    <section className="bg-brand">
      <div className="mx-auto flex max-w-(--container-wide) flex-col items-center gap-4 px-(--padding) py-14 text-center">
        <h2 className="text-2xl text-white md:text-[2rem]">
          {home.bundleBanner.title}
        </h2>
        <Link
        href="/trgovina?kolekcija=paketi"
          className="text-base font-medium text-white underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          {home.bundleBanner.cta}
        </Link>
      </div>
    </section>
  );
}
