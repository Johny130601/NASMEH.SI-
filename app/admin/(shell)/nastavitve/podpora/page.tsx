import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { loadContactScreen } from "@/lib/admin/settings";
import { admin as copy } from "@/lib/copy";
import { SupportContactForm } from "@/components/admin/SettingsForms";

export const metadata: Metadata = { title: copy.settings.support.title, robots: { index: false, follow: false } };

/** /admin/nastavitve/podpora — the `support.contact` setting (Phase 6 schema). */
export default async function AdminSupportSettingsPage() {
  await requirePagePermission("settings:manage");
  const { contact } = await loadContactScreen();
  return (
    <section className="mx-auto max-w-3xl" data-admin-settings-support>
      <Link href="/admin/nastavitve" className="text-sm text-mid-1 underline underline-offset-4">{copy.common.back}</Link>
      <h1 className="mt-3 text-[2rem]">{copy.settings.support.title}</h1>
      <div className="mt-6"><SupportContactForm initial={contact} /></div>
    </section>
  );
}
