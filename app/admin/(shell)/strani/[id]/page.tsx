import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { loadPage } from "@/lib/admin/cms";
import { protectedPageSlugs } from "@/lib/admin/cms-schemas";
import { admin as copy } from "@/lib/copy";
import { getLegalLinks } from "@/lib/settings";
import { PageEditor } from "@/components/admin/PageEditor";

export const metadata: Metadata = { title: copy.content.pages.title, robots: { index: false, follow: false } };

/** /admin/strani/[id] — page editor with a server-rendered preview of the saved body (§14.10). */
export default async function AdminPageEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("content:manage");
  const { id } = await params;
  const [page, legalLinks] = await Promise.all([loadPage(id), getLegalLinks()]);
  if (!page) notFound();
  // The editor mirrors the actions' guard; savePageAction and deletePageAction re-check it.
  const locked = protectedPageSlugs(Object.values(legalLinks)).has(page.slug);
  const c = copy.content.pages.editor;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-page={page.slug}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/strani" className="text-sm text-mid-1 underline underline-offset-4">{c.back}</Link>
        {page.published ? <Link href={`/${page.slug}`} className="text-sm underline underline-offset-4" target="_blank" rel="noopener noreferrer">{c.view}</Link> : null}
      </div>
      <h1 className="mt-3 text-[2rem]">{page.title}</h1>
      <div className="mt-6 grid gap-4 xl:grid-cols-[3fr_2fr]">
        <PageEditor
          pageId={page.id}
          locked={locked}
          initial={{ title: page.title, slug: page.slug, template: page.template, body: page.body, seoTitle: page.seoTitle ?? "", seoDescription: page.seoDescription ?? "", published: page.published, reviewed: page.reviewed }}
        />
        <section className="rounded-card border border-light-2 bg-white p-5" data-page-preview>
          <h2 className="text-base font-medium">{c.preview}</h2>
          {page.body.trim() ? (
            <div className="content-prose mt-4" dangerouslySetInnerHTML={{ __html: page.body }} />
          ) : (
            <p className="mt-4 text-sm text-mid-2">{c.previewEmpty}</p>
          )}
        </section>
      </div>
    </section>
  );
}
