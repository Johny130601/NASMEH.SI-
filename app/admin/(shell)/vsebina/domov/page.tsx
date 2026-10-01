import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { loadHomeEditor } from "@/lib/admin/cms";
import { db } from "@/lib/db";
import { admin as copy } from "@/lib/copy";
import { BundleBannerEditor, HeroEditor, RoutineBannerEditor, SectionsEditor } from "@/components/admin/HomeEditor";

export const metadata: Metadata = { title: copy.content.home.title, robots: { index: false, follow: false } };

/** /admin/vsebina/domov — section order, hero and banners (§14.10). */
export default async function AdminHomePage() {
  await requirePagePermission("content:manage");
  const [editor, media] = await Promise.all([loadHomeEditor(), db.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, select: { url: true, alt: true } })]);
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-home>
      <Link href="/admin/vsebina" className="text-sm text-mid-1 underline underline-offset-4">{copy.common.back}</Link>
      <h1 className="mt-3 text-[2rem]">{copy.content.home.title}</h1>
      <div className="mt-6 flex flex-col gap-4">
        <SectionsEditor initial={editor.sections} />
        <HeroEditor initial={editor.hero} media={media} unavailableLinks={editor.unavailableLinks.hero} />
        <BundleBannerEditor initial={editor.bundleBanner} unavailableLinks={editor.unavailableLinks.bundleBanner} />
        <RoutineBannerEditor initial={editor.routineBanner} media={media} unavailableLinks={editor.unavailableLinks.routineBanner} />
      </div>
    </section>
  );
}
