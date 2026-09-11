import { getShippingSettings, getTrackingTemplates } from "@/lib/settings";
import type { ShippingMethodSetting } from "@/lib/orders/checkout-schema";
import { buildTrackingUrl, type TrackingCarrierKey } from "@/lib/settings-schemas";

/** Carrier names map onto the two template keys by substring (Pošta Slovenije → ps, GLS → gls). */
export function carrierTemplateKey(carrier: string): TrackingCarrierKey | null {
  const name = carrier.toLowerCase();
  if (name.includes("gls")) return "gls";
  if (name.includes("pošta") || name.includes("posta")) return "ps";
  return null;
}

/** Carrier tracking URL from Setting templates (§14.12): {number} interpolated; https-only, no credentials. */
export async function trackingUrl(
  carrier: string | null,
  trackingNumber: string | null,
): Promise<string | null> {
  if (!carrier || !trackingNumber) return null;
  const key = carrierTemplateKey(carrier);
  if (!key) return null;
  const templates = await getTrackingTemplates();
  return buildTrackingUrl(templates[key], trackingNumber);
}

/**
 * Tracking numbers compare without case or whitespace. The length range covers
 * Pošta Slovenije (13 characters) and GLS (11–14) with room for other carriers.
 */
export const TRACKING_NUMBER_PATTERN = /^[A-Z0-9-]{6,40}$/;

export function normalizeTrackingNumber(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.replace(/\s+/g, "").toUpperCase();
  return TRACKING_NUMBER_PATTERN.test(value) ? value : null;
}

/** Configured checkout methods (§8.1); malformed settings yield none. */
export async function getShippingMethods(): Promise<ShippingMethodSetting[]> {
  return (await getShippingSettings()).methods;
}

/** Orders snapshot the chosen method label; older rows may hold the id. */
export function resolveShippingMethod(
  stored: string | null | undefined,
  methods: ShippingMethodSetting[],
): ShippingMethodSetting | null {
  if (!stored) return null;
  return methods.find((method) => method.label === stored)
    ?? methods.find((method) => method.id === stored)
    ?? null;
}

/** Delivery estimate copy for an order's method, or null when unknown. */
export function deliveryEstimate(
  stored: string | null | undefined,
  methods: ShippingMethodSetting[],
): string | null {
  return resolveShippingMethod(stored, methods)?.estimate ?? null;
}

/** Carriers an operator may ship with: every carrier of a configured method. */
export function configuredCarriers(methods: ShippingMethodSetting[]): string[] {
  return [...new Set(methods.map((method) => method.carrier.trim()).filter(Boolean))];
}
