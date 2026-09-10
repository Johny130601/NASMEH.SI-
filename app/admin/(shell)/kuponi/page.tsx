import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { couponValueLabel, listCoupons, parseCouponFilters, STORE_TIME_ZONE } from "@/lib/admin/coupons";
import { formatEUR } from "@/lib/pricing";
import { admin as copy } from "@/lib/copy";
import { CouponCreateForm } from "@/components/admin/CouponEditor";

export const metadata: Metadata = { title: copy.coupons.title, robots: { index: false, follow: false } };

const inputClass = "rounded-input border border-light-1 bg-white px-3 py-2 text-sm text-dark-1";
const dateFormat = new Intl.DateTimeFormat("sl-SI", { dateStyle: "short", timeStyle: "short", timeZone: STORE_TIME_ZONE });

/** /admin/kuponi — coupon list and creation (§14.4). */
export default async function AdminCouponsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("promos:manage");
  const filters = parseCouponFilters(await searchParams);
  const coupons = await listCoupons(filters);
  const c = copy.coupons;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-coupons>
      <h1 className="text-[2rem]">{c.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-mid-1">{c.intro}</p>
      <div className="mt-4"><CouponCreateForm /></div>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-card border border-light-2 bg-white p-4" aria-label={copy.common.apply}>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {c.searchLabel}
          <input type="search" name="q" defaultValue={filters.q} maxLength={40} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {c.activeFilter}
          <select name="stanje" defaultValue={filters.active === null ? "" : filters.active ? "aktivni" : "neaktivni"} className={inputClass}>
            <option value="">{c.activeOptions.all}</option>
            <option value="aktivni">{c.activeOptions.active}</option>
            <option value="neaktivni">{c.activeOptions.inactive}</option>
          </select>
        </label>
        <button type="submit" className="rounded-btn bg-dark-1 px-4 py-2 text-sm text-white">{copy.common.apply}</button>
        <Link href="/admin/kuponi" className="rounded-btn border border-light-1 px-4 py-2 text-sm">{copy.common.reset}</Link>
      </form>
      <div className="mt-4 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr>
              <th className="px-4 py-3">{c.columns.code}</th><th className="px-4 py-3">{c.columns.type}</th><th className="px-4 py-3 text-right">{c.columns.value}</th>
              <th className="px-4 py-3 text-right">{c.columns.usage}</th><th className="px-4 py-3">{c.columns.window}</th><th className="px-4 py-3">{c.columns.active}</th><th className="px-4 py-3 text-right">{c.columns.redemptions}</th>
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-4 text-mid-2">{c.empty}</td></tr>
            ) : coupons.map((coupon) => (
              <tr key={coupon.id} className="border-t border-light-2" data-coupon-row={coupon.code}>
                <td className="px-4 py-3 font-medium"><Link href={`/admin/kuponi/${coupon.id}`} className="underline underline-offset-4">{coupon.code}</Link></td>
                <td className="px-4 py-3">{c.types[coupon.type]}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{couponValueLabel(coupon, formatEUR)}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }} data-coupon-usage>{coupon.usedCount}{coupon.usageLimitTotal ? ` / ${coupon.usageLimitTotal}` : ""}</td>
                <td className="px-4 py-3 text-mid-1">{coupon.startsAt || coupon.endsAt ? `${coupon.startsAt ? dateFormat.format(coupon.startsAt) : "…"} – ${coupon.endsAt ? dateFormat.format(coupon.endsAt) : "…"}` : copy.common.none}</td>
                <td className="px-4 py-3">{coupon.active ? copy.common.yes : copy.common.no}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{coupon._count.couponRedemptions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
