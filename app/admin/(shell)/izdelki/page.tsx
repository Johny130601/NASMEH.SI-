import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { listProducts, parseProductFilters, PRODUCT_LIST_LIMIT, PRODUCT_STATUSES, productStockLevel } from "@/lib/admin/catalog";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/admin/dashboard";
import { parseBadges } from "@/lib/catalog";
import { getSetting } from "@/lib/settings";
import { formatEUR } from "@/lib/pricing";
import { admin as copy } from "@/lib/copy";
import { LowStockForm, ProductCreateForm } from "@/components/admin/ProductPanels";

export const metadata: Metadata = { title: copy.catalog.products.title, robots: { index: false, follow: false } };

const inputClass = "rounded-input border border-light-1 bg-white px-3 py-2 text-sm text-dark-1";

/** /admin/izdelki — product list, creation and the low-stock threshold (§14.2). */
export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("catalog:manage");
  const filters = parseProductFilters(await searchParams);
  const [products, thresholdSetting] = await Promise.all([listProducts(filters), getSetting<unknown>("inventory.lowStockThreshold")]);
  const threshold = typeof thresholdSetting === "number" && Number.isInteger(thresholdSetting) ? thresholdSetting : DEFAULT_LOW_STOCK_THRESHOLD;
  const c = copy.catalog.products;

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-products>
      <h1 className="text-[2rem]">{c.title}</h1>
      <div className="mt-4 flex flex-col gap-4">
        <ProductCreateForm />
        <LowStockForm threshold={threshold} />
      </div>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-card border border-light-2 bg-white p-4" aria-label={copy.common.apply}>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {c.searchLabel}
          <input type="search" name="q" defaultValue={filters.q} maxLength={120} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {c.status}
          <select name="status" defaultValue={filters.status ?? ""} className={inputClass}>
            <option value="">{copy.common.all}</option>
            {PRODUCT_STATUSES.map((status) => <option key={status} value={status}>{c.statuses[status]}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-btn bg-dark-1 px-4 py-2 text-sm text-white">{copy.common.apply}</button>
        <Link href="/admin/izdelki" className="rounded-btn border border-light-1 px-4 py-2 text-sm">{copy.common.reset}</Link>
      </form>
      {products.length >= PRODUCT_LIST_LIMIT ? <p role="status" className="mt-3 text-sm text-warning" data-list-truncated>{copy.common.truncated.replace("{n}", String(PRODUCT_LIST_LIMIT))}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr>
              <th className="px-4 py-3">{c.columns.title}</th><th className="px-4 py-3">{c.columns.slug}</th><th className="px-4 py-3">{c.columns.status}</th>
              <th className="px-4 py-3 text-right">{c.columns.price}</th><th className="px-4 py-3 text-right">{c.columns.stock}</th><th className="px-4 py-3">{c.columns.badges}</th>
              <th className="px-4 py-3 text-right">{c.columns.subscribers}</th><th className="px-4 py-3">{c.columns.updated}</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-4 text-mid-2">{c.empty}</td></tr>
            ) : products.map((product) => {
              const stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
              const level = productStockLevel(product.variants, threshold);
              return (
                <tr key={product.id} className="border-t border-light-2" data-product-row={product.slug}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/izdelki/${product.id}`} className="underline underline-offset-4">{product.title}</Link>
                    {product.bundle ? <span className="ml-2 rounded-btn bg-light-3 px-2 py-0.5 text-xs">{c.bundleTag}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-mid-1">{product.slug}</td>
                  <td className="px-4 py-3">{c.statuses[product.status]}{!product.visibleInCatalog ? ` · ${copy.common.no}` : ""}</td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{product.variants[0] ? formatEUR(product.variants[0].priceCents) : copy.common.none}</td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }} data-product-stock-level={level ?? undefined}>
                    <span data-product-stock={stock}>{stock}</span>
                    {level ? <span className={`ml-2 whitespace-nowrap rounded-btn px-2 py-0.5 text-xs font-medium ${level === "out" ? "bg-error text-white" : "bg-warning text-dark-1"}`}>{level === "out" ? c.stockOut : c.stockLow}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-mid-1">{parseBadges(product.badges).map((badge) => badge.label).join(", ") || copy.common.none}</td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{product._count.backInStock}</td>
                  <td className="px-4 py-3 text-mid-1">{product.updatedAt.toLocaleDateString("sl-SI")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
