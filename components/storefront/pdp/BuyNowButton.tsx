"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buyNowAction } from "@/app/(storefront)/actions/cart";
import { buildAddToCartEvent } from "@/lib/analytics";
import { dispatchCartAdded, SOLD_OUT_REFRESH_MS } from "@/lib/cart/added-event";
import { pushEvent } from "@/components/storefront/analytics/TrackViewItem";
import { catalog } from "@/lib/copy/catalog";
import { pdp as copy } from "@/lib/copy/pdp";
import { UiButton } from "../ui/UiButton";

/**
 * "Kupi zdaj" — the PDP's shortest way to the checkout: the product goes into
 * the cart at the quantity the stepper shows and the shopper continues
 * straight to /checkout, past the confirmation card and the cart page. It
 * sends intent only (variant id + quantity, AGENTS §5.2); the server raises
 * the line to at least that quantity, never by it, so a product already in the
 * cart or a second click is not doubled (`buyNowAction`).
 *
 * Only a full line continues. When the cap or the stock stops it short, the
 * units that did land are confirmed in place by the page-level card (which
 * offers the checkout itself), and a click that changed nothing says so in a
 * line under the button — no navigation that would read as a success
 * (AGENTS §8.23). `add_to_cart` reports the units this click really added,
 * none when the cart already held them; `begin_checkout` fires on the
 * checkout itself.
 */
export function BuyNowButton({
  variantId,
  sku,
  title,
  priceCents,
  quantity,
  imageUrl = null,
}: {
  variantId: string;
  sku: string;
  title: string;
  priceCents: number;
  quantity: number;
  /** Shown in the confirmation card when the line lands short; display only. */
  imageUrl?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ capped: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const onClick = () => {
    setBusy(true);
    setNotice(null);
    startTransition(async () => {
      let leaving = false;
      try {
        const result = await buyNowAction({ variantId, quantity });
        const added = result.addedQuantity ?? 0;
        if (added > 0) pushEvent(buildAddToCartEvent({ sku, title, priceCents, quantity: added }));
        if (result.ok) {
          // The button stays busy until the checkout replaces the page.
          leaving = true;
          router.push("/checkout");
          router.refresh();
          return;
        }
        if (added > 0) {
          // short of the ask, but these units are in the cart: confirm them like any add
          dispatchCartAdded({ title, priceCents, quantity: added, imageUrl });
          router.refresh();
          return;
        }
        if (result.soldOut || result.unavailable) {
          // sold out (or withdrawn) since the page was opened: say so, then let the page show it —
          // after a pause, since the refreshed page replaces this button and its notice (QA 2026-10-03 T5-07)
          setNotice({ capped: true, text: result.soldOut ? catalog.card.soldOutNow : catalog.card.unavailableNow });
          if (result.soldOut) setTimeout(() => router.refresh(), SOLD_OUT_REFRESH_MS);
          return;
        }
        const capped = result.capped === true;
        setNotice({ capped, text: capped ? catalog.card.atCap : catalog.card.addFailed });
      } catch {
        setNotice({ capped: false, text: catalog.card.addFailed });
      } finally {
        if (!leaving) setBusy(false);
      }
    });
  };

  return (
    <>
      <UiButton
        variant="outline"
        fullWidth
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={onClick}
        data-buy-now={variantId}
        data-buy-now-state={busy ? "busy" : "idle"}
      >
        {busy ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-btn border-2 border-current/30 border-t-current"
          />
        ) : null}
        <span>{busy ? catalog.card.adding : copy.buyBox.buyNow}</span>
      </UiButton>
      {notice ? (
        // announced like the add button's line: status for the cap rule, alert for a failure
        <p
          role={notice.capped ? "status" : "alert"}
          className={`text-xs ${notice.capped ? "text-warning" : "text-error"}`}
          data-buy-now-notice={notice.capped ? "capped" : "error"}
        >
          {notice.text}
        </p>
      ) : null}
    </>
  );
}
