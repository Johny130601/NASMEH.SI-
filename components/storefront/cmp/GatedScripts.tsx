"use client";

import { useEffect } from "react";
import { gtmAllowed } from "@/lib/analytics";
import { useConsent } from "./ConsentProvider";

/**
 * Script gating (spec §3.4): injects the GTM container ONLY after analytics
 * or marketing consent; zero analytics/marketing tags exist before that.
 * Consent Mode v2 keeps the categories apart inside the container: the
 * server-rendered snippet sets the all-denied default plus the stored choice,
 * and the CMP pushes the update on save — both before this effect runs.
 * Container tags that ignore Consent Mode must be gated on the
 * `nasmeh_consent` dataLayer event (operator setup, not code).
 */
export function GatedScripts() {
  const { consent, gtmId } = useConsent();

  useEffect(() => {
    if (!gtmAllowed(consent) || !gtmId) return;
    if (document.getElementById("gtm-script")) return;

    const script = document.createElement("script");
    script.id = "gtm-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    document.head.appendChild(script);
    window.dataLayer?.push({ "gtm.start": Date.now(), event: "gtm.js" });
  }, [consent, gtmId]);

  return null;
}
