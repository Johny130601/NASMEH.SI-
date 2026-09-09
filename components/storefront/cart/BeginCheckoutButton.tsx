"use client";

import { useRouter } from "next/navigation";
import { buildBeginCheckoutEvent } from "@/lib/analytics";
import { pushEvent } from "@/components/storefront/analytics/TrackViewItem";
import { cart } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";

/** "Na blagajno" — pushes begin_checkout with the cart's items, then navigates. */
export function BeginCheckoutButton({
  items,
}: {
  items: Array<{ sku: string; title: string; priceCents: number; quantity: number }>;
}) {
  const router = useRouter();
  return (
    <UiButton
      variant="primary"
      fullWidth
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
