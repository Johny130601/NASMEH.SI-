import type { Metadata } from "next";
import { lookupOrderAction } from "@/app/(storefront)/actions/checkout";
import { formatEUR } from "@/lib/pricing";
import { buildMetadata } from "@/lib/seo";
import { orders } from "@/lib/copy";
import { LookupForm } from "@/components/storefront/checkout/LookupForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: orders.lookup.title,
  path: "/sledi",
  noindex: true,
});

/** Guest order lookup (§11.3) — backend for the Phase 6 tracking page. */
export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; narocilo?: string }>;
}) {
  const { email = "", narocilo = "" } = await searchParams;
  const result =
    email && narocilo
      ? await lookupOrderAction({ email, orderNumber: narocilo })
      : null;
  const found = result && result.ok ? result : null;
  const attempted = email !== "" && narocilo !== "";

  return (
    <section className="mx-auto max-w-md px-(--padding) py-16">
      <h1 className="text-[2rem]">{orders.lookup.title}</h1>
      <LookupForm defaultEmail={email} defaultNumber={narocilo} />

      {found ? (
          <div className="mt-8 rounded-card border border-light-2 bg-white p-5" data-lookup-result>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-mid-2">{orders.lookup.statusLabel}</dt>
                <dd className="font-medium text-dark-1" data-lookup-status>
                  {orders.lookup.statuses[
                    found.status as keyof typeof orders.lookup.statuses
                  ] ?? found.status}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mid-2">{orders.lookup.methodLabel}</dt>
                <dd className="text-dark-1">{found.shippingMethod ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mid-2">{orders.lookup.trackingLabel}</dt>
                <dd className="text-dark-1">
                  {found.trackingNumber
                    ? `${found.carrier ?? ""} ${found.trackingNumber}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mid-2">{orders.lookup.itemsLabel}</dt>
                <dd className="text-dark-1">{found.itemCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mid-2">{orders.lookup.totalLabel}</dt>
                <dd className="text-dark-1">{formatEUR(found.totalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mid-2">{orders.lookup.dateLabel}</dt>
                <dd className="text-dark-1">
                  {new Date(found.createdAt).toLocaleDateString("sl-SI")}
                </dd>
              </div>
            </dl>
          </div>
        ) : attempted ? (
          <p role="alert" className="mt-8 text-sm text-error">
            {orders.lookup.notFound}
          </p>
        ) : null}
    </section>
  );
}
