import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { getBundleBuilder } from "@/lib/settings";
import { builderCouponProblem } from "@/lib/admin/cms";
import { admin as copy } from "@/lib/copy";
import { BundleBuilderForm } from "@/components/admin/CmsForms";

export const metadata: Metadata = { title: copy.content.bundle.title, robots: { index: false, follow: false } };

/** /admin/vsebina/paket — the bundle builder setting the storefront reads at /sestavi-paket (§8.17). */
export default async function AdminBundleBuilderPage() {
  await requirePagePermission("content:manage");
  const bundle = await getBundleBuilder();
  const couponProblem = await builderCouponProblem(bundle.couponCode);
  return (
    <section className="mx-auto max-w-3xl" data-admin-bundle>
      <Link href="/admin/vsebina" className="text-sm text-mid-1 underline underline-offset-4">{copy.common.back}</Link>
      <h1 className="mt-3 text-[2rem]">{copy.content.bundle.title}</h1>
      {couponProblem ? (
        <p role="status" className="mt-6 rounded-card border border-warning bg-white p-4 text-sm text-dark-1" data-bundle-coupon-warning={couponProblem}>
          {copy.content.bundle.couponProblem.replace("{code}", bundle.couponCode).replace("{reason}", copy.content.bundle.couponProblemReasons[couponProblem])}{" "}
          <Link href="/admin/kuponi" className="underline underline-offset-4">{copy.content.bundle.couponProblemLink}</Link>
        </p>
      ) : null}
      <div className="mt-6"><BundleBuilderForm initial={bundle} /></div>
    </section>
  );
}
