import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { listCollections } from "@/lib/admin/catalog";
import { admin as copy } from "@/lib/copy";
import { CollectionCreateForm } from "@/components/admin/CollectionEditor";

export const metadata: Metadata = { title: copy.catalog.collections.title, robots: { index: false, follow: false } };

/** /admin/kolekcije — collection list and creation (§14.3). */
export default async function AdminCollectionsPage() {
  await requirePagePermission("catalog:manage");
  const collections = await listCollections();
  const c = copy.catalog.collections;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-collections>
      <h1 className="text-[2rem]">{c.title}</h1>
      <div className="mt-4"><CollectionCreateForm /></div>
      <div className="mt-4 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr><th className="px-4 py-3">{c.columns.title}</th><th className="px-4 py-3">{c.columns.slug}</th><th className="px-4 py-3 text-right">{c.columns.products}</th><th className="px-4 py-3">{c.columns.noindex}</th><th className="px-4 py-3">{c.columns.updated}</th></tr>
          </thead>
          <tbody>
            {collections.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-4 text-mid-2">{c.empty}</td></tr>
            ) : collections.map((collection) => (
              <tr key={collection.id} className="border-t border-light-2" data-collection-row={collection.slug}>
                <td className="px-4 py-3 font-medium"><Link href={`/admin/kolekcije/${collection.id}`} className="underline underline-offset-4">{collection.title}</Link></td>
                <td className="px-4 py-3 text-mid-1">{collection.slug}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{collection._count.products}</td>
                <td className="px-4 py-3">{collection.noindex ? copy.common.yes : copy.common.no}</td>
                <td className="px-4 py-3 text-mid-1">{collection.updatedAt.toLocaleDateString("sl-SI")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
