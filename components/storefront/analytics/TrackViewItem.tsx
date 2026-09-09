"use client";

import { useEffect } from "react";
import type { EcommerceEvent } from "@/lib/analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** Push an ecommerce event to the GTM dataLayer (no-op without GTM/consent). */
export function pushEvent(event: EcommerceEvent): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(event);
}

/** Fires `view_item` once on PDP mount. */
export function TrackViewItem({ event }: { event: EcommerceEvent }) {
  useEffect(() => {
    pushEvent(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
