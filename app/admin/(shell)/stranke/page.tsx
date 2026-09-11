import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { CUSTOMER_SCAN_LIMIT, listCustomers, parseCustomerFilters } from "@/lib/admin/customers";
import { formatEUR } from "@/lib/pricing";
import { admin as copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.customers.title, robots: { index: false, follow: false } };

const inputClass = "rounded-input border border-light-1 bg-white px-3 py-2 text-sm text-dark-1";

function tri(value: boolean | null): string {
  return value === null ? "" : value ? "da" : "ne";
}

/** /admin/stranke — accounts and guest purchasers (§14.8). */
export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("customers:view");
  const filters = parseCustomerFilters(await searchParams);
  const result = await listCustomers(filters);
  const c = copy.customers.columns;
  const pageQuery = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.hasOrders !== null) params.set("narocila", tri(filters.hasOrders));
    if (filters.marketing !== null) params.set("enovice", tri(filters.marketing));
    if (page > 1) params.set("stran", String(page));
    const text = params.toString();
    return text ? `?${text}` : "";
  };

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-customers>
      <h1 className="text-[2rem]">{copy.customers.title}</h1>
      <form method="get" className="mt-4 grid gap-3 rounded-card border border-light-2 bg-white p-4 md:grid-cols-5" aria-label={copy.common.apply}>
        <label className="flex flex-col gap-1 text-xs text-mid-1 md:col-span-2">
          {copy.customers.searchLabel}
          <input type="search" name="q" defaultValue={filters.q} maxLength={120} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.customers.filters.hasOrders}
          <select name="narocila" defaultValue={tri(filters.hasOrders)} className={inputClass}>
            <option value="">{copy.common.all}</option><option value="da">{copy.common.yes}</option><option value="ne">{copy.common.no}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.customers.filters.marketing}
          <select name="enovice" defaultValue={tri(filters.marketing)} className={inputClass}>
            <option value="">{copy.common.all}</option><option value="da">{copy.common.yes}</option><option value="ne">{copy.common.no}</option>
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2 md:col-span-5">
          <button type="submit" className="rounded-btn bg-dark-1 px-4 py-2 text-sm text-white">{copy.common.apply}</button>
          <Link href="/admin/stranke" className="rounded-btn border border-light-1 px-4 py-2 text-sm">{copy.common.reset}</Link>
        </div>
      </form>
      {result.truncated ? <p role="status" className="mt-3 text-sm text-warning" data-list-truncated>{copy.common.truncated.replace("{n}", String(CUSTOMER_SCAN_LIMIT))}</p> : null}
      <p className="mt-2 text-xs text-mid-2">{copy.customers.total.replace("{total}", String(result.total))}</p>

      <div className="mt-3 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr>
              <th className="px-4 py-3">{c.name}</th><th className="px-4 py-3">{c.email}</th><th className="px-4 py-3">{c.type}</th>
              <th className="px-4 py-3 text-right">{c.orders}</th><th className="px-4 py-3 text-right">{c.ltv}</th><th className="px-4 py-3">{c.marketing}</th><th className="px-4 py-3">{c.created}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-4 text-mid-2">{copy.customers.empty}</td></tr>
            ) : result.rows.map((row) => (
              <tr key={row.key} className="border-t border-light-2" data-customer-row={row.email}>
                <td className="px-4 py-3 font-medium"><Link href={row.href} className="underline underline-offset-4">{row.name ?? copy.common.none}</Link></td>
                <td className="px-4 py-3 text-mid-1">{row.email}</td>
                <td className="px-4 py-3">{copy.customers.types[row.type]}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{row.orders}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(row.ltvCents)}</td>
                <td className="px-4 py-3">{row.marketingOptIn === null ? copy.common.none : row.marketingOptIn ? copy.common.yes : copy.common.no}</td>
                <td className="px-4 py-3 text-mid-1">{row.since ? row.since.toLocaleDateString("sl-SI") : copy.common.none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.pages > 1 ? (
        <nav className="mt-4 flex items-center gap-3 text-sm">
          {result.page > 1 ? <Link href={`/admin/stranke${pageQuery(result.page - 1)}`} className="underline underline-offset-4">{copy.common.prev}</Link> : null}
          <span className="text-mid-2">{copy.common.page.replace("{page}", String(result.page)).replace("{pages}", String(result.pages))}</span>
          {result.page < result.pages ? <Link href={`/admin/stranke${pageQuery(result.page + 1)}`} className="underline underline-offset-4">{copy.common.next}</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
