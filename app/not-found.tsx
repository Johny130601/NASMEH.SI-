import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound as copy, common } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { RedirectCountdown } from "@/components/storefront/RedirectCountdown";

export const metadata: Metadata = { title: copy.title };

/** 404 (§3.6): copy + auto-redirect countdown to home. */
export default async function NotFound() {
  // Rendered per request, never prerendered: any unknown path of two or more
  // segments lands here (outside the dynamic storefront layout), and a
  // prerendered page carries scripts without the request's nonce — under the
  // enforced 'strict-dynamic' policy every one of them is refused and reported.
  await connection();
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-(--padding)">
      <section className="max-w-md text-center">
        <p className="text-6xl font-light text-brand" aria-hidden="true">
          404
        </p>
        <h1 className="mt-4 text-[2rem]">{copy.title}</h1>
        <p className="mt-3 text-sm text-mid-1">{copy.body}</p>
        <div className="mt-6">
          <RedirectCountdown seconds={10} to="/" />
        </div>
        <div className="mt-8 flex justify-center">
          <UiButton href="/" variant="primary">
            {copy.cta}
          </UiButton>
        </div>
        <p className="sr-only">{common.siteName}</p>
      </section>
    </main>
  );
}
