import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { loadShippingScreen } from "@/lib/admin/settings";
import { admin as copy } from "@/lib/copy";
import { ShippingEditor, TrackingTemplatesForm } from "@/components/admin/ShippingEditor";

export const metadata: Metadata = { title: copy.settings.shipping.title, robots: { index: false, follow: false } };

/** /admin/nastavitve/dostava — methods by country, thresholds, tracking templates (§14.12). */
export default async function AdminShippingSettingsPage() {
  await requirePagePermission("settings:manage");
  const { shipping, templates, countries } = await loadShippingScreen();
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-settings-shipping>
      <Link href="/admin/nastavitve" className="text-sm text-mid-1 underline underline-offset-4">{copy.common.back}</Link>
      <h1 className="mt-3 text-[2rem]">{copy.settings.shipping.title}</h1>
      <div className="mt-6 flex flex-col gap-4">
        <ShippingEditor initial={shipping} countries={countries} />
        <TrackingTemplatesForm initial={templates} />
      </div>
    </section>
  );
}
