import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { loadCollection } from "@/lib/admin/catalog";
import { admin as copy } from "@/lib/copy";
import { CollectionEditor } from "@/components/admin/CollectionEditor";

export const metadata: Metadata = { title: copy.catalog.collections.title, robots: { index: false, follow: false } };

/** /admin/kolekcije/[id] — fields, banners and manual merchandising order (§14.3). */
export default async function AdminCollectionEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("catalog:manage");
  const { id } = await params;
  const collection = await loadCollection(id);
  if (!collection) notFound();
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-collection={collection.slug}>
      <Link href="/admin/kolekcije" className="text-sm text-mid-1 underline underline-offset-4">{copy.catalog.collections.editor.back}</Link>
      <h1 className="mt-3 text-[2rem]">{collection.title}</h1>
      <p className="text-sm text-mid-1">/trgovina?kolekcija={collection.slug}</p>
      <div className="mt-6">
        <CollectionEditor
          collectionId={collection.id}
          fields={{ title: collection.title, slug: collection.slug, seoTitle: collection.seoTitle ?? "", seoDescription: collection.seoDescription ?? "", noindex: collection.noindex, hideBannerText: collection.hideBannerText }}
          bannerImage={collection.bannerImage}
          bannerImageMobile={collection.bannerImageMobile}
          products={collection.products.map((entry) => ({ productId: entry.productId, title: entry.product.title, slug: entry.product.slug, status: entry.product.status }))}
          candidates={collection.candidates}
        />
      </div>
    </section>
  );
}
