import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { bundleOptions, listBundles } from "@/lib/admin/catalog";
import { bundleSavings, formatEUR } from "@/lib/pricing";
import { admin as copy } from "@/lib/copy";
import { BundleCreateForm } from "@/components/admin/BundleEditor";

export const metadata: Metadata = { title: copy.catalog.bundles.title, robots: { index: false, follow: false } };

/** /admin/paketi — fixed bundles with their savings math (§14.6). */
export default async function AdminBundlesPage() {
  await requirePagePermission("catalog:manage");
  const [bundles, options] = await Promise.all([listBundles(), bundleOptions()]);
  const c = copy.catalog.bundles;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-bundles>
      <h1 className="text-[2rem]">{c.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-mid-1">{c.intro}</p>
      <div className="mt-4"><BundleCreateForm products={options.products.filter((product) => product.status !== "ARCHIVED")} /></div>
      <div className="mt-4 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr><th className="px-4 py-3">{c.columns.title}</th><th className="px-4 py-3 text-right">{c.columns.price}</th><th className="px-4 py-3 text-right">{c.columns.value}</th><th className="px-4 py-3 text-right">{c.columns.savings}</th><th className="px-4 py-3">{c.columns.active}</th><th className="px-4 py-3">{c.columns.components}</th></tr>
          </thead>
          <tbody>
            {bundles.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-4 text-mid-2">{c.empty}</td></tr>
            ) : bundles.map((product) => {
              const bundle = product.bundle!;
              const savings = bundleSavings(bundle.items.map((item) => item.variant.priceCents * item.quantity), bundle.priceCents);
              return (
                <tr key={product.id} className="border-t border-light-2" data-bundle-row={product.slug}>
                  <td className="px-4 py-3 font-medium"><Link href={`/admin/paketi/${product.id}`} className="underline underline-offset-4">{product.title}</Link></td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(bundle.priceCents)}</td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(savings.valueCents)}</td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(savings.savingsCents)} ({savings.savingsPercent} %)</td>
                  <td className="px-4 py-3">{bundle.active ? copy.common.yes : copy.common.no}</td>
                  <td className="px-4 py-3 text-mid-1">{bundle.items.map((item) => `${item.quantity} × ${item.variant.sku}`).join(", ") || copy.common.none}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
