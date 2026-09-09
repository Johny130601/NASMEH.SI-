import type { Metadata } from "next";
import { getSetting, SETTING_KEYS, type MaintenanceSetting } from "@/lib/settings";
import { buildMetadata } from "@/lib/seo";
import { maintenance as copy } from "@/lib/copy";
import { MaintenanceGate } from "@/components/storefront/MaintenanceGate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.title,
  path: "/vzdrzevanje",
  noindex: true,
});

/**
 * Standalone maintenance page — OUTSIDE the (storefront) group on purpose:
 * middleware rewrites locked requests here, so no chrome queries and no
 * catalog data can leak into the RSC payload.
 */
export default async function VzdrzevanjePage() {
  const setting = await getSetting<MaintenanceSetting>(SETTING_KEYS.maintenance);
  return <MaintenanceGate message={setting?.message} />;
}
