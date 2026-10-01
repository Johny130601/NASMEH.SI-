import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { loadDashboard, MAX_RANGE_DAYS, parseDashboardRange, type RangePreset } from "@/lib/admin/dashboard";
import { formatEUR } from "@/lib/pricing";
import { admin as copy } from "@/lib/copy";
import { BarChart } from "@/components/admin/BarChart";

export const metadata: Metadata = { title: copy.dashboard.title, robots: { index: false, follow: false } };

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-light-2 bg-white p-5" data-kpi={label}>
      <p className="text-sm text-mid-1">{label}</p>
      <p className="mt-2 text-[1.75rem] font-semibold leading-none text-dark-1">{value}</p>
      {hint ? <p className="mt-2 text-xs text-mid-2">{hint}</p> : null}
    </div>
  );
}

/** /admin — dashboard home (§14.1). */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ obdobje?: string; od?: string; do?: string; dostop?: string }>;
}) {
  await requirePagePermission("dashboard:view");
  const query = await searchParams;
  const range = parseDashboardRange(query);
  const data = await loadDashboard(range);
  const presets: RangePreset[] = ["7d", "30d", "90d"];
  const count = (value: number) => String(value);
  const statusLabel = (status: string) =>
    copy.dashboard.statuses[status as keyof typeof copy.dashboard.statuses] ?? status;

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-dashboard>
      <h1 className="text-[2rem]">{copy.dashboard.title}</h1>
      {query.dostop === "zavrnjen" ? (
        <p role="alert" className="mt-4 rounded-card border border-warning bg-white p-4 text-sm text-dark-1" data-forbidden-notice>
          {copy.shell.forbidden}
        </p>
      ) : null}

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-card border border-light-2 bg-white p-4" aria-label={copy.dashboard.rangeLabel}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={copy.dashboard.rangeLabel}>
          {presets.map((preset) => (
            <Link
              key={preset}
              href={`/admin?obdobje=${preset}`}
              aria-current={range.preset === preset ? "page" : undefined}
              className={[
                "rounded-btn border px-4 py-2 text-sm",
                range.preset === preset ? "border-dark-1 bg-dark-1 text-white" : "border-light-1 bg-white text-dark-1",
              ].join(" ")}
            >
              {copy.dashboard.presets[preset]}
            </Link>
          ))}
        </div>
        <input type="hidden" name="obdobje" value="custom" />
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.dashboard.from}
          <input type="date" name="od" defaultValue={isoDate(range.from)} className="rounded-input border border-light-1 px-3 py-2 text-sm text-dark-1" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.dashboard.to}
          <input type="date" name="do" defaultValue={isoDate(range.to)} className="rounded-input border border-light-1 px-3 py-2 text-sm text-dark-1" />
        </label>
        <button type="submit" className="rounded-btn border border-light-1 bg-white px-4 py-2 text-sm text-dark-1">
          {copy.dashboard.apply}
        </button>
      </form>

      {range.invalid ? (
        <p role="alert" className="mt-3 rounded-card border border-warning bg-white p-3 text-sm text-dark-1" data-range-invalid={range.invalid}>
          {copy.dashboard.invalidRange[range.invalid].replace("{max}", String(MAX_RANGE_DAYS))}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatTile label={copy.dashboard.kpis.revenue} value={formatEUR(data.kpis.revenueCents)} hint={`${copy.dashboard.kpis.refunded}: ${formatEUR(data.kpis.refundedCents)}`} />
        <StatTile label={copy.dashboard.kpis.orders} value={count(data.kpis.orders)} />
        <StatTile label={copy.dashboard.kpis.aov} value={formatEUR(data.kpis.aovCents)} />
        <StatTile label={copy.dashboard.kpis.itemsPerOrder} value={data.kpis.itemsPerOrder.toLocaleString("sl-SI")} />
        <StatTile label={copy.dashboard.kpis.sessions} value={copy.common.none} hint={copy.dashboard.kpis.unavailable} />
        <StatTile label={copy.dashboard.kpis.conversion} value={copy.common.none} hint={copy.dashboard.kpis.unavailable} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <BarChart
          id="revenue"
          title={range.bucket === "week" ? copy.dashboard.charts.revenueWeekly : copy.dashboard.charts.revenue}
          data={data.revenueSeries}
          format={formatEUR}
          emptyLabel={copy.dashboard.charts.empty}
          tableCaption={copy.dashboard.charts.tableCaption}
        />
        <BarChart
          id="orders"
          title={range.bucket === "week" ? copy.dashboard.charts.ordersWeekly : copy.dashboard.charts.orders}
          data={data.ordersSeries}
          format={count}
          emptyLabel={copy.dashboard.charts.empty}
          tableCaption={copy.dashboard.charts.tableCaption}
        />
        <BarChart
          id="by-product"
          title={copy.dashboard.charts.byProduct}
          data={data.revenueByProduct.map((point) => ({ ...point, label: point.label === "__other__" ? copy.dashboard.charts.other : point.label }))}
          format={formatEUR}
          emptyLabel={copy.dashboard.charts.empty}
          tableCaption={copy.dashboard.charts.tableCaption}
        />
        <BarChart
          id="by-status"
          title={copy.dashboard.charts.byStatus}
          data={data.ordersByStatus.map((group) => ({ label: statusLabel(group.status), value: group.count }))}
          format={count}
          emptyLabel={copy.dashboard.charts.empty}
          tableCaption={copy.dashboard.charts.tableCaption}
        />
      </div>

      {/* Two lists to a row only where each gets 28rem (about 1220 px and up); beside the sidebar at 991 they stack (QA round 2: half cards squeezed the tables). The min() keeps one track inside the page at a large root font. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(min(28rem,100%),1fr))]">
        <section className="min-w-0 rounded-card border border-light-2 bg-white p-5" data-list="recent-orders">
          <h2 className="text-base font-medium">{copy.dashboard.lists.recentOrders}</h2>
          {data.recentOrders.length === 0 ? <p className="mt-3 text-sm text-mid-2">{copy.dashboard.lists.empty}</p> : (
            <div className="mt-3 overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs text-mid-2">
                <tr><th className="py-1 pr-3">{copy.dashboard.lists.columns.number}</th><th className="py-1 pr-3">{copy.dashboard.lists.columns.email}</th><th className="py-1 pr-3">{copy.dashboard.lists.columns.status}</th><th className="py-1 text-right">{copy.dashboard.lists.columns.total}</th></tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order) => (
                  <tr key={order.number} className="border-t border-light-2">
                    {/* The number, status and total never break; the e-mail takes the squeeze. */}
                    <td className="whitespace-nowrap py-2 pr-3 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{order.number}</td>
                    <td className="break-all py-2 pr-3 text-mid-1">{order.email}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{statusLabel(order.status)}</td>
                    <td className="whitespace-nowrap py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(order.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

        <section className="min-w-0 rounded-card border border-light-2 bg-white p-5" data-list="low-stock">
          <h2 className="text-base font-medium">{copy.dashboard.lists.lowStock}</h2>
          <p className="mt-1 text-xs text-mid-2">{copy.dashboard.lists.lowStockHint.replace("{threshold}", String(data.lowStock.threshold))}</p>
          {data.lowStock.variants.length === 0 ? <p className="mt-3 text-sm text-mid-2">{copy.dashboard.lists.empty}</p> : (
            <div className="mt-3 overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs text-mid-2">
                <tr><th className="py-1 pr-3">{copy.dashboard.lists.columns.sku}</th><th className="py-1 pr-3">{copy.dashboard.lists.columns.product}</th><th className="py-1 text-right">{copy.dashboard.lists.columns.stock}</th></tr>
              </thead>
              <tbody>
                {data.lowStock.variants.map((variant) => (
                  <tr key={variant.sku} className="border-t border-light-2" data-low-stock-sku={variant.sku}>
                    <td className="whitespace-nowrap py-2 pr-3 font-medium">{variant.sku}</td>
                    <td className="py-2 pr-3 text-mid-1">{variant.productTitle}{variant.title && variant.title !== variant.productTitle ? ` · ${variant.title}` : ""}</td>
                    <td className="py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {variant.stock}
                      {/* Sold out reads as a word, not only as a low number (QA T6-14). */}
                      {variant.stock <= 0 && !variant.allowBackorder ? <span className="ml-2 whitespace-nowrap rounded-btn bg-error px-2 py-0.5 text-xs font-medium text-white">{copy.catalog.products.stockOut}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

        <section className="min-w-0 rounded-card border border-light-2 bg-white p-5" data-list="pending-reviews">
          <h2 className="text-base font-medium">{copy.dashboard.lists.pendingReviews} ({data.pendingReviews.count})</h2>
          {data.pendingReviews.items.length === 0 ? <p className="mt-3 text-sm text-mid-2">{copy.dashboard.lists.empty}</p> : (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {data.pendingReviews.items.map((review) => (
                <li key={review.id} className="flex justify-between gap-3 border-t border-light-2 pt-2">
                  <span>{review.productTitle}</span>
                  <span className="shrink-0 whitespace-nowrap text-mid-1">{copy.dashboard.lists.columns.rating} {review.rating}/5 · {review.createdAt.toLocaleDateString("sl-SI")}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm"><Link href="/admin/ocene" className="underline underline-offset-4">{copy.dashboard.lists.viewAll}</Link></p>
        </section>

        <section className="min-w-0 rounded-card border border-light-2 bg-white p-5" data-list="expiring-coupons">
          <h2 className="text-base font-medium">{copy.dashboard.lists.expiringCoupons}</h2>
          {data.expiringCoupons.length === 0 ? <p className="mt-3 text-sm text-mid-2">{copy.dashboard.lists.empty}</p> : (
            <div className="mt-3 overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs text-mid-2">
                <tr><th className="py-1 pr-3">{copy.dashboard.lists.columns.code}</th><th className="py-1 pr-3">{copy.dashboard.lists.columns.endsAt}</th><th className="py-1 text-right">{copy.dashboard.lists.columns.used}</th></tr>
              </thead>
              <tbody>
                {data.expiringCoupons.map((coupon) => (
                  <tr key={coupon.code} className="border-t border-light-2">
                    <td className="whitespace-nowrap py-2 pr-3 font-medium">{coupon.code}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-mid-1" style={{ fontVariantNumeric: "tabular-nums" }}>{coupon.endsAt.toLocaleDateString("sl-SI")}</td>
                    <td className="py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{coupon.usedCount}{coupon.usageLimitTotal !== null ? ` / ${coupon.usageLimitTotal}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      </div>
    </section>
  );
}
