import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { loadMarketingScreen } from "@/lib/admin/settings";
import { admin as copy } from "@/lib/copy";
import { ConsentEditor } from "@/components/admin/ConsentEditor";
import { AnalyticsForm, GoogleVerificationForm, LegalLinksForm, MaintenanceForm, SeoDefaultsForm } from "@/components/admin/SettingsForms";

export const metadata: Metadata = { title: copy.settings.marketing.title, robots: { index: false, follow: false } };

/** /admin/nastavitve/trzenje — analytics ids, Search Console, SEO defaults, consent, legal links, maintenance (§14.14). */
export default async function AdminMarketingSettingsPage() {
  await requirePagePermission("settings:manage");
  const { analytics, googleVerification, seo, consent, legalLinks, maintenance, maintenanceHasPassword } = await loadMarketingScreen();
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-settings-marketing>
      <Link href="/admin/nastavitve" className="text-sm text-mid-1 underline underline-offset-4">{copy.common.back}</Link>
      <h1 className="mt-3 text-[2rem]">{copy.settings.marketing.title}</h1>
      <div className="mt-6 flex flex-col gap-4">
        <AnalyticsForm initial={analytics} />
        <GoogleVerificationForm initial={googleVerification} />
        <SeoDefaultsForm initial={seo} />
        <ConsentEditor initial={consent} />
        <LegalLinksForm initial={legalLinks} />
        <MaintenanceForm initial={maintenance} hasPassword={maintenanceHasPassword} />
      </div>
    </section>
  );
}
