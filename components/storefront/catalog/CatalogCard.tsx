import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog";
import {
  formatEUR,
  formatUnitPrice,
} from "@/lib/pricing";
import { catalog, home, pdp } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { UiPill } from "../ui/UiPill";
import { BadgePill } from "./BadgePill";
import { RatingStars } from "./RatingStars";
import { ObvestiteMeButton } from "./ObvestiteMeButton";
import { AddToCartButton } from "./AddToCartButton";

/**
 * Universal product card (§5): badge pill → packshot tile (hover: lift, zoom,
 * cross-fade to the first gallery image) → title → rating → price (Omnibus
 * prior price struck through + its 30-day line, only when `product.reduction`
 * is set) → unit price → hooks → swatches "+N" → full-width CTA by state.
 *
 * Sales hooks, every one computed from live data (never typed content):
 * "−X %" pill from the history-backed reduction; the bundle's value line from
 * its components' current prices (§6.6); the real remaining units while the
 * stock is at or under the admin's low-stock threshold. At most one admin
 * badge and one computed pill sit on the image (research 06 §7.3).
 */
const CTA_CLASSES = "!h-11 px-3 text-sm md:!h-[3.25rem] md:px-8 md:text-base";

export function CatalogCard({
  product,
  testToken = null,
}: {
  product: CatalogProduct;
  testToken?: string | null;
}) {
  const href = `/izdelek/${product.slug}`;
  const soldOut = product.soldOut;
  const reduction = product.reduction;
  const ctaLabel = soldOut
    ? catalog.card.notifyMe
    : product.isBundle
      ? catalog.card.buildBundle
      : catalog.card.addToCart;
  const badge = product.badges[0] && product.badges[0].label !== catalog.card.soldOut ? product.badges[0] : null;

  return (
    // fills its grid cell or carousel slide (the rail sets the slide width), equal heights per row
    <article
      className="group relative flex h-full w-full min-w-0 flex-col rounded-card border border-light-2 bg-white p-3 shadow-card transition-[transform,box-shadow,border-color] duration-300 ease-out-quart hover:-translate-y-1 hover:border-light-1 hover:shadow-card-hover md:p-4"
      data-product-card={product.slug}
    >
      <Link href={href} className="block">
        <div className="relative mb-4 aspect-square overflow-hidden rounded-card bg-light-3">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.imageAlt}
              loading="lazy"
              className={`h-full w-full object-cover transition-[transform,opacity] duration-500 ease-out-quart group-hover:scale-105 ${
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
          <span className="absolute left-3 top-3 flex flex-col items-start gap-1">
            {soldOut ? (
              <BadgePill badge={{ label: catalog.card.soldOut, style: "grey" }} />
            ) : null}
            {badge ? <BadgePill badge={badge} /> : null}
          </span>
          {reduction && !soldOut ? (
            <span className="absolute right-3 top-3">
              <UiPill variant="brand" data-percent-off>
                {catalog.card.percentOff(reduction.percentOff)}
              </UiPill>
            </span>
          ) : null}
        </div>
        <h3 className="text-sm font-normal text-dark-1 transition-colors group-hover:text-brand md:text-base">
          {product.title}
        </h3>
      </Link>

      <RatingStars rating={product.rating} className="mt-1" />

      <p className="mt-2 text-brand">
        {reduction ? (
          <span className="mr-2 text-mid-2 line-through">
            {formatEUR(reduction.priorPriceCents)}
          </span>
        ) : null}
        {formatEUR(product.priceCents)}{" "}
        <span className="text-xs text-mid-2">{home.vatIncluded}</span>
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

      {/* two cards share a phone screen: tighter padding and text until md */}
      <div className="mt-auto pt-4">
        {soldOut ? (
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
    </article>
  );
}
