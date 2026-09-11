import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { loadMenu } from "@/lib/admin/cms";
import { admin as copy } from "@/lib/copy";
import { MenuEditor } from "@/components/admin/MenuEditor";

export const metadata: Metadata = { title: copy.content.menus.title, robots: { index: false, follow: false } };

/** /admin/navigacija/[handle] — structured menu editor (§14.10). */
export default async function AdminMenuEditorPage({ params }: { params: Promise<{ handle: string }> }) {
  await requirePagePermission("content:manage");
  const { handle } = await params;
  const menu = await loadMenu(handle);
  if (!menu) notFound();
  const c = copy.content.menus;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-menu={menu.handle}>
      <Link href="/admin/navigacija" className="text-sm text-mid-1 underline underline-offset-4">{c.editor.back}</Link>
      <h1 className="mt-3 text-[2rem]">{c.handles[menu.handle as keyof typeof c.handles]}</h1>
      <div className="mt-6">
        <MenuEditor handle={menu.handle} title={menu.title} items={menu.items} withFeatured={menu.handle === "header" || menu.handle === "mobile"} />
      </div>
    </section>
  );
}
