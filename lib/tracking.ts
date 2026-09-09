import { getSetting } from "@/lib/settings";
import { z } from "zod";
import { shippingMethodSchema, type ShippingMethodSetting } from "@/lib/orders/checkout-schema";

/** Carrier tracking URL from Setting templates (§14.12): {number} interpolated. */
export async function trackingUrl(
  carrier: string | null,
  trackingNumber: string | null,
): Promise<string | null> {
  if (!carrier || !trackingNumber) return null;
  const configured = z.record(z.string(), z.string().max(2048)).safeParse(await getSetting<unknown>("tracking.templates"));
  if (!configured.success) return null;
  const templates = configured.data;
  const key = carrier.toLowerCase().includes("gls")
    ? "gls"
    : carrier.toLowerCase().includes("pošta") || carrier.toLowerCase().includes("posta")
      ? "ps"
      : null;
  const template = key ? templates[key] : null;
  if (!template?.includes("{number}")) return null;
  try {
    const url = new URL(template.replaceAll("{number}", encodeURIComponent(trackingNumber)));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
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
  const parsed = z.array(shippingMethodSchema).safeParse(await getSetting<unknown>("shipping.methods"));
  return parsed.success ? parsed.data : [];
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
