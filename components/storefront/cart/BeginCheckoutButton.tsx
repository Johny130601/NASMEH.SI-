"use client";

import { useRouter } from "next/navigation";
import { buildBeginCheckoutEvent } from "@/lib/analytics";
import { pushEvent } from "@/components/storefront/analytics/TrackViewItem";
import { cart } from "@/lib/copy/cart";
import { UiButton } from "../ui/UiButton";

/**
 * "Na blagajno" — pushes begin_checkout with the cart's items, then navigates.
 * `blockedBy`: the id of the notice that says why the checkout is closed (a
 * line sold out in the cart); the button is then disabled and described by it.
 */
export function BeginCheckoutButton({
  items,
  blockedBy = null,
}: {
  items: Array<{ sku: string; title: string; priceCents: number; quantity: number }>;
  blockedBy?: string | null;
}) {
  const router = useRouter();
  return (
    <UiButton
      variant="primary"
      fullWidth
      disabled={blockedBy !== null}
      aria-describedby={blockedBy ?? undefined}
      onClick={() => {
        pushEvent(buildBeginCheckoutEvent(items));
        router.push("/checkout");
      }}
      data-begin-checkout
    >
      {cart.checkout.cta}
    </UiButton>
  );
}
