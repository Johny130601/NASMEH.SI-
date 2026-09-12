import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { CONSENT_COOKIE, decodeConsentCookie, parseConsent } from "@/lib/consent";
import {
  getConsentConfig,
  getLegalLinks,
  getSetting,
  SETTING_KEYS,
  type CompanySetting,
} from "@/lib/settings";
import { siteUrl } from "@/lib/seo";
import { SiteHeader } from "@/components/storefront/chrome/SiteHeader";
import { SiteFooter } from "@/components/storefront/chrome/SiteFooter";
import { ConsentProvider } from "@/components/storefront/cmp/ConsentProvider";
import { CmpBanner } from "@/components/storefront/cmp/CmpBanner";
import { GatedScripts } from "@/components/storefront/cmp/GatedScripts";
import { WelcomePopup } from "@/components/storefront/WelcomePopup";
import { JsonLd } from "@/components/storefront/seo/JsonLd";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isTestMode } from "@/lib/turnstile";
import type { WelcomePopupSetting } from "@/lib/settings-types";
import { common } from "@/lib/copy";

// Chrome is data-driven (menus/settings/consent per request) and must never
// be prerendered at build time (no DB in the image build).
export const dynamic = "force-dynamic";

// Google Consent Mode v2 defaults — always rendered SSR, everything denied
// until the CMP choice updates it (spec §3.4). Not a tracker.
const CONSENT_DEFAULTS_SNIPPET = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  'analytics_storage': 'denied',
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'wait_for_update': 500
});`;

export default async function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Maintenance mode is gated in middleware (rewrite to /vzdrzevanje) so
  // gated pages never execute and nothing leaks into the RSC payload.
  const jar = await cookies();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const [gtmId, company, welcomePopup, consentConfig, legalLinks] = await Promise.all([
    getSetting<string>(SETTING_KEYS.gtmId),
    getSetting<CompanySetting>(SETTING_KEYS.company),
    getSetting<WelcomePopupSetting>("welcomePopup"),
    getConsentConfig(),
    getLegalLinks(),
  ]);
  const gtm = gtmId?.trim() ? gtmId.trim() : null;
  const consentCookie = jar.get(CONSENT_COOKIE)?.value;
  const consent = parseConsent(decodeConsentCookie(consentCookie), consentConfig.version);

  // Welcome popup suppression: known CONFIRMED subscriber (by session email)
  const session = await auth();
  const knownSubscriber = session?.user?.email
    ? (await db.subscriber.findFirst({
        where: { email: session.user.email.toLowerCase(), status: "CONFIRMED" },
        select: { id: true },
      })) !== null
    : false;
  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  const base = siteUrl();
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: common.siteName,
    url: base,
    logo: `${base}/og-default.svg`,
    ...(company?.email ? { email: company.email } : {}),
  };
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: common.siteName,
    url: base,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/iskanje?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <ConsentProvider initialConsent={consent} gtmId={gtm} consentVersion={consentConfig.version} banner={consentConfig.banner} policyHref={legalLinks.cookies}>
      <script
        id="consent-defaults"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULTS_SNIPPET }}
      />
      <JsonLd data={organizationLd} />
      <JsonLd data={websiteLd} />
      <SiteHeader />
      <main id="content">{children}</main>
      <SiteFooter />
      <CmpBanner />
      <GatedScripts />
      {welcomePopup ? (
        <WelcomePopup
          setting={welcomePopup}
          testToken={testToken}
          knownSubscriber={knownSubscriber}
        />
      ) : null}
    </ConsentProvider>
  );
}
