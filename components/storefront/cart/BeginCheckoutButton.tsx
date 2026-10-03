"use client";

import { useRouter } from "next/navigation";
import { cart } from "@/lib/copy/cart";
import { UiButton } from "../ui/UiButton";

/**
 * "Na blagajno" — navigates to the checkout, which fires `begin_checkout`
 * itself (TrackBeginCheckout), so this button, the add-to-cart card and
 * "Kupi zdaj" are counted alike.
 * `blockedBy`: the id of the notice that says why the checkout is closed (a
 * line sold out in the cart); the button is then disabled and described by it.
 */
export function BeginCheckoutButton({
  blockedBy = null,
}: {
  blockedBy?: string | null;
}) {
  const router = useRouter();
  return (
    <UiButton
      variant="primary"
      fullWidth
      disabled={blockedBy !== null}
      aria-describedby={blockedBy ?? undefined}
      onClick={() => router.push("/checkout")}
      data-begin-checkout
    >
      {cart.checkout.cta}
    </UiButton>
  );
}
