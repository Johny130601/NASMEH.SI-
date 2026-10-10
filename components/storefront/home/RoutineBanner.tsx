import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog";
import type { RoutineBannerSetting } from "@/lib/settings";
import { formatEUR } from "@/lib/pricing";
import { catalog } from "@/lib/copy/catalog";
import { home } from "@/lib/copy/home";
import { pdp } from "@/lib/copy/pdp";
import { AddToCartButton } from "../catalog/AddToCartButton";
import { ObvestiteMeButton } from "../catalog/ObvestiteMeButton";
import { UiIcon } from "../ui/UiIcon";

/** One component line of the bundle card: the component product's title and its quantity in the bundle. */
export interface BundleComponentLine {
  title: string;
  quantity: number;
}

/** The bundle the banner links to, as the catalog lists it, with its components. */
export interface RoutineBundle {
  product: CatalogProduct;
  components: BundleComponentLine[];
}

const CTA_CLASSES = "!h-12 px-6 text-sm md:!h-[3.25rem] md:px-8 md:text-base";

/**
 * Routine bundle block (§4.4). Since the 2026-10-10 home redesign it is a split
 * card — artwork on one side, the bundle's facts on the other — when the
 * banner links to a bundle the catalog lists: its component list, its price,
 * the Omnibus prior price and 30-day line when a reduction is announced,
 * otherwise the value line from the components' current prices (§6.6), and a
 * direct add to the cart. Every figure is computed from the catalog
 * (AGENTS §8.23); the Setting supplies the title, the artwork and the live
 * footnote. Without such a bundle the block falls back to the clickable
 * image banner. The image link keeps the title as its accessible name.
 * Reveals on scroll; the components cascade in; the artwork zooms slightly
 * inside its clipped frame on hover (transform and opacity only, §8.23).
 */
export function RoutineBanner({
  banner,
  bundle = null,
  testToken = null,
}: {
  banner: RoutineBannerSetting;
  bundle?: RoutineBundle | null;
  testToken?: string | null;
}) {
  const footnote = banner.footnote ? (
    <p className="mt-4 text-xs leading-5 text-mid-2">{banner.footnote}</p>
  ) : null;

  if (!bundle) {
    return (
      <section className="ui-reveal mx-auto max-w-(--container-bleed) px-(--padding) py-16" data-routine-banner="image">
        <Link
          href={banner.href}
          aria-label={banner.title}
          className="group relative block rounded-panel shadow-card after:pointer-events-none after:absolute after:inset-0 after:rounded-panel after:opacity-0 after:shadow-card-hover after:transition-opacity after:duration-300 after:ease-out-quart hover:after:opacity-100"
        >
          <div className="overflow-hidden rounded-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={banner.image}
              alt={banner.imageAlt}
              loading="lazy"
              className="w-full object-cover transition-transform duration-500 ease-out-quart group-hover:scale-[1.02]"
            />
          </div>
        </Link>
        {footnote}
      </section>
    );
  }

  const { product, components } = bundle;
  const reduction = product.reduction;

  return (
    <section className="ui-reveal mx-auto max-w-(--container-wide) px-(--padding) py-16" data-routine-banner="card">
      {/* overflow-clip, not hidden: a hidden overflow is a scroll container, which would leave the
          component list's view() timeline inactive and the cascade off */}
      <div className="grid overflow-clip rounded-panel bg-white shadow-card md:grid-cols-2">
        <Link
          href={banner.href}
          aria-label={banner.title}
          className="group relative block overflow-hidden bg-light-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={banner.image}
            alt={banner.imageAlt}
            loading="lazy"
            className="aspect-[4/3] h-full w-full object-cover transition-transform duration-500 ease-out-quart group-hover:scale-[1.03] md:aspect-auto md:min-h-[26rem]"
          />
        </Link>

        <div className="flex flex-col justify-center gap-5 p-6 md:p-10 lg:p-12">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">{home.routineBanner.eyebrow}</p>
          <h2 className="text-2xl font-semibold md:text-[2rem]">{banner.title}</h2>

          <ul className="ui-reveal-stagger grid gap-2.5 md:grid-cols-2" aria-label={home.routineBanner.includes} data-bundle-components>
            {components.map((line) => (
              <li key={line.title} className="flex items-center gap-2.5 text-sm text-dark-1">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-btn bg-success/15 text-success">
                  <UiIcon name="check" className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  {line.quantity > 1 ? `${line.quantity}× ` : ""}
                  {line.title}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-3">
            {product.soldOut ? (
              <ObvestiteMeButton productSlug={product.slug} testToken={testToken} fullWidth={false} className={CTA_CLASSES} />
            ) : (
              <AddToCartButton
                variantId={product.variantId}
                sku={product.sku}
                title={product.title}
                priceCents={product.priceCents}
                imageUrl={product.imageUrl}
                label={home.routineBanner.addToCart}
                fullWidth={false}
                className={`ui-shine ${CTA_CLASSES}`}
              />
            )}
            <p className="text-xl font-semibold text-brand" data-bundle-price>
              {reduction ? (
                <span className="mr-2 text-sm font-normal text-mid-2 line-through">{formatEUR(reduction.priorPriceCents)}</span>
              ) : null}
              {formatEUR(product.priceCents)} <span className="text-xs font-normal text-mid-2">{home.vatIncluded}</span>
            </p>
          </div>

          {reduction ? (
            <p className="text-xs text-mid-2" data-omnibus-line>
              {pdp.buyBox.omnibusPrefix}: {formatEUR(reduction.priorPriceCents)}
            </p>
          ) : product.bundleSavings ? (
            <p className="text-xs font-medium text-dark-1" data-bundle-savings>
              {catalog.card.bundleValue(formatEUR(product.bundleSavings.valueCents), product.bundleSavings.savingsPercent)}
            </p>
          ) : null}

          <Link href={banner.href} className="group inline-flex w-fit items-center gap-1.5 text-sm font-medium text-dark-1 underline-offset-4 hover:underline">
            {home.routineBanner.details}
            <UiIcon name="arrow-right" className="h-4 w-4 transition-transform duration-300 ease-out-quart group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
      {footnote}
    </section>
  );
}
