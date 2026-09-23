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
 * Only a real add confirms: a line already at its cap, a refusal and a failed
 * request say so in a line under the button — no green state, no analytics
 * event and no confirmation card for a cart that did not change. A partial
 * add states the units the cap let through, not the ones asked for.
 *
 * `nextHref` hands the shopper on to the bundle builder instead of confirming
 * in place — but ONLY when the add was clean. A clamped or refused add still
 * has something to report, and §8.23 says it is reported here, not navigated
 * away from.
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
  nextHref = null,
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
  /** Where a CLEAN add continues to (the bundle builder); null confirms in place. */
  nextHref?: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [notice, setNotice] = useState<{ capped: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const onClick = () => {
    setState("busy");
    setNotice(null);
    startTransition(async () => {
      let added = false;
      try {
        const result = await addToCartAction({ variantId, quantity });
        added = result.ok;
        if (result.ok) {
          // the cap may have clamped a multi-unit add: announce and report what
          // really landed in the cart, never the quantity that was asked for
          const stored = result.addedQuantity ?? quantity;
          pushEvent(buildAddToCartEvent({ sku, title, priceCents, quantity: stored }));
          if (nextHref && stored === quantity) {
            // The next page is the confirmation: no toast to flash past, and
            // the button stays busy until the navigation commits.
            router.push(nextHref);
            router.refresh();
            return;
          }
          setState("done");
          dispatchCartAdded({ title, priceCents, quantity: stored, imageUrl });
          router.refresh();
          setTimeout(() => setState("idle"), 1500);
        } else {
          // the cap is a rule, not a failure: it reads differently and is announced politely
          const capped = result.capped === true;
          setNotice({ capped, text: capped ? catalog.card.atCap : catalog.card.addFailed });
        }
      } catch {
        // A throwing action used to leave the button disabled and spinning for good.
        setNotice({ capped: false, text: catalog.card.addFailed });
      } finally {
        if (!added) setState("idle");
      }
    });
  };

  return (
    <>
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
      {notice ? (
        // announced like the other inline form messages (status for a rule, alert for a failure)
        <p
          role={notice.capped ? "status" : "alert"}
          // max-w so the line wraps instead of widening a narrow host (the sticky buy bar);
          // text-warning is what the cart line already uses for the same cap rule
          className={`mt-2 max-w-56 text-xs ${notice.capped ? "text-warning" : "text-error"}`}
          data-atc-notice={notice.capped ? "capped" : "error"}
        >
          {notice.text}
        </p>
      ) : null}
    </>
  );
}
