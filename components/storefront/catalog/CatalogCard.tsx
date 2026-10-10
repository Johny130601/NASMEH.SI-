import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog";
import {
  formatEUR,
  formatUnitPrice,
} from "@/lib/pricing";
import { catalog } from "@/lib/copy/catalog";
import { home } from "@/lib/copy/home";
import { pdp } from "@/lib/copy/pdp";
import { UiButton } from "../ui/UiButton";
import { UiPill } from "../ui/UiPill";
import { BadgePill } from "./BadgePill";
import { RatingStars } from "./RatingStars";
import { ObvestiteMeButton } from "./ObvestiteMeButton";
import { AddToCartButton } from "./AddToCartButton";

/** "default": one grid cell; "wide": a double-width feature card (the shop grid's bundle, spec §5). */
export type CatalogCardLayout = "default" | "wide";

/**
 * Universal product card (§5): chips floating on the tile's top edge → packshot
 * tile (hover: lift, zoom, cross-fade to the first gallery image) → title →
 * rating → price (Omnibus prior price struck through + its 30-day line, only
 * when `product.reduction` is set) → unit price → hooks → swatches "+N" →
 * CTA by state (full width; beside the text on a wide card).
 *
 * Sales hooks, every one computed from live data (never typed content):
 * "−X %" pill from the history-backed reduction; the bundle's value line from
 * its components' current prices (§6.6); the real remaining units while the
 * stock is at or under the admin's low-stock threshold. At most one admin
 * badge and one computed pill sit on the image (research 06 §7.3). The badge
 * and the sold-out pill float half outside the tile (2026-10-10 shop
 * redesign, the reference's signature), the "−X %" pill stays inside it.
 */
const CTA_CLASSES = "ui-shine !h-11 px-3 text-sm md:!h-[3.25rem] md:px-8 md:text-base";

export function CatalogCard({
  product,
  testToken = null,
  layout = "default",
  priority = false,
}: {
  product: CatalogProduct;
  testToken?: string | null;
  layout?: CatalogCardLayout;
  /** First-row card of a grid in the first viewport: its image loads eagerly with high priority (the LCP candidate). */
  priority?: boolean;
}) {
  const href = `/izdelek/${product.slug}`;
  const wide = layout === "wide";
  const soldOut = product.soldOut;
  const reduction = product.reduction;
  const ctaLabel = soldOut
    ? catalog.card.notifyMe
    : product.isBundle
      ? catalog.card.buildBundle
      : catalog.card.addToCart;
  // lib/catalog already dropped an admin badge that repeats the sold-out state (displayBadges)
  const badge = product.badges[0] ?? null;
  const hasChips = soldOut || badge !== null;

  return (
    // fills its grid cell or carousel slide (the rail sets the slide width), equal heights per row.
    // Hover: the card lifts (translate) and its deeper shadow fades in on a pseudo-element
    // (opacity) — box-shadow itself is never animated (AGENTS §8.23, QA L5). Tailwind v4's
    // translate-*/scale-* utilities set the individual `translate`/`scale` properties, so the
    // transition lists name those; `transform` alone would let the lift and the zoom snap.
    // Borderless since the 2026-10-10 redesign: the soft shadow and the panel radius carry the card.
    <article
      className="group relative flex h-full w-full min-w-0 flex-col rounded-panel bg-white p-3 shadow-card transition-[translate] duration-300 ease-out-quart after:pointer-events-none after:absolute after:inset-0 after:rounded-panel after:opacity-0 after:shadow-card-hover after:transition-opacity after:duration-300 after:ease-out-quart hover:-translate-y-1 hover:after:opacity-100 md:p-4"
      data-product-card={product.slug}
      data-card-layout={layout}
    >
      <Link href={href} className="relative block" aria-label={product.title}>
        <div className={`relative mb-4 overflow-hidden rounded-card bg-light-3 ${wide ? "aspect-[2/1]" : "aspect-square"}`}>
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.imageAlt}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              className={`h-full w-full object-cover transition-[scale,opacity] duration-500 ease-out-quart group-hover:scale-105 ${
                product.hoverImageUrl ? "group-hover:opacity-0" : ""
              }`}
            />
          ) : null}
          {product.hoverImageUrl ? (
            // decorative second view; the card image carries the alt text
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.hoverImageUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="absolute inset-0 h-full w-full scale-105 object-cover opacity-0 transition-opacity duration-500 ease-out-quart group-hover:opacity-100"
              data-hover-image
            />
          ) : null}
          {reduction && !soldOut ? (
            <span className="absolute right-3 top-3">
              <UiPill variant="brand" data-percent-off>
                {catalog.card.percentOff(reduction.percentOff)}
              </UiPill>
            </span>
          ) : null}
        </div>
        {/* The sold-out pill and the admin badge straddle the tile's top edge: outside the clipped tile,
            inside the card's own padding, so a narrow card never hides them under the pill (QA T5-04). */}
        {hasChips ? (
          <span className="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap" data-card-chips>
            {soldOut ? (
              <span className="shadow-card"><BadgePill badge={{ label: catalog.card.soldOut, style: "grey" }} /></span>
            ) : null}
            {badge ? <span className="shadow-card"><BadgePill badge={badge} /></span> : null}
          </span>
        ) : null}
      </Link>

      <div className={wide ? "flex flex-1 flex-col md:flex-row md:items-end md:gap-6" : "flex flex-1 flex-col"}>
        <div className="min-w-0 md:flex-1">
          <Link href={href} className="block">
            <h3 className={`font-normal text-dark-1 transition-colors group-hover:text-brand ${wide ? "text-base md:text-lg" : "text-sm md:text-base"}`}>
              {product.title}
            </h3>
          </Link>

          <RatingStars rating={product.rating} className="mt-1" />

          <p className="mt-2 text-base font-semibold text-brand md:text-lg">
            {reduction ? (
              <span className="mr-2 text-sm font-normal text-mid-2 line-through">
                {formatEUR(reduction.priorPriceCents)}
              </span>
            ) : null}
            {formatEUR(product.priceCents)}{" "}
            <span className="text-xs font-normal text-mid-2">{home.vatIncluded}</span>
          </p>
          {reduction ? (
            <p className="mt-0.5 text-xs text-mid-2" data-omnibus-line>
              {pdp.buyBox.omnibusPrefix}: {formatEUR(reduction.priorPriceCents)}
            </p>
          ) : null}

          {product.unitPrice ? (
            <p className="mt-0.5 text-xs text-mid-2">
              (
              {formatUnitPrice(
                product.priceCents,
                product.unitPrice.quantity,
                product.unitPrice.unit,
              )}
              )
            </p>
          ) : null}

          {product.bundleSavings ? (
            <p className="mt-1 text-xs font-medium text-dark-1" data-bundle-savings>
              {catalog.card.bundleValue(formatEUR(product.bundleSavings.valueCents), product.bundleSavings.savingsPercent)}
            </p>
          ) : null}

          {/* a wide bundle card has the room to say what is inside (computed from the bundle's rows) */}
          {wide && product.bundleComponents.length > 0 ? (
            <p className="mt-1 text-xs text-mid-2" data-bundle-components-line>
              {catalog.card.bundleIncludes}:{" "}
              {product.bundleComponents.map((line) => (line.quantity > 1 ? `${line.quantity}× ${line.title}` : line.title)).join(", ")}
            </p>
          ) : null}

          {product.lowStock !== null ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-dark-1" data-low-stock>
              <span aria-hidden="true" className="ui-pulse-dot h-1.5 w-1.5 rounded-btn bg-warning" />
              {catalog.card.lowStock(product.lowStock)}
            </p>
          ) : null}

          {product.backorderNote ? (
            <p className="mt-1 text-xs text-warning" data-backorder-note>{product.backorderNote}</p>
          ) : null}

          {product.variantCount > 1 ? (
            <p className="mt-1 text-xs text-mid-2">
              {catalog.card.moreSwatches.replace(
                "N",
                String(product.variantCount - 1),
              )}
            </p>
          ) : null}
        </div>

        {/* two cards share a phone screen: tighter padding and text until md; a wide card's CTA sits beside the text */}
        <div className={wide ? "mt-auto pt-4 md:w-56 md:shrink-0 md:pt-0" : "mt-auto pt-4"}>
          {soldOut ? (
            // a sold-out bundle is re-armed by its components' restock (lib/inventory/stock armBundleAlerts)
            <ObvestiteMeButton productSlug={product.slug} testToken={testToken} className={CTA_CLASSES} />
          ) : product.isBundle ? (
            <UiButton href={href} variant="primary" fullWidth className={CTA_CLASSES}>
              {ctaLabel}
            </UiButton>
          ) : (
            <AddToCartButton
              variantId={product.variantId}
              sku={product.sku}
              title={product.title}
              priceCents={product.priceCents}
              imageUrl={product.imageUrl}
              label={ctaLabel}
              className={CTA_CLASSES}
            />
          )}
        </div>
      </div>
    </article>
  );
}
