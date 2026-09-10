import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { couponIsUnused, couponLink, couponToInput, loadCoupon, STORE_TIME_ZONE } from "@/lib/admin/coupons";
import { formatEUR } from "@/lib/pricing";
import { admin as copy } from "@/lib/copy";
import { CopyLinkButton, CouponEditor } from "@/components/admin/CouponEditor";

export const metadata: Metadata = { title: copy.coupons.title, robots: { index: false, follow: false } };

const c = copy.coupons.editor;
const dateFormat = new Intl.DateTimeFormat("sl-SI", { dateStyle: "short", timeStyle: "short", timeZone: STORE_TIME_ZONE });

/** /admin/kuponi/[id] — coupon form, auto-apply link with QR, redemptions (§14.4). */
export default async function AdminCouponPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("promos:manage");
  const { id } = await params;
  const coupon = await loadCoupon(id);
  if (!coupon) notFound();
  const link = couponLink(coupon.code);
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-coupon={coupon.code}>
      <Link href="/admin/kuponi" className="text-sm text-mid-1 underline underline-offset-4">{c.back}</Link>
      <h1 className="mt-3 text-[2rem]">{coupon.code}</h1>
      <p className="text-sm text-mid-1">{copy.coupons.types[coupon.type]} · {c.usedCount.replace("{used}", String(coupon.usedCount))}</p>

      <div className="mt-6 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <CouponEditor couponId={coupon.id} initial={couponToInput(coupon)} deletable={couponIsUnused(coupon)} products={coupon.products} collections={coupon.collections} />
        <div className="flex flex-col gap-4">
          <section className="rounded-card border border-light-2 bg-white p-5">
            <h2 className="text-base font-medium">{c.sections.link}</h2>
            <p className="mt-2 text-xs text-mid-2">{c.linkLabel}</p>
            <p className="mt-1 break-all text-sm" data-coupon-link>{link}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyLinkButton value={link} />
              <a href={`/admin/kuponi/${coupon.id}/qr.svg`} download={`koda-${coupon.code}.svg`} className="rounded-btn border border-light-1 px-3 py-1.5 text-xs">{c.qrDownload}</a>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/admin/kuponi/${coupon.id}/qr.svg`} alt={c.qrAlt.replace("{code}", coupon.code)} width={192} height={192} className="mt-4 h-48 w-48 rounded-card border border-light-2 bg-white" data-coupon-qr />
            <p className="mt-2 text-xs text-mid-2">{c.qrHint}</p>
          </section>
          <section className="rounded-card border border-light-2 bg-white p-5" data-coupon-redemptions>
            <h2 className="text-base font-medium">{c.sections.redemptions} ({coupon._count.couponRedemptions})</h2>
            {coupon.couponRedemptions.length === 0 ? <p className="mt-2 text-sm text-mid-2">{c.redemptionsEmpty}</p> : (
              <table className="mt-3 w-full text-xs">
                <thead className="text-left text-mid-2"><tr><th className="py-1 pr-2">{c.redemptionColumns.order}</th><th className="py-1 pr-2">{c.redemptionColumns.email}</th><th className="py-1 pr-2 text-right">{c.redemptionColumns.total}</th><th className="py-1">{c.redemptionColumns.date}</th></tr></thead>
                <tbody>
                  {coupon.couponRedemptions.map((redemption) => (
                    <tr key={redemption.id} className="border-t border-light-2" data-coupon-redemption={redemption.order.number}>
                      <td className="py-1 pr-2"><Link href={`/admin/narocila/${redemption.order.number}`} className="underline underline-offset-4">{redemption.order.number}</Link></td>
                      <td className="py-1 pr-2 break-all">{redemption.email}</td>
                      <td className="py-1 pr-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(redemption.order.totalCents)}</td>
                      <td className="py-1">{dateFormat.format(redemption.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
