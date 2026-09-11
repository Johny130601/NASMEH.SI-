import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { listPages } from "@/lib/admin/cms";
import { admin as copy } from "@/lib/copy";
import { PageCreateForm } from "@/components/admin/PageEditor";

export const metadata: Metadata = { title: copy.content.pages.title, robots: { index: false, follow: false } };

/** /admin/strani — content pages with their template, publication and review state (§14.10). */
export default async function AdminPagesPage() {
  await requirePagePermission("content:manage");
  const pages = await listPages();
  const c = copy.content.pages;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-pages>
      <h1 className="text-[2rem]">{c.title}</h1>
      <div className="mt-4"><PageCreateForm /></div>
      <div className="mt-4 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr><th className="px-4 py-3">{c.columns.title}</th><th className="px-4 py-3">{c.columns.slug}</th><th className="px-4 py-3">{c.columns.template}</th><th className="px-4 py-3">{c.columns.published}</th><th className="px-4 py-3">{c.columns.reviewed}</th><th className="px-4 py-3">{c.columns.updated}</th></tr>
          </thead>
          <tbody>
            {pages.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-4 text-mid-2">{c.empty}</td></tr>
            ) : pages.map((page) => (
              <tr key={page.id} className="border-t border-light-2" data-page-row={page.slug}>
                <td className="px-4 py-3 font-medium"><Link href={`/admin/strani/${page.id}`} className="underline underline-offset-4">{page.title}</Link></td>
                <td className="px-4 py-3 text-mid-1">/{page.slug}</td>
                <td className="px-4 py-3">{c.templates[page.template]}</td>
                <td className="px-4 py-3">{page.published ? copy.common.yes : copy.common.no}</td>
                <td className="px-4 py-3">{page.reviewed ? copy.common.yes : copy.common.no}</td>
                <td className="px-4 py-3 text-mid-1">{page.updatedAt.toLocaleDateString("sl-SI")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
