"use client";

import Link from "next/link";
import { useState } from "react";
import { pdp as copy } from "@/lib/copy/pdp";
import { UiIcon } from "../ui/UiIcon";
import { ObvestiteMeButton } from "../catalog/ObvestiteMeButton";
import { AddToCartButton } from "../catalog/AddToCartButton";
import { BuyNowButton } from "./BuyNowButton";
import { QuantityStepper } from "./QuantityStepper";

/**
 * PDP buy box (§6.8): qty stepper (1–maxQuantity, minus disabled at 1),
 * LIVE add-to-cart (server re-prices) with "Kupi zdaj" under it — the same
 * quantity straight to the checkout — or "Obvestite me" when sold out, and
 * a disabled sold-out button instead when no restock alert could be armed
 * (a bundle its components cannot fill, lib/bundle/availability).
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
  nextHref = null,
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
  /** Where a clean add continues to (the bundle builder); null confirms in place. */
  nextHref?: string | null;
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
        <QuantityStepper value={quantity} max={maxQuantity} onChange={setQuantity} />
      </div>

      <AddToCartButton
        variantId={variantId}
        sku={sku}
        title={title}
        priceCents={priceCents}
        quantity={quantity}
        imageUrl={imageUrl}
        label={copy.buyBox.addToCart}
        nextHref={nextHref}
      />

      <BuyNowButton
        variantId={variantId}
        sku={sku}
        title={title}
        priceCents={priceCents}
        quantity={quantity}
        imageUrl={imageUrl}
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
