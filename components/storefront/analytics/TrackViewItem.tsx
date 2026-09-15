"use client";

import { useEffect } from "react";
import { analyticsAllowed, type EcommerceEvent } from "@/lib/analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Push an ecommerce event to the GTM dataLayer — only with stored analytics
 * consent (`window.__nasmehConsent`, set by the consent snippet and the CMP).
 * Without it the event is dropped, not queued for GTM to replay after consent.
 */
export function pushEvent(event: EcommerceEvent): void {
  if (typeof window === "undefined") return;
  if (!analyticsAllowed(window.__nasmehConsent)) return;
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
