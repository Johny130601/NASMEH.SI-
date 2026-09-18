"use client";

import Link from "next/link";
import { useState } from "react";
import { pdp as copy } from "@/lib/copy";
import { UiIcon } from "../ui/UiIcon";
import { ObvestiteMeButton } from "../catalog/ObvestiteMeButton";
import { AddToCartButton } from "../catalog/AddToCartButton";

/**
 * PDP buy box (§6.8): qty stepper (1–maxCartQuantity, minus disabled at 1),
 * LIVE add-to-cart (server re-prices), or "Obvestite me" when sold out.
 */
export function BuyBox({
  productSlug,
  variantId,
  sku,
  title,
  priceCents,
  maxQuantity,
  soldOut,
  testToken,
  imageUrl = null,
}: {
  productSlug: string;
  variantId: string;
  sku: string;
  title: string;
  priceCents: number;
  maxQuantity: number;
  soldOut: boolean;
  testToken: string | null;
  /** First gallery image, for the confirmation card. */
  imageUrl?: string | null;
}) {
  const [quantity, setQuantity] = useState(1);

  if (soldOut) {
    return (
      <div data-buy-box>
        <ObvestiteMeButton productSlug={productSlug} testToken={testToken} />
      </div>
    );
  }

  return (
    <div data-buy-box className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-mid-1">{copy.buyBox.quantity}</span>
        <div className="inline-flex items-center rounded-btn border border-light-1">
          <button
            type="button"
            aria-label={copy.buyBox.decrease}
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-11 w-11 items-center justify-center rounded-btn text-lg text-dark-1 transition-colors hover:bg-light-3 disabled:pointer-events-none disabled:opacity-40"
          >
            −
          </button>
          <span
            aria-live="polite"
            className="w-8 text-center text-base font-medium text-dark-1"
          >
            {/* keyed so each change pops the figure */}
            <span key={quantity} className="inline-block animate-pop">{quantity}</span>
          </span>
          <button
            type="button"
            aria-label={copy.buyBox.increase}
            disabled={quantity >= maxQuantity}
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            className="flex h-11 w-11 items-center justify-center rounded-btn text-lg text-dark-1 transition-colors hover:bg-light-3 disabled:pointer-events-none disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <AddToCartButton
        variantId={variantId}
        sku={sku}
        title={title}
        priceCents={priceCents}
        quantity={quantity}
        imageUrl={imageUrl}
        label={copy.buyBox.addToCart}
      />

      <Link
        href={copy.trust.guaranteeHref}
        data-guarantee-link
        className="inline-flex items-center gap-2 rounded-card bg-success/15 px-3 py-2 text-xs font-medium text-dark-1 underline-offset-2 hover:underline"
      >
        <UiIcon name="shield" className="h-4 w-4 text-success" />
        {copy.buyBox.guarantee}
      </Link>
    </div>
  );
}
