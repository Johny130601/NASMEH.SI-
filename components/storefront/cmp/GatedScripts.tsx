"use client";

import { useEffect } from "react";
import { useConsent } from "./ConsentProvider";

/**
 * Script gating (spec §3.4): injects the GTM container ONLY after analytics
 * consent; zero analytics/marketing tags exist before that. Consent Mode v2
 * defaults are passed SSR-side in the layout; this updates them on choice.
 */
export function GatedScripts() {
  const { consent, gtmId } = useConsent();

  useEffect(() => {
    if (!consent?.analytics || !gtmId) return;
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
