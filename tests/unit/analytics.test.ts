import { afterEach, describe, expect, it, vi } from "vitest";
import { pushEvent } from "@/components/storefront/analytics/TrackViewItem";
import {
  analyticsAllowed,
  buildAddToCartEvent,
  buildBeginCheckoutEvent,
  buildViewItemEvent,
  consentDataLayerEvent,
  consentModeSignals,
  gtmAllowed,
  trackerCookieExpiry,
} from "@/lib/analytics";

describe("ecommerce event builders (§3.5)", () => {
  it("view_item with SKU/value/currency", () => {
    expect(
      buildViewItemEvent({
        sku: "NAS-TRK-14",
        title: "Belilni trakci",
        priceCents: 3499,
      }),
    ).toEqual({
      event: "view_item",
      ecommerce: {
        currency: "EUR",
        value: 34.99,
        items: [
          { item_id: "NAS-TRK-14", item_name: "Belilni trakci", price: 34.99, quantity: 1 },
        ],
      },
    });
  });

  it("add_to_cart carries quantity", () => {
    const event = buildAddToCartEvent({
      sku: "NAS-UST-500",
      title: "Ustna voda",
      priceCents: 1999,
      quantity: 2,
    });
    expect(event.event).toBe("add_to_cart");
    expect(event.ecommerce.value).toBe(39.98);
    expect(event.ecommerce.items[0].quantity).toBe(2);
  });

  it("begin_checkout sums mixed lines", () => {
    const event = buildBeginCheckoutEvent([
      { sku: "NAS-PAK-RUTINA", title: "Paket", priceCents: 4999, quantity: 1 },
      { sku: "NAS-TRK-14", title: "Trakci", priceCents: 3499, quantity: 2 },
    ]);
    expect(event.event).toBe("begin_checkout");
    expect(event.ecommerce.value).toBe(119.97);
    expect(event.ecommerce.items).toHaveLength(2);
  });
});

describe("consent gating of tags and events (Phase 9 step 4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the categories to Consent Mode v2 signals and the dataLayer consent event", () => {
    expect(consentModeSignals({ analytics: true, marketing: false })).toEqual({
      analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    });
    expect(consentModeSignals({ analytics: false, marketing: true })).toEqual({
      analytics_storage: "denied", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted",
    });
    expect(consentDataLayerEvent({ analytics: false, marketing: true })).toEqual({ event: "nasmeh_consent", analytics: false, marketing: true });
  });

  it("loads GTM for either optional category and allows ecommerce events only with analytics", () => {
    expect(gtmAllowed(null)).toBe(false);
    expect(gtmAllowed({ analytics: false, marketing: false })).toBe(false);
    expect(gtmAllowed({ analytics: true, marketing: false })).toBe(true);
    expect(gtmAllowed({ analytics: false, marketing: true })).toBe(true);
    expect(analyticsAllowed(undefined)).toBe(false);
    expect(analyticsAllowed({ analytics: false })).toBe(false);
    expect(analyticsAllowed({ analytics: "true" })).toBe(false);
    expect(analyticsAllowed({ analytics: true })).toBe(true);
  });

  it("drops ecommerce events before analytics consent instead of queueing them for GTM", () => {
    const event = buildViewItemEvent({ sku: "NAS-TRK-14", title: "Trakci", priceCents: 3499 });
    const browser: { dataLayer?: unknown[]; __nasmehConsent?: { analytics: boolean; marketing: boolean } } = {};
    vi.stubGlobal("window", browser);

    pushEvent(event);
    expect(browser.dataLayer).toBeUndefined();
    browser.__nasmehConsent = { analytics: false, marketing: true };
    pushEvent(event);
    expect(browser.dataLayer).toBeUndefined();

    browser.__nasmehConsent = { analytics: true, marketing: false };
    pushEvent(event);
    expect(browser.dataLayer).toEqual([event]);
  });

  it("expires matching tracker cookies host-only and on every parent domain", () => {
    const { names, assignments } = trackerCookieExpiry(
      "nasmeh_cart=abc; _ga=GA1.1.1; _ga_ABC123=GS1; _gcl_au=1; other=_ga",
      ["_ga", "_ga_*", "_gid"],
      "www.nasmeh.si",
    );
    expect(names).toEqual(["_ga", "_ga_ABC123"]);
    expect(assignments).toEqual([
      "_ga=; Max-Age=0; path=/",
      "_ga=; Max-Age=0; path=/; domain=www.nasmeh.si",
      "_ga=; Max-Age=0; path=/; domain=nasmeh.si",
      "_ga_ABC123=; Max-Age=0; path=/",
      "_ga_ABC123=; Max-Age=0; path=/; domain=www.nasmeh.si",
      "_ga_ABC123=; Max-Age=0; path=/; domain=nasmeh.si",
    ]);
  });

  it("stays host-only on localhost and IP hosts, and does nothing without a match", () => {
    expect(trackerCookieExpiry("_fbp=fb.1", ["_fbp"], "127.0.0.1").assignments).toEqual(["_fbp=; Max-Age=0; path=/"]);
    expect(trackerCookieExpiry("_fbp=fb.1", ["_fbp"], "localhost").assignments).toEqual(["_fbp=; Max-Age=0; path=/"]);
    expect(trackerCookieExpiry("", ["_fbp"], "nasmeh.si")).toEqual({ names: [], assignments: [] });
    expect(trackerCookieExpiry("nasmeh_consent=x", ["_ga*"], "nasmeh.si")).toEqual({ names: [], assignments: [] });
  });
});
