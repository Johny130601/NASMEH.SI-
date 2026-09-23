import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { loadBundleBuilder } from "@/lib/bundle/load";
import { buildMetadata } from "@/lib/seo";
import { bundle as copy } from "@/lib/copy";
import { BundleBuilder } from "@/components/storefront/bundle/BundleBuilder";
import { UiButton } from "@/components/storefront/ui/UiButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.title,
  path: "/sestavi-paket",
  // A per-shopper step between a product page and the cart, priced against the
  // cart the visitor is carrying: nothing here is a stable, indexable page.
  noindex: true,
});

/**
 * /sestavi-paket (§7.1) — the bundle builder a product page hands off to.
 *
 * Server component: it resolves the offers, the add-ons and a quote per
 * selectable combination from the database and the promo engine, then hands
 * the client island flat values (AGENTS §8.1). No pricing happens in the
 * browser, and the page re-prices on every request because the cart it is
 * quoting against can change between visits.
 */
export default async function BundleBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ izdelek?: string }>;
}) {
  const [{ izdelek }, session] = await Promise.all([searchParams, auth()]);
  const view = await loadBundleBuilder(
    izdelek ?? null,
    session?.user?.id ?? null,
    session?.user?.email ?? "",
  );

  if (!view) {
    return (
      <div className="mx-auto max-w-(--container-narrow) px-(--padding) pb-16 pt-10">
        <h1 className="text-[2rem] font-semibold text-dark-1">{copy.empty.title}</h1>
        <p className="mt-2 text-mid-1">{copy.empty.body}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <UiButton href="/cart">{copy.empty.cart}</UiButton>
          <UiButton href="/trgovina" variant="outline">
            {copy.empty.shop}
          </UiButton>
        </div>
      </div>
    );
  }

  return (
    // pb-32 clears the mobile purchase bar, the way the PDP clears its own
    // sticky bar; the bar is md:hidden, so the padding goes away with it.
    <div className="mx-auto max-w-(--container-narrow) px-(--padding) pb-32 pt-10 md:pb-16">
      <BundleBuilder view={view} />
    </div>
  );
}
