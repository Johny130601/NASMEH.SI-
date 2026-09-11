import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { loadPopup } from "@/lib/admin/cms";
import { admin as copy } from "@/lib/copy";
import { PopupForm } from "@/components/admin/CmsForms";

export const metadata: Metadata = { title: copy.content.popup.title, robots: { index: false, follow: false } };

/** /admin/vsebina/popup — the welcome popup setting (§14.11). */
export default async function AdminPopupPage() {
  await requirePagePermission("content:manage");
  const popup = await loadPopup();
  return (
    <section className="mx-auto max-w-3xl" data-admin-popup>
      <Link href="/admin/vsebina" className="text-sm text-mid-1 underline underline-offset-4">{copy.common.back}</Link>
      <h1 className="mt-3 text-[2rem]">{copy.content.popup.title}</h1>
      <div className="mt-6"><PopupForm initial={popup} /></div>
    </section>
  );
}
