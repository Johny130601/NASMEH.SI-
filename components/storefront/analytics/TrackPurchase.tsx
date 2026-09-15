"use client";

import { useEffect } from "react";
import type { EcommerceEvent } from "@/lib/analytics";
import { pushEvent } from "./TrackViewItem";

/** Fires `purchase` once when a PAID confirmation page mounts (dropped without analytics consent, see pushEvent). */
export function TrackPurchase({ event }: { event: EcommerceEvent }) {
  useEffect(() => {
    pushEvent(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
