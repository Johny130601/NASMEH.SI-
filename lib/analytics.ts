/**
 * GA4-style ecommerce event builders (spec §3.5) — PURE, unit-tested.
 * Pushed to window.dataLayer via the Phase 1 CMP gate; with no GTM ID /
 * no analytics consent the pushes are inert (documented).
 */

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
