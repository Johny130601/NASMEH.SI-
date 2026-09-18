"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToCartAction } from "@/app/(storefront)/actions/cart";
import { buildAddToCartEvent } from "@/lib/analytics";
import { dispatchCartAdded } from "@/lib/cart/added-event";
import { pushEvent } from "@/components/storefront/analytics/TrackViewItem";
import { catalog } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";

/**
 * Live add-to-cart (AGENTS §5.2): sends variant id + qty ONLY; the server
 * re-reads price/stock/cap from the DB. Pushes add_to_cart on success.
 * Feedback states (research 06 §6): busy = spinner, done = green "Dodano ✓"
 * for 1.5 s, plus the page-level confirmation card (lib/cart/added-event).
 */
export function AddToCartButton({
  variantId,
  sku,
  title,
  priceCents,
  quantity = 1,
  label,
  imageUrl = null,
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
  /** Shown in the confirmation card; display only. */
  imageUrl?: string | null;
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
        dispatchCartAdded({ title, priceCents, quantity, imageUrl });
        router.refresh();
        setTimeout(() => setState("idle"), 1500);
      } else {
        setState("idle");
      }
    });
  };

  return (
    <UiButton
      variant={state === "done" ? "success" : variant}
      fullWidth={fullWidth}
      className={className}
      disabled={state === "busy"}
      aria-busy={state === "busy" || undefined}
      onClick={onClick}
      data-atc={variantId}
      data-atc-state={state}
    >
      {state === "busy" ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-btn border-2 border-current/30 border-t-current"
        />
      ) : null}
      {/* keyed so the success label pops in each time it appears */}
      <span key={state} className={state === "done" ? "inline-block animate-pop" : undefined}>
        {state === "done" ? catalog.card.added : state === "busy" ? catalog.card.adding : label}
      </span>
    </UiButton>
  );
}
