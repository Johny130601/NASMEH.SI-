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
import {
  consentDataLayerEvent,
  consentModeSignals,
  trackerCookieExpiry,
  type ConsentCategories,
} from "@/lib/analytics";
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
  /** Resolves false when the choice could not be stored (the banner stays open for a retry); never rejects. */
  save: (choices: ConsentCategories) => Promise<boolean>;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within ConsentProvider");
  return ctx;
}

/** Same signals and event the server snippet emits for a stored choice (lib/consent.ts). */
function pushConsentModeUpdate(choices: ConsentCategories) {
  window.__nasmehConsent = { analytics: choices.analytics, marketing: choices.marketing };
  window.gtag?.("consent", "update", consentModeSignals(choices));
  window.dataLayer?.push(consentDataLayerEvent(choices));
}

/**
 * Expires the JS-set tracker cookies of every denied category; returns how many
 * names were present. The server sends the patterns with the save result: the
 * fixed list plus the analytics/marketing rows of the live cookie table.
 */
function expireDeniedTrackerCookies(patterns: readonly string[]): number {
  if (patterns.length === 0) return 0;
  const { names, assignments } = trackerCookieExpiry(document.cookie, patterns, window.location.hostname);
  for (const assignment of assignments) document.cookie = assignment;
  return names.length;
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
    async (choices: ConsentCategories) => {
      let clearCookies: string[];
      try {
        const result = await saveConsentAction(choices);
        if (!result.ok) return false;
        clearCookies = Array.isArray(result.clearCookies) ? result.clearCookies : [];
      } catch {
        return false;
      }

      pushConsentModeUpdate(choices);
      // Withdrawal: tags already running in this page (GTM is never unloaded)
      // stop only on a reload, and their cookies are removed first.
      const withdrawn =
        (consent?.analytics === true && !choices.analytics) ||
        (consent?.marketing === true && !choices.marketing);
      const expired = expireDeniedTrackerCookies(clearCookies);
      setConsent({ v: consentVersion, necessary: true, ...choices, ts: Date.now() });
      setBannerOpen(false);
      if (withdrawn || expired > 0) window.location.reload();
      return true;
    },
    [consent, consentVersion],
  );

  const value = useMemo(
    () => ({ consent, bannerOpen, gtmId, consentVersion, banner, policyHref, openBanner, save }),
    [consent, bannerOpen, gtmId, consentVersion, banner, policyHref, openBanner, save],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}
