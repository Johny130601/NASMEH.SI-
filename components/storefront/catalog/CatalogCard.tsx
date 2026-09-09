import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog";
import {
  formatEUR,
  formatUnitPrice,
} from "@/lib/pricing";
import { catalog, home, pdp } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { BadgePill } from "./BadgePill";
import { RatingStars } from "./RatingStars";
import { ObvestiteMeButton } from "./ObvestiteMeButton";
import { AddToCartButton } from "./AddToCartButton";

/**
 * Universal product card (§5): promo pill badge → packshot tile → title →
 * rating → price (compare-at + Omnibus when discounted) → unit price →
 * swatches "+N" → full-width CTA by state.
 * ATC choice (documented): links to PDP until Phase 3 wires the cart.
 */
export function CatalogCard({
  product,
  omnibusLowestCents = null,
  testToken = null,
}: {
  product: CatalogProduct;
  omnibusLowestCents?: number | null;
  testToken?: string | null;
}) {
  const href = `/izdelek/${product.slug}`;
  const soldOut = product.stock <= 0;
  const discounted =
    product.compareAtPriceCents !== null &&
    product.compareAtPriceCents > product.priceCents;
  const ctaLabel = soldOut
    ? catalog.card.notifyMe
    : product.isBundle
      ? catalog.card.buildBundle
      : catalog.card.addToCart;

  return (
    <article
      className="group flex w-[15rem] shrink-0 snap-start flex-col rounded-card border border-light-2 bg-white p-4 md:w-[17rem]"
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
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
          <span className="absolute left-3 top-3 flex flex-col items-start gap-1">
            {soldOut ? (
              <BadgePill badge={{ label: catalog.card.soldOut, style: "grey" }} />
            ) : null}
            {product.badges[0] && product.badges[0].label !== catalog.card.soldOut ? (
              <BadgePill badge={product.badges[0]} />
            ) : null}
          </span>
        </div>
        <h3 className="text-sm font-normal text-dark-1 md:text-base">
          {product.title}
        </h3>
      </Link>

      <RatingStars rating={product.rating} className="mt-1" />

      <p className="mt-2 text-brand">
        {discounted ? (
          <>
            <span className="mr-2 text-mid-2 line-through">
              {formatEUR(product.compareAtPriceCents!)}
            </span>
          </>
        ) : null}
        {formatEUR(product.priceCents)}{" "}
        <span className="text-xs text-mid-2">{home.vatIncluded}</span>
      </p>
      {discounted && omnibusLowestCents !== null ? (
        <p className="mt-0.5 text-xs text-mid-2">
          {pdp.buyBox.omnibusPrefix}: {formatEUR(omnibusLowestCents)}
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

      {product.variantCount > 1 ? (
        <p className="mt-1 text-xs text-mid-2">
          {catalog.card.moreSwatches.replace(
            "N",
            String(product.variantCount - 1),
          )}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        {soldOut ? (
          <ObvestiteMeButton productSlug={product.slug} testToken={testToken} />
        ) : product.isBundle ? (
          <UiButton href={href} variant="primary" fullWidth>
            {ctaLabel}
          </UiButton>
        ) : (
          <AddToCartButton
            variantId={product.variantId}
            sku={product.sku}
            title={product.title}
            priceCents={product.priceCents}
            label={ctaLabel}
          />
        )}
      </div>
    </article>
  );
}
