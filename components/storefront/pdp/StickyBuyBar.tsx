"use client";

import { useState } from "react";
import { formatEUR, klarnaInstallmentCents } from "@/lib/pricing";
import { pdp as copy } from "@/lib/copy/pdp";
import { ObvestiteMeButton } from "../catalog/ObvestiteMeButton";
import { AddToCartButton } from "../catalog/AddToCartButton";
import { QuantityStepper } from "./QuantityStepper";

/**
 * Sticky bottom buy bar (§6.15): price, unit price, the Klarna line when it is
 * enabled, quantity and add-to-cart — it mirrors the buy box and is always at
 * hand. It is `sticky`, not `fixed`: rendered as the last child of <main>, it
 * rides the viewport bottom while the page scrolls and comes to rest above the
 * footer, so it never covers the page's last lines (QA T1-11). It sits in the
 * first viewport, so nothing animates it in (AGENTS §8.20, §8.23).
 */
export function StickyBuyBar({
  productSlug,
  variantId,
  sku,
  title,
  priceCents,
  unitPrice = null,
  maxQuantity,
  soldOut,
  testToken,
  klarnaEnabled = false,
  imageUrl = null,
  nextHref = null,
}: {
  productSlug: string;
  variantId: string;
  sku: string;
  title: string;
  priceCents: number;
  /** The formatted unit price ("2,50 € / uporabo"), computed on the server; null when the product has none. */
  unitPrice?: string | null;
  /** The units one add may take (the page's figure, the same as the buy box's). */
  maxQuantity: number;
  soldOut: boolean;
  testToken: string | null;
  klarnaEnabled?: boolean;
  imageUrl?: string | null;
  /** Where a clean add continues to (the bundle builder); null confirms in place. */
  nextHref?: string | null;
}) {
  const [quantity, setQuantity] = useState(1);

  // Phones get two rows — the price facts, then the controls — because one
  // 360px row cannot hold a readable price beside the stepper and the add
  // button; md and up keep a single row (QA T1-11).
  return (
    <div className="sticky bottom-0 z-40 border-t border-light-2 bg-white/95 backdrop-blur" data-sticky-buy-bar>
      <div className="mx-auto flex max-w-(--container-wide) flex-wrap items-center gap-x-3 gap-y-2 px-(--padding) py-2 md:flex-nowrap md:gap-4 md:py-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" aria-hidden="true" className="hidden h-11 w-11 shrink-0 rounded-card bg-light-3 object-cover md:block" />
        ) : null}
        {/* the price facts flow as one wrapping line: each fact wraps whole, never over the controls */}
        <div className="flex min-w-0 basis-full flex-wrap items-baseline gap-x-2 md:flex-1 md:basis-auto" data-sticky-price>
          {/* the page's H1 names the product; on a phone the bar keeps its room for the price and controls */}
          <p className="hidden truncate text-sm font-medium text-dark-1 md:block md:basis-full">{title}</p>
          <p className="whitespace-nowrap text-sm text-brand">{formatEUR(priceCents)}</p>
          {unitPrice ? (
            <p className="min-w-0 max-w-full truncate text-xs text-mid-2" data-sticky-unit-price>({unitPrice})</p>
          ) : null}
          {klarnaEnabled ? (
            <p className="min-w-0 max-w-full truncate text-xs text-mid-2" data-sticky-klarna>
              {copy.buyBox.klarnaPrefix} {formatEUR(klarnaInstallmentCents(priceCents))} {copy.buyBox.klarnaSuffix}
            </p>
          ) : null}
        </div>
        {soldOut ? (
          <div className="min-w-0 flex-1 md:flex-none md:shrink-0">
            <ObvestiteMeButton productSlug={productSlug} testToken={testToken} className="!h-11" />
          </div>
        ) : (
          <>
            <QuantityStepper value={quantity} max={maxQuantity} onChange={setQuantity} compact />
            <div className="min-w-0 flex-1 md:flex-none md:shrink-0">
              <AddToCartButton
                variantId={variantId}
                sku={sku}
                title={title}
                priceCents={priceCents}
                quantity={quantity}
                imageUrl={imageUrl}
                label={copy.buyBox.addToCart}
                // UiButton's base px-8 comes later in the stylesheet: the phone padding needs the important modifier
                className="!h-11 !px-4 md:!px-6"
                nextHref={nextHref}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
