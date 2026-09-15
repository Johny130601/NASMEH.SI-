/**
 * GA4-style ecommerce event builders (spec §3.5) and the browser-side consent
 * helpers the CMP and the event pushes share — PURE, unit-tested, no zod (they
 * ship in the storefront bundle). An event reaches window.dataLayer only once
 * analytics consent is stored; before that it is dropped, never queued for
 * replay when GTM loads (Phase 9 step 4).
 */

export type ConsentCategories = { analytics: boolean; marketing: boolean };

/**
 * Browser mirror of the stored choice (`window.__nasmehConsent`): written by
 * the server-rendered consent snippet for a stored choice and by the CMP on
 * save, read by `pushEvent` outside React.
 */
export const CONSENT_WINDOW_KEY = "__nasmehConsent";

/** dataLayer event carrying the choice, for container tags that are not Consent Mode aware. */
export const CONSENT_DATALAYER_EVENT = "nasmeh_consent";

declare global {
  interface Window {
    __nasmehConsent?: ConsentCategories;
  }
}

/** Google Consent Mode v2 signals for a choice; strings are fixed, only booleans select them. */
export function consentModeSignals(choices: ConsentCategories) {
  const analytics = choices.analytics === true ? "granted" : "denied";
  const marketing = choices.marketing === true ? "granted" : "denied";
  return {
    analytics_storage: analytics,
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
  };
}

export function consentDataLayerEvent(choices: ConsentCategories) {
  return {
    event: CONSENT_DATALAYER_EVENT,
    analytics: choices.analytics === true,
    marketing: choices.marketing === true,
  };
}

/** Ecommerce pushes need stored analytics consent; anything else drops the event. */
export function analyticsAllowed(consent: { analytics?: unknown } | null | undefined): boolean {
  return consent?.analytics === true;
}

/** The GTM container loads for either optional category; Consent Mode keeps them apart inside it. */
export function gtmAllowed(consent: { analytics?: unknown; marketing?: unknown } | null | undefined): boolean {
  return consent?.analytics === true || consent?.marketing === true;
}

function cookieNameMatches(name: string, pattern: string): boolean {
  return pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

/** The host itself plus every parent domain with at least two labels (GA writes to the widest one). */
function cookieDomains(hostname: string): string[] {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return [];
  const labels = host.split(".");
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join("."));
}

/**
 * `document.cookie` assignments that expire every present cookie matching the
 * patterns, host-only and on each parent domain, on path `/`. Returns the
 * matched names too so the caller knows whether anything was removed.
 */
export function trackerCookieExpiry(
  documentCookie: string,
  patterns: readonly string[],
  hostname: string,
): { names: string[]; assignments: string[] } {
  const present = documentCookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name.length > 0);
  const names = [...new Set(present.filter((name) => patterns.some((pattern) => cookieNameMatches(name, pattern))))];
  const domains = cookieDomains(hostname);
  const assignments = names.flatMap((name) => [
    `${name}=; Max-Age=0; path=/`,
    ...domains.map((domain) => `${name}=; Max-Age=0; path=/; domain=${domain}`),
  ]);
  return { names, assignments };
}

export type EcommerceEventName =
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase";

export interface EventItem {
  item_id: string; // SKU
  item_name: string;
  price: number; // euros, 2dp
  quantity: number;
}

export interface EcommerceEvent {
  event: EcommerceEventName;
  ecommerce: {
    currency: "EUR";
    value: number;
    items: EventItem[];
  };
}

function toEventItem(item: {
  sku: string;
  title: string;
  priceCents: number;
  quantity: number;
}): EventItem {
  return {
    item_id: item.sku,
    item_name: item.title,
    price: item.priceCents / 100,
    quantity: item.quantity,
  };
}

function buildEvent(
  event: EcommerceEventName,
  items: Array<{ sku: string; title: string; priceCents: number; quantity: number }>,
): EcommerceEvent {
  const eventItems = items.map(toEventItem);
  const value =
    Math.round(
      eventItems.reduce((sum, item) => sum + item.price * item.quantity, 0) *
        100,
    ) / 100;
  return {
    event,
    ecommerce: { currency: "EUR", value, items: eventItems },
  };
}

export function buildViewItemEvent(item: {
  sku: string;
  title: string;
  priceCents: number;
}): EcommerceEvent {
  return buildEvent("view_item", [{ ...item, quantity: 1 }]);
}

export function buildAddToCartEvent(item: {
  sku: string;
  title: string;
  priceCents: number;
  quantity: number;
}): EcommerceEvent {
  return buildEvent("add_to_cart", [item]);
}

export function buildBeginCheckoutEvent(
  items: Array<{ sku: string; title: string; priceCents: number; quantity: number }>,
): EcommerceEvent {
  return buildEvent("begin_checkout", items);
}
