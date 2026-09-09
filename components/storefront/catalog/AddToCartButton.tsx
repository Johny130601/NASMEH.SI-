"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToCartAction } from "@/app/(storefront)/actions/cart";
import { buildAddToCartEvent } from "@/lib/analytics";
import { pushEvent } from "@/components/storefront/analytics/TrackViewItem";
import { catalog } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";

/**
 * Live add-to-cart (AGENTS §5.2): sends variant id + qty ONLY; the server
 * re-reads price/stock/cap from the DB. Pushes add_to_cart on success.
 */
export function AddToCartButton({
  variantId,
  sku,
  title,
  priceCents,
  quantity = 1,
  label,
  variant = "primary",
  fullWidth = true,
  className = "",
}: {
  variantId: string;
  sku: string;
  title: string;
  priceCents: number;
  quantity?: number;
  label: string;
  variant?: "primary" | "sale" | "outline" | "ghost";
  fullWidth?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [, startTransition] = useTransition();

  const onClick = () => {
    setState("busy");
    startTransition(async () => {
      const result = await addToCartAction({ variantId, quantity });
      if (result.ok) {
        pushEvent(buildAddToCartEvent({ sku, title, priceCents, quantity }));
        setState("done");
        router.refresh();
        setTimeout(() => setState("idle"), 1500);
      } else {
        setState("idle");
      }
    });
  };

  return (
    <UiButton
      variant={variant}
      fullWidth={fullWidth}
      className={className}
      disabled={state === "busy"}
      onClick={onClick}
      data-atc={variantId}
    >
      {state === "done" ? catalog.card.added : label}
    </UiButton>
  );
}
