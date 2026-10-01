import { admin as copy } from "@/lib/copy/admin";
import { formatEUR } from "@/lib/pricing";

/**
 * Readable renderings of what the order records store as machine strings
 * (QA N3, M3, T5-08): timeline events and their `detail`, the reason a
 * captured payment is owed back, and the euro amount an operator types.
 * Pure — the admin pages and the client refund form share it.
 */

export interface OrderItemRef {
  variantId: string | null;
  sku: string;
  title: string;
  properties?: unknown;
}

const timeline = copy.orders.timeline;
const details = timeline.details;

const fill = (template: string, key: string, value: string) => template.replace(`{${key}}`, value);
const actor = (name: string) => fill(details.actor, "actor", name);

export function providerLabel(provider: string): string {
  return (copy.orders.providers as Record<string, string>)[provider] ?? provider;
}

/** `event` or `event:kind` (the mail outcome entries) → the label; an unknown event stays as stored. */
export function timelineEventLabel(event: string): string {
  const [name, ...rest] = event.split(":");
  const label = (timeline as Record<string, unknown>)[name];
  const text = typeof label === "string" ? label : name;
  if (!rest.length) return text;
  const kind = rest.join(":");
  return `${text} (${(details.mailKinds as Record<string, string>)[kind] ?? kind})`;
}

/** The SKU (or, for a bundle component, its title) of the variant a stock-out names. */
function stockoutItem(variantId: string, items: OrderItemRef[]): string | null {
  for (const item of items) {
    if (item.variantId === variantId) return item.sku;
    const components = (item.properties as { bundleComponents?: Array<{ variantId?: unknown; sku?: unknown; title?: unknown }> } | null)?.bundleComponents;
    if (!Array.isArray(components)) continue;
    const component = components.find((entry) => entry.variantId === variantId);
    if (component) return typeof component.sku === "string" ? component.sku : typeof component.title === "string" ? component.title : item.sku;
  }
  return null;
}

/** Why a captured payment is owed back (`Order.fulfillmentIssue`); null when the order carries no known reason. */
export function refundRequiredReason(issue: string | null | undefined, items: OrderItemRef[]): string | null {
  if (!issue) return null;
  const reasons = copy.orders.detail.refundRequiredReasons as Record<string, string>;
  if (issue.startsWith("stockout:")) {
    const sku = stockoutItem(issue.slice("stockout:".length), items);
    return sku ? fill(reasons.stockout, "sku", sku) : reasons.stockoutUnknown;
  }
  return reasons[issue] ?? null;
}

/** Splits `value:actor` at the last colon (a free-text reason may contain colons, an e-mail never does). */
function splitActor(detail: string): [string, string] | null {
  const index = detail.lastIndexOf(":");
  return index > 0 && index < detail.length - 1 ? [detail.slice(0, index), detail.slice(index + 1)] : null;
}

/**
 * The stored `detail` of one timeline entry in words. Formats written by
 * lib/orders: `provider:<id>`, `cents:<n>[:<actor>]`, `variants:<n>:<actor>`,
 * `<carrier>:<actor>`, `<reason>:<actor>`, a fulfilment issue, or the actor.
 * Anything unrecognised is shown as stored rather than guessed at.
 */
export function timelineDetail(event: string, detail: string | undefined, items: OrderItemRef[] = []): string {
  if (!detail) return "";
  const name = event.split(":")[0];
  const cents = /^cents:(\d+)(?::(.+))?$/.exec(detail);
  if (cents) return [fill(details.amount, "amount", formatEUR(Number(cents[1]))), cents[2] ? actor(cents[2]) : null].filter(Boolean).join(" · ");
  const variants = /^variants:(\d+):(.+)$/.exec(detail);
  if (variants) return `${fill(details.variants, "count", variants[1])} · ${actor(variants[2])}`;
  switch (name) {
    case "created":
    case "paid":
    case "payment_cancelled":
      return fill(details.provider, "provider", providerLabel(detail.startsWith("provider:") ? detail.slice("provider:".length) : detail));
    case "payment_failed":
      return Object.hasOwn(copy.orders.providers, detail) ? fill(details.provider, "provider", providerLabel(detail)) : detail;
    case "payment_received_refund_required":
      return refundRequiredReason(detail, items) ?? detail;
    case "processing":
    case "delivered":
    case "anonymised":
    case "note_added":
    case "confirmation_resent":
    case "confirmation_requeued":
    case "shipped_resent":
    case "shipped_requeued":
      return actor(detail);
    case "shipped": {
      const parts = splitActor(detail);
      return parts ? `${fill(details.carrier, "carrier", parts[0])} · ${actor(parts[1])}` : fill(details.carrier, "carrier", detail);
    }
    case "cancelled": {
      const parts = splitActor(detail);
      return parts ? `${fill(details.reason, "reason", parts[0])} · ${actor(parts[1])}` : fill(details.reason, "reason", detail);
    }
    default:
      return detail;
  }
}

/**
 * An operator's euro amount ("-2,00", "−5", "12.5 €") → signed cents; "" is 0.
 * Exactly one decimal separator (comma or dot) with at most two decimals, so
 * "-2.00" can never be read as −2 cents and "1.234" is refused, not guessed.
 */
export function parseEuroCents(input: string): number | null {
  const text = input.trim().replace(/\s+/g, "").replace(/€$/, "").replace(/^[−–]/, "-");
  if (text === "") return 0;
  const match = /^([+-]?)(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] === "-" && cents > 0 ? -cents : cents;
}
