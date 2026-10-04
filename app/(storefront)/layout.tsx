import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import {
  clientConsent,
  CONSENT_COOKIE,
  consentModeSnippet,
  decodeConsentCookie,
  parseConsent,
} from "@/lib/consent";
import {
  getCompany,
  getConsentConfig,
  getLegalLinks,
  getSetting,
  SETTING_KEYS,
} from "@/lib/settings";
import { siteUrl } from "@/lib/seo";
import { SiteHeader } from "@/components/storefront/chrome/SiteHeader";
import { SiteFooter } from "@/components/storefront/chrome/SiteFooter";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/storefront/chrome/SkipLink";
import { ConsentProvider } from "@/components/storefront/cmp/ConsentProvider";
import { CmpBanner } from "@/components/storefront/cmp/CmpBanner";
import { GatedScripts } from "@/components/storefront/cmp/GatedScripts";
import { WelcomePopup } from "@/components/storefront/WelcomePopup";
import { CONTENT_TOKENS, fillToken } from "@/lib/content/tokens";
import { CartToast } from "@/components/storefront/cart/CartToast";
import { JsonLd } from "@/components/storefront/seo/JsonLd";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { KODA_COOKIE } from "@/lib/koda";
import { isTestMode } from "@/lib/turnstile";
import type { WelcomePopupSetting } from "@/lib/settings-types";
import { common } from "@/lib/copy";

// Chrome is data-driven (menus/settings/consent per request) and must never
// be prerendered at build time (no DB in the image build).
export const dynamic = "force-dynamic";

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
    // Validated reader (AGENTS §8.17), the same one the footer uses.
    getCompany(),
    getSetting<WelcomePopupSetting>("welcomePopup"),
    getConsentConfig(),
    getLegalLinks(),
  ]);
  const gtm = gtmId?.trim() ? gtmId.trim() : null;
  const consentCookie = jar.get(CONSENT_COOKIE)?.value;
  const consent = clientConsent(parseConsent(decodeConsentCookie(consentCookie), consentConfig.version));

  // Welcome popup suppression: a known CONFIRMED subscriber (by session email),
  // or a guest whose stored discount code is already the popup's — the popup
  // stores it on subscription, so the same browser is not asked again once the
  // session flag is gone (no extra storage key to list in the cookie table).
  const session = await auth();
  const knownSubscriber = session?.user?.email
    ? (await db.subscriber.findFirst({
        where: { email: session.user.email.toLowerCase(), status: "CONFIRMED" },
        select: { id: true },
      })) !== null
    : Boolean(welcomePopup?.couponCode) && jar.get(KODA_COOKIE)?.value === welcomePopup?.couponCode;
  const env = getEnv();
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;
  // {koda} names the code the popup applies, so no text in it can name another (QA 2026-10-03 T6-04).
  // A malformed row renders as empty text, never as a crash of every page.
  const popupText = (value: unknown) => fillToken(typeof value === "string" ? value : "", CONTENT_TOKENS.code, typeof welcomePopup?.couponCode === "string" ? welcomePopup.couponCode : "");
  const popupSetting = welcomePopup
    ? {
        ...welcomePopup,
        title: popupText(welcomePopup.title),
        body: popupText(welcomePopup.body),
        thankYouTitle: popupText(welcomePopup.thankYouTitle),
        thankYouBody: popupText(welcomePopup.thankYouBody),
      }
    : null;

  const base = siteUrl();
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: common.siteName,
    url: base,
    logo: `${base}/og-default.svg`,
    ...(company?.email ? { email: company.email } : {}),
    ...(company?.phone?.trim() ? { telephone: company.phone.trim() } : {}),
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
      {/* The first Tab stop: past the marquee and the header to <main> (WCAG 2.4.1). */}
      <SkipLink />
      {/* Google Consent Mode v2 — all denied by default, then the stored
          choice (booleans only), before any other script (spec §3.4). Not a tracker. */}
      <script
        id="consent-defaults"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: consentModeSnippet(consent) }}
      />
      <JsonLd data={organizationLd} />
      <JsonLd data={websiteLd} />
      <SiteHeader />
      {/* focusable by script only, so the skip link moves focus into the content, not just the scroll (QA 2026-10-03 v1);
          its ring and its scroll margin under the sticky header are set in globals.css */}
      <main id={MAIN_CONTENT_ID} tabIndex={-1}>{children}</main>
      <SiteFooter />
      {/* one confirmation card for every add-to-cart button on the page */}
      <CartToast />
      <CmpBanner />
      <GatedScripts />
      {popupSetting ? (
        <WelcomePopup
          setting={popupSetting}
          testToken={testToken}
          siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
          privacyHref={legalLinks.privacy}
          knownSubscriber={knownSubscriber}
        />
      ) : null}
    </ConsentProvider>
  );
}
