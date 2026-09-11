import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { legal } from "@/lib/copy";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ slug: string }>;
}

async function getPage(slug: string) {
  return db.contentPage.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return buildMetadata({
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? undefined,
    path: `/${page.slug}`,
  });
}

/** ContentPage rendering (§12.5): DEFAULT, LEGAL (draft notice), CONTACT (form link), LANDING (wide, no date). */
export default async function ContentPageRoute({ params }: Params) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();
  const landing = page.template === "LANDING";

  return (
    <article className={`mx-auto ${landing ? "max-w-(--container-wide)" : "max-w-(--container-narrow)"} px-(--padding) py-16`} data-content-template={page.template}>
      <h1 className="text-[2rem] md:text-[2.5rem]">{page.title}</h1>

      {page.template === "LEGAL" && !page.reviewed ? (
        <p
          role="note"
          className="mt-6 rounded-card border border-warning bg-white p-4 text-sm text-dark-1"
        >
          {legal.draftNotice}
        </p>
      ) : null}

      {landing ? null : (
        <p className="mt-4 text-xs text-mid-2">
          {legal.lastUpdated}:{" "}
          {page.updatedAt.toLocaleDateString("sl-SI", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}

      {/* Admin-authored trusted content (Phase 7 editor) */}
      <div
        className="content-prose mt-8"
        dangerouslySetInnerHTML={{ __html: page.body }}
      />
      {page.template === "CONTACT" ? (
        <p className="mt-8">
          <Link href="/kontakt" className="inline-flex min-h-12 items-center rounded-btn bg-dark-1 px-6 text-sm font-medium text-white">{legal.contactCta}</Link>
        </p>
      ) : null}
    </article>
  );
}
