import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { getBundleBuilder } from "@/lib/settings";
import { admin as copy } from "@/lib/copy";
import { BundleBuilderForm } from "@/components/admin/CmsForms";

export const metadata: Metadata = { title: copy.content.bundle.title, robots: { index: false, follow: false } };

/** /admin/vsebina/paket — the bundle builder setting the storefront reads at /sestavi-paket (§8.17). */
export default async function AdminBundleBuilderPage() {
  await requirePagePermission("content:manage");
  const bundle = await getBundleBuilder();
  return (
    <section className="mx-auto max-w-3xl" data-admin-bundle>
      <Link href="/admin/vsebina" className="text-sm text-mid-1 underline underline-offset-4">{copy.common.back}</Link>
      <h1 className="mt-3 text-[2rem]">{copy.content.bundle.title}</h1>
      <div className="mt-6"><BundleBuilderForm initial={bundle} /></div>
    </section>
  );
}
