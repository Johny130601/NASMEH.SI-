import type { Metadata } from "next";
import { getSeoDefaults } from "@/lib/settings";
import { notFound as copy, common } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { DocumentTitle } from "@/components/storefront/ui/DocumentTitle";
import { RedirectCountdown } from "@/components/storefront/RedirectCountdown";

export const metadata: Metadata = { title: copy.title };

/** Storefront 404 (§3.6): copy + auto-redirect countdown to home, which the visitor can stop. */
export default async function StorefrontNotFound() {
  // The same "%s | Nasmeh.si" template the metadata applies, so the title stays after hydration (QA T1-15).
  const { titleTemplate } = await getSeoDefaults();
  const title = titleTemplate.includes("%s") ? titleTemplate.replace("%s", copy.title) : copy.title;
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-(--padding) text-center">
      <DocumentTitle title={title} />
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
  );
}
