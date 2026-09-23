"use client";

import { formatEUR, klarnaInstallmentCents } from "@/lib/pricing";
import { pdp as copy } from "@/lib/copy";
import { ObvestiteMeButton } from "../catalog/ObvestiteMeButton";
import { AddToCartButton } from "../catalog/AddToCartButton";

/** Sticky bottom buy bar (§6.15) — mirrors the buy box, always visible; it sits in the first viewport, so nothing animates it in (AGENTS §8.20, §8.23). */
export function StickyBuyBar({
  productSlug,
  variantId,
  sku,
  title,
  priceCents,
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
  soldOut: boolean;
  testToken: string | null;
  klarnaEnabled?: boolean;
  imageUrl?: string | null;
  /** Where a clean add continues to (the bundle builder); null confirms in place. */
  nextHref?: string | null;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-light-2 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-(--container-wide) items-center gap-4 px-(--padding) py-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" aria-hidden="true" className="hidden h-11 w-11 shrink-0 rounded-card bg-light-3 object-cover md:block" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-dark-1">{title}</p>
          <p className="text-sm text-brand">
            {formatEUR(priceCents)}{" "}
            {klarnaEnabled ? <span className="hidden text-xs text-mid-2 md:inline">
              {copy.buyBox.klarnaPrefix}{" "}
              {formatEUR(klarnaInstallmentCents(priceCents))}{" "}
              {copy.buyBox.klarnaSuffix}
            </span> : null}
          </p>
        </div>
        <div className="shrink-0">
          {soldOut ? (
            <ObvestiteMeButton
              productSlug={productSlug}
              testToken={testToken}
              fullWidth={false}
            />
          ) : (
            <AddToCartButton
              variantId={variantId}
              sku={sku}
              title={title}
              priceCents={priceCents}
              imageUrl={imageUrl}
              label={copy.buyBox.addToCart}
              fullWidth={false}
              className="!h-11 px-6"
              nextHref={nextHref}
            />
          )}
        </div>
      </div>
    </div>
  );
}
