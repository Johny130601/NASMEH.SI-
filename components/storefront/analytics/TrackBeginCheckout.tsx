"use client";

import { useEffect } from "react";
import type { EcommerceEvent } from "@/lib/analytics";
import { pushEvent } from "./TrackViewItem";

/**
 * Fires `begin_checkout` once when the checkout opens, with the cart it opened
 * on (built on the server). Every way in — the cart's "Na blagajno", the
 * add-to-cart card and the PDP's "Kupi zdaj" — lands on the checkout, so the
 * event counts all of them alike; it used to fire on the cart button only,
 * which the shorter paths skip (2026-10-03).
 */
export function TrackBeginCheckout({ event }: { event: EcommerceEvent }) {
  useEffect(() => {
    pushEvent(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
