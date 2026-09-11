import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { listMenus } from "@/lib/admin/cms";
import { admin as copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.content.menus.title, robots: { index: false, follow: false } };

/** /admin/navigacija — the seven menu handles (§14.10). */
export default async function AdminMenusPage() {
  await requirePagePermission("content:manage");
  const menus = await listMenus();
  const c = copy.content.menus;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-menus>
      <h1 className="text-[2rem]">{c.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-mid-1">{c.intro}</p>
      <div className="mt-4 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr><th className="px-4 py-3">{c.columns.handle}</th><th className="px-4 py-3">{c.columns.title}</th><th className="px-4 py-3 text-right">{c.columns.items}</th><th className="px-4 py-3">{c.columns.updated}</th></tr>
          </thead>
          <tbody>
            {menus.map((menu) => (
              <tr key={menu.handle} className="border-t border-light-2" data-menu-row={menu.handle}>
                <td className="px-4 py-3 font-medium"><Link href={`/admin/navigacija/${menu.handle}`} className="underline underline-offset-4">{c.handles[menu.handle]}</Link></td>
                <td className="px-4 py-3 text-mid-1">{menu.title || copy.common.none}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{menu.itemCount}</td>
                <td className="px-4 py-3 text-mid-1">{menu.updatedAt ? menu.updatedAt.toLocaleDateString("sl-SI") : copy.common.none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
