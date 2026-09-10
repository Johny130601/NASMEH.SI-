import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { countRefundRequired, listOrders, ORDER_STATUSES, parseOrderFilters, type OrderFilters } from "@/lib/admin/orders";
import { formatEUR } from "@/lib/pricing";
import { admin as copy } from "@/lib/copy";
import { OrderStatusPill } from "@/components/storefront/account/OrderStatusPill";

export const metadata: Metadata = { title: copy.orders.title, robots: { index: false, follow: false } };

function isoDate(date: Date | null): string {
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
}

function queryString(filters: OrderFilters, page?: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("od", isoDate(filters.from));
  if (filters.to) params.set("do", isoDate(filters.to));
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.country) params.set("country", filters.country);
  if (page && page > 1) params.set("stran", String(page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

const inputClass = "rounded-input border border-light-1 bg-white px-3 py-2 text-sm text-dark-1";

/** /admin/narocila — searchable, filterable order list with CSV export (§14.7). */
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("orders:view");
  const filters = parseOrderFilters(await searchParams);
  const [result, refundQueue] = await Promise.all([listOrders(filters), countRefundRequired()]);
  const c = copy.orders.columns;

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-orders>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[2rem]">{copy.orders.title}</h1>
        <a href={`/admin/narocila/export.csv${queryString(filters)}`} className="rounded-btn border border-light-1 bg-white px-4 py-2 text-sm" data-orders-export>{copy.orders.export}</a>
      </div>
      {refundQueue > 0 ? (
        <p role="status" className="mt-3 rounded-card border border-warning bg-white p-3 text-sm" data-refund-queue>{copy.orders.refundQueue.replace("{count}", String(refundQueue))}</p>
      ) : null}

      <form method="get" className="mt-4 grid gap-3 rounded-card border border-light-2 bg-white p-4 md:grid-cols-6" aria-label={copy.common.apply}>
        <label className="flex flex-col gap-1 text-xs text-mid-1 md:col-span-2">
          {copy.orders.searchLabel}
          <input type="search" name="q" defaultValue={filters.q} maxLength={120} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.orders.filters.status}
          <select name="status" defaultValue={filters.status ?? ""} className={inputClass}>
            <option value="">{copy.common.all}</option>
            {ORDER_STATUSES.map((status) => <option key={status} value={status}>{copy.dashboard.statuses[status]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.orders.filters.from}
          <input type="date" name="od" defaultValue={isoDate(filters.from)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.orders.filters.to}
          <input type="date" name="do" defaultValue={isoDate(filters.to)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.orders.filters.provider}
          <select name="provider" defaultValue={filters.provider ?? ""} className={inputClass}>
            <option value="">{copy.common.all}</option>
            <option value="stripe">{copy.orders.providers.stripe}</option>
            <option value="paypal">{copy.orders.providers.paypal}</option>
            <option value="test">{copy.orders.providers.test}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.orders.filters.country}
          <input type="text" name="country" defaultValue={filters.country ?? ""} maxLength={2} className={inputClass} />
        </label>
        <div className="flex items-end gap-2 md:col-span-5">
          <button type="submit" className="rounded-btn bg-dark-1 px-4 py-2 text-sm text-white">{copy.common.apply}</button>
          <Link href="/admin/narocila" className="rounded-btn border border-light-1 px-4 py-2 text-sm">{copy.common.reset}</Link>
          <span className="ml-auto text-xs text-mid-2">{copy.orders.total.replace("{total}", String(result.total))}</span>
        </div>
      </form>

      <div className="mt-4 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr>
              <th className="px-4 py-3">{c.number}</th><th className="px-4 py-3">{c.date}</th><th className="px-4 py-3">{c.customer}</th>
              <th className="px-4 py-3">{c.status}</th><th className="px-4 py-3 text-right">{c.items}</th><th className="px-4 py-3 text-right">{c.total}</th>
              <th className="px-4 py-3 text-right">{c.refunded}</th><th className="px-4 py-3">{c.provider}</th><th className="px-4 py-3">{c.country}</th><th className="px-4 py-3">{c.tracking}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-4 text-mid-2">{copy.orders.empty}</td></tr>
            ) : result.rows.map((row) => (
              <tr key={row.id} className="border-t border-light-2" data-order-row={row.number}>
                <td className="px-4 py-3 font-medium"><Link href={`/admin/narocila/${row.number}`} className="underline underline-offset-4">{row.number}</Link>{row.refundRequired ? <span className="ml-2 rounded-btn bg-warning/20 px-2 py-0.5 text-xs">!</span> : null}</td>
                <td className="px-4 py-3 text-mid-1" style={{ fontVariantNumeric: "tabular-nums" }}>{row.createdAt.toLocaleDateString("sl-SI")}</td>
                <td className="px-4 py-3">{row.customerName || copy.common.none}<br /><span className="text-xs text-mid-1">{row.email}</span></td>
                <td className="px-4 py-3"><OrderStatusPill status={row.status} /></td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{row.itemCount}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(row.totalCents)}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{row.refundedCents ? formatEUR(row.refundedCents) : copy.common.none}</td>
                <td className="px-4 py-3">{copy.orders.providers[row.paymentProvider as keyof typeof copy.orders.providers] ?? row.paymentProvider ?? copy.common.none}</td>
                <td className="px-4 py-3">{row.country || copy.common.none}</td>
                <td className="px-4 py-3 text-mid-1">{row.trackingNumber ?? copy.common.none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.pages > 1 ? (
        <nav className="mt-4 flex items-center gap-3 text-sm" aria-label={copy.common.page.replace("{page}", String(result.page)).replace("{pages}", String(result.pages))}>
          {result.page > 1 ? <Link href={`/admin/narocila${queryString(filters, result.page - 1)}`} className="underline underline-offset-4">{copy.common.prev}</Link> : null}
          <span className="text-mid-2">{copy.common.page.replace("{page}", String(result.page)).replace("{pages}", String(result.pages))}</span>
          {result.page < result.pages ? <Link href={`/admin/narocila${queryString(filters, result.page + 1)}`} className="underline underline-offset-4">{copy.common.next}</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
