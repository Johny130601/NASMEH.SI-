import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { loadProductEditor, parseAccordions, parseBadgesForEditor, parseEducation, parseFaq, parseMerchandising } from "@/lib/admin/catalog";
import { formatEUR } from "@/lib/pricing";
import { admin as copy } from "@/lib/copy";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { VariantEditor } from "@/components/admin/VariantEditor";
import { MediaManager } from "@/components/admin/MediaManager";
import { CollectionMembership, RestockPanel } from "@/components/admin/ProductPanels";

export const metadata: Metadata = { title: copy.catalog.products.title, robots: { index: false, follow: false } };

const c = copy.catalog.editor;

/** /admin/izdelki/[id] — the product editor (§14.2). */
export default async function AdminProductEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("catalog:manage");
  const { id } = await params;
  const product = await loadProductEditor(id);
  if (!product) notFound();

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-product={product.slug}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/izdelki" className="text-sm text-mid-1 underline underline-offset-4">{c.back}</Link>
        <Link href={`/izdelek/${product.slug}`} className="text-sm underline underline-offset-4" target="_blank" rel="noopener noreferrer">{c.view}</Link>
      </div>
      <h1 className="mt-3 text-[2rem]">{product.title}</h1>
      <p className="text-sm text-mid-1">/{product.slug} · {copy.catalog.products.statuses[product.status]}{product.bundle ? ` · ${copy.catalog.products.bundleTag}` : ""}</p>

      <div className="mt-6">
        <ProductEditor
          productId={product.id}
          basics={{
            title: product.title, slug: product.slug, status: product.status, description: product.description,
            seoTitle: product.seoTitle ?? "", seoDescription: product.seoDescription ?? "",
            visibleInCatalog: product.visibleInCatalog, visibleInSearch: product.visibleInSearch, hiddenDeal: product.hiddenDeal,
            klarnaEligible: product.klarnaEligible, soldOutBehavior: product.soldOutBehavior,
          }}
          content={{
            badges: parseBadgesForEditor(product.badges),
            merchandising: parseMerchandising(product.customFields),
            accordions: parseAccordions(product.accordions),
            faq: parseFaq(product.faq),
            education: parseEducation(product.education),
          }}
          crossSellOptions={product.crossSellOptions}
        />
      </div>

      <section className="mt-6 rounded-card border border-light-2 bg-white p-5">
        <h2 className="text-base font-medium">{c.sections.variants}</h2>
        <div className="mt-4">
          <VariantEditor
            productId={product.id}
            isBundle={product.bundle !== null}
            variants={product.variants.map((variant) => ({
              id: variant.id, title: variant.title, sku: variant.sku, priceCents: variant.priceCents, compareAtPriceCents: variant.compareAtPriceCents,
              costCents: variant.costCents, barcode: variant.barcode, weightGrams: variant.weightGrams, stock: variant.stock,
              maxCartQuantity: variant.maxCartQuantity, allowBackorder: variant.allowBackorder, backorderNote: variant.backorderNote,
              orderItems: variant._count.orderItems, bundleItems: variant._count.bundleItems, priceRows: variant._count.priceHistory,
            }))}
          />
        </div>
      </section>

      <section className="mt-6 rounded-card border border-light-2 bg-white p-5">
        <h2 className="text-base font-medium">{c.sections.media}</h2>
        <div className="mt-4">
          <MediaManager productId={product.id} media={product.media.map((item) => ({ id: item.id, url: item.url, alt: item.alt, kind: item.kind, sortOrder: item.sortOrder }))} />
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-light-2 bg-white p-5" data-price-history>
          <h2 className="text-base font-medium">{c.sections.history}</h2>
          {product.variants.map((variant) => (
            <div key={variant.id} className="mt-3">
              <h3 className="text-sm font-medium">{variant.sku}</h3>
              {variant.priceHistory.length === 0 ? <p className="text-sm text-mid-2">{c.history.empty}</p> : (
                <table className="mt-1 w-full text-xs">
                  <thead className="text-left text-mid-2"><tr><th className="py-1 pr-2">{c.history.date}</th><th className="py-1 pr-2 text-right">{c.history.price}</th><th className="py-1 text-right">{c.history.compareAt}</th></tr></thead>
                  <tbody>
                    {variant.priceHistory.map((entry) => (
                      <tr key={entry.id} className="border-t border-light-2">
                        <td className="py-1 pr-2">{entry.createdAt.toLocaleDateString("sl-SI")}</td>
                        <td className="py-1 pr-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(entry.priceCents)}</td>
                        <td className="py-1 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{entry.compareAtPriceCents !== null ? formatEUR(entry.compareAtPriceCents) : copy.common.none}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </section>
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{c.sections.restock}</h2>
          <div className="mt-3">
            <RestockPanel productId={product.id} counts={product.subscribers} hasStock={product.status === "ACTIVE" && product.variants.some((variant) => variant.stock > 0)} />
          </div>
        </section>
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{c.sections.collections}</h2>
          <div className="mt-3">
            <CollectionMembership productId={product.id} collections={product.collections} />
          </div>
        </section>
      </div>
    </section>
  );
}
