"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ConsentChoices } from "@/lib/consent";
import { saveConsentAction } from "@/app/(storefront)/actions/consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export interface ConsentContextValue {
  /** null = no choice stored yet → banner shows */
  consent: ConsentChoices | null;
  bannerOpen: boolean;
  gtmId: string | null;
  /** `consent.version` Setting: stored with every choice; a bump re-opens the banner. */
  consentVersion: number;
  /** Operator copy overrides (`consent.banner`); empty strings fall back to the copy file. */
  banner: { title: string; body: string };
  /** Cookie-policy link (`legal.links.cookies`). */
  policyHref: string;
  openBanner: () => void;
  save: (choices: { analytics: boolean; marketing: boolean }) => Promise<void>;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within ConsentProvider");
  return ctx;
}

function pushConsentModeUpdate(choices: { analytics: boolean; marketing: boolean }) {
  window.gtag?.("consent", "update", {
    analytics_storage: choices.analytics ? "granted" : "denied",
    ad_storage: choices.marketing ? "granted" : "denied",
    ad_user_data: choices.marketing ? "granted" : "denied",
    ad_personalization: choices.marketing ? "granted" : "denied",
  });
}

export function ConsentProvider({
  initialConsent,
  gtmId,
  consentVersion,
  banner,
  policyHref,
  children,
}: {
  initialConsent: ConsentChoices | null;
  gtmId: string | null;
  consentVersion: number;
  banner: { title: string; body: string };
  policyHref: string;
  children: ReactNode;
}) {
  const [consent, setConsent] = useState<ConsentChoices | null>(initialConsent);
  const [bannerOpen, setBannerOpen] = useState<boolean>(initialConsent === null);

  const openBanner = useCallback(() => setBannerOpen(true), []);

  const save = useCallback(
    async (choices: { analytics: boolean; marketing: boolean }) => {
      const result = await saveConsentAction(choices);
      if (result.ok) {
        setConsent({ v: consentVersion, necessary: true, ...choices, ts: Date.now() });
        pushConsentModeUpdate(choices);
        setBannerOpen(false);
      }
    },
    [consentVersion],
  );

  const value = useMemo(
    () => ({ consent, bannerOpen, gtmId, consentVersion, banner, policyHref, openBanner, save }),
    [consent, bannerOpen, gtmId, consentVersion, banner, policyHref, openBanner, save],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}
