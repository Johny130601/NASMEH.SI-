import { isStaffRole } from "@/lib/admin/permissions";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signInPath } from "@/lib/auth-callback";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatEUR } from "@/lib/pricing";
import { buildMetadata } from "@/lib/seo";
import { trackingUrl } from "@/lib/tracking";
import { account as copy, checkout } from "@/lib/copy";
import { OrderStatusPill } from "@/components/storefront/account/OrderStatusPill";
import { uiButtonClasses } from "@/components/storefront/ui/UiButton";
import { hasIssuedInvoice, snapshotAddressLines } from "@/lib/account/order-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.orders.detailLink,
  path: "/racun/narocilo",
  noindex: true,
});

/** Order detail (§11.2): lines, totals+VAT, addresses, payment, invoice DL, tracking. */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const session = await auth();
  if (!session?.user) redirect(signInPath(`/racun/narocilo/${number}`));

  const order = await db.order.findUnique({
    where: { number },
    include: {
      items: { include: { review: true } },
      // Only notes an operator marked for the customer (§14.7).
      notes: { where: { visibleToCustomer: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) notFound();
  const isOwner = order.userId === session.user.id;
  const isAdmin = isStaffRole(session.user.role);
  if (!isOwner && !isAdmin) notFound();

  const shipping = snapshotAddressLines(order.shippingAddress);
  const billing = snapshotAddressLines(order.billingAddress ?? order.shippingAddress);
  const tracking = await trackingUrl(order.carrier, order.trackingNumber);
  const payment = copy.detail.paymentMethods[order.paymentProvider as keyof typeof copy.detail.paymentMethods] ?? "—";
  const reviewByItem = new Map(
    order.items.filter((item) => item.review).map((item) => [item.id, true]),
  );

  return (
    <div className="mx-auto max-w-(--container-narrow) px-(--padding) py-12">
      <Link href="/racun" className="text-sm text-mid-1 underline underline-offset-2">
        {copy.detail.back}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[2rem]">{order.number}</h1>
        <OrderStatusPill status={order.status} />
      </div>
      <p className="mt-1 text-sm text-mid-2">
        {order.createdAt.toLocaleDateString("sl-SI", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>

      {isOwner && order.status === "PENDING" ? (
        /* An unpaid order offers the way to finish paying (QA M10). */
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-light-2 bg-light-4 p-4" data-order-unpaid>
          <p className="text-sm text-mid-1">{copy.orders.unpaidNotice}</p>
          <Link href={`/potrditev/${order.number}`} className={uiButtonClasses("primary")} data-order-pay>
            {copy.orders.payNow}
          </Link>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-lg">{copy.detail.lines}</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-mid-1">
                  {item.quantity} × {item.title}
                  {isOwner && order.status === "DELIVERED" && item.variantId && !order.refundRequired ? (
                    reviewByItem.has(item.id) ? (
                      <span className="ml-2 text-xs text-success">
                        {copy.orders.reviewed}
                      </span>
                    ) : (
                      <Link
                        href={`/oceni/${item.id}`}
                        className="ml-2 text-xs text-brand underline underline-offset-2"
                        data-review-cta={item.sku}
                      >
                        {copy.orders.reviewCta}
                      </Link>
                    )
                  ) : null}
                </span>
                <span className="shrink-0 text-dark-1">
                  {formatEUR(item.unitPriceCents * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-lg">{copy.detail.totals}</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-mid-1">{copy.detail.subtotal}</dt>
              <dd className="text-dark-1" data-order-subtotal>{formatEUR(order.subtotalCents)}</dd>
            </div>
            {order.discountCents > 0 ? (
              <div className="flex justify-between text-success">
                <dt>
                  {copy.detail.discount}
                  {order.couponCode ? ` (${order.couponCode})` : ""}
                </dt>
                <dd data-order-discount>−{formatEUR(order.discountCents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-mid-1">{copy.detail.shipping}</dt>
              <dd className="text-dark-1" data-order-shipping>{order.shippingCents === 0 ? checkout.shipping.free : formatEUR(order.shippingCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-light-3 pt-2 text-base font-medium">
              <dt className="text-dark-1">{copy.detail.total}</dt>
              <dd className="text-dark-1" data-order-total>{formatEUR(order.totalCents)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-mid-2" data-order-vat>
            {copy.detail.vat} ({order.vatRatePercent} %): {formatEUR(order.vatCents)}
          </p>
          <p className="mt-3 text-xs text-mid-2">
            {copy.detail.payment}: {payment}
          </p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-card border border-light-2 bg-white p-5" data-order-addresses>
          <h2 className="text-lg">{copy.detail.shippingAddress}</h2>
          <address className="mt-3 text-sm not-italic leading-6 text-mid-1">{shipping.map((line, index) => <div key={index}>{line}</div>)}</address>
          <h2 className="mt-5 text-lg">{copy.detail.billingAddress}</h2>
          <address className="mt-3 text-sm not-italic leading-6 text-mid-1">{billing.map((line, index) => <div key={index}>{line}</div>)}</address>
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-lg">{copy.detail.tracking}</h2>
          {tracking ? (
            <a
              href={tracking}
              target="_blank"
              rel="noopener noreferrer"
              data-tracking-link
              className="mt-3 inline-block text-sm text-brand underline underline-offset-2"
            >
              {order.carrier} · {order.trackingNumber}
            </a>
          ) : (
            <p className="mt-3 text-sm text-mid-2">—</p>
          )}
          {hasIssuedInvoice(order) ? <div className="mt-4">
            <a
              href={`/racun/narocilo/${order.number}/racun.pdf`}
              download
              data-invoice-download
              className="inline-flex h-[3.25rem] items-center justify-center rounded-btn border border-light-1 bg-white px-8 text-base font-medium text-dark-1 transition-colors hover:border-mid-3"
            >
              {copy.detail.invoice}
            </a>
          </div> : null}
        </section>
      </div>

      {order.notes.length > 0 ? (
        <section className="mt-6 rounded-card border border-light-2 bg-white p-5" data-order-notes>
          <h2 className="text-lg">{copy.detail.notes}</h2>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {order.notes.map((note) => (
              <li key={note.id} className="border-t border-light-3 pt-3 first:border-t-0 first:pt-0">
                <p className="text-xs text-mid-2">{note.createdAt.toLocaleDateString("sl-SI")}</p>
                <p className="mt-1 whitespace-pre-line text-mid-1">{note.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
