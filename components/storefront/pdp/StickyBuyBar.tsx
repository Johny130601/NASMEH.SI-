"use client";

import { formatEUR, klarnaInstallmentCents } from "@/lib/pricing";
import { pdp as copy } from "@/lib/copy";
import { ObvestiteMeButton } from "../catalog/ObvestiteMeButton";
import { AddToCartButton } from "../catalog/AddToCartButton";

/** Sticky bottom buy bar (§6.15) — mirrors the buy box, always visible. */
export function StickyBuyBar({
  productSlug,
  variantId,
  sku,
  title,
  priceCents,
  soldOut,
  testToken,
  klarnaEnabled = false,
}: {
  productSlug: string;
  variantId: string;
  sku: string;
  title: string;
  priceCents: number;
  soldOut: boolean;
  testToken: string | null;
  klarnaEnabled?: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-light-2 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-(--container-wide) items-center gap-4 px-(--padding) py-3">
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
              label={copy.buyBox.addToCart}
              fullWidth={false}
              className="!h-11 px-6"
            />
          )}
        </div>
      </div>
    </div>
  );
}
