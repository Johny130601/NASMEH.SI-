import { getSetting } from "@/lib/settings";
import { z } from "zod";

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
