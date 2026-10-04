import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { loadBundle } from "@/lib/admin/catalog";
import { contentLinksToProducts } from "@/lib/admin/cms";
import { admin as copy } from "@/lib/copy";
import { BundleEditor } from "@/components/admin/BundleEditor";

export const metadata: Metadata = { title: copy.catalog.bundles.title, robots: { index: false, follow: false } };

/**
 * /admin/paketi/[id] — the bundle builder over one product (§14.6). An inactive bundle's page answers
 * 404, so the editor names the menus and home blocks that still link to it on every visit — the shell
 * `createBundleAction` makes is inactive, which withdraws a product that was on sale (QA v-a).
 */
export default async function AdminBundleEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("catalog:manage");
  const { id } = await params;
  const product = await loadBundle(id);
  if (!product?.bundle) notFound();
  const linkedFrom = product.bundle.active ? [] : await contentLinksToProducts([product.slug]);
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-bundle={product.slug}>
      <Link href="/admin/paketi" className="text-sm text-mid-1 underline underline-offset-4">{copy.catalog.bundles.editor.back}</Link>
      <h1 className="mt-3 text-[2rem]">{product.title}</h1>
      <p className="text-sm text-mid-1">/{product.slug} · {copy.catalog.products.statuses[product.status]} · <Link href={`/admin/izdelki/${product.id}`} className="underline underline-offset-4">{copy.catalog.products.title}</Link></p>
      {/* The bundle product's own stock row caps what is sold (lib/bundle/availability); a new bundle starts at 0 and
          would read sold out with every component in stock, with nothing on this page saying why (QA 2026-10-03 T5-03). */}
      {(product.variants[0]?.stock ?? 0) <= 0 ? (
        <p role="status" className="mt-4 rounded-card border border-warning bg-white p-4 text-sm" data-bundle-own-stock-zero>
          {copy.catalog.bundles.editor.ownStockZero.replace("{stock}", String(product.variants[0]?.stock ?? 0))}{" "}
          <Link href={`/admin/izdelki/${product.id}`} className="underline underline-offset-4">{copy.catalog.bundles.editor.ownStockLink}</Link>
        </p>
      ) : null}
      <div className="mt-6">
        <BundleEditor
          productId={product.id}
          priceCents={product.bundle.priceCents}
          active={product.bundle.active}
          items={product.bundle.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity }))}
          options={product.options.variants.map((variant) => ({ id: variant.id, sku: variant.sku, title: variant.title, priceCents: variant.priceCents, productTitle: variant.product.title }))}
          linkedFrom={linkedFrom}
        />
      </div>
    </section>
  );
}
