"use client";

import { useEffect } from "react";
import { clearCartAfterPurchaseAction } from "@/app/(storefront)/actions/checkout";

/** Clears the cart once the order is PAID (cookie writes need an action). */
export function ClearCartOnPaid({ orderNumber }: { orderNumber: string }) {
  useEffect(() => {
    void clearCartAfterPurchaseAction({ orderNumber });
  }, [orderNumber]);
  return null;
}
