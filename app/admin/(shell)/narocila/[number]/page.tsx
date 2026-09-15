import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { can } from "@/lib/admin/permissions";
import { loadOrderDetail } from "@/lib/admin/orders";
import { snapshotAddressLines, hasIssuedInvoice } from "@/lib/account/order-view";
import { formatEUR } from "@/lib/pricing";
import { configuredCarriers, getShippingMethods, trackingUrl } from "@/lib/tracking";
import { admin as copy } from "@/lib/copy";
import { contact } from "@/lib/copy/contact";
import { OrderStatusPill } from "@/components/storefront/account/OrderStatusPill";
import { OrderActions } from "@/components/admin/OrderActions";
import { listUnlinkedTicketsClaimingOrder } from "@/lib/support/tickets";
import type { ReasonCode, TopicCode } from "@/lib/support/topics";

export const metadata: Metadata = { title: copy.orders.title, robots: { index: false, follow: false } };

function timelineLabel(event: string): string {
  const [name, ...rest] = event.split(":");
  const label = copy.orders.timeline[name as keyof typeof copy.orders.timeline] ?? name;
  return rest.length ? `${label} (${rest.join(":")})` : label;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("sl-SI", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** /admin/narocila/[number] — order detail with the operator actions (§14.7). */
export default async function AdminOrderDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const staff = await requirePagePermission("orders:view");
  const { number } = await params;
  const order = await loadOrderDetail(number);
  if (!order) notFound();
  const [methods, tracking, unlinkedTickets] = await Promise.all([
    getShippingMethods(), trackingUrl(order.carrier, order.trackingNumber), listUnlinkedTicketsClaimingOrder(order.number),
  ]);
  const carriers = configuredCarriers(methods);
  const shipping = snapshotAddressLines(order.shippingAddress);
  const billing = snapshotAddressLines(order.billingAddress ?? order.shippingAddress);
  const timeline = Array.isArray(order.timeline) ? order.timeline as Array<{ at?: string; event?: string; detail?: string }> : [];
  const remainingCents = order.totalCents - order.refundedCents;
  const providerRef = order.paymentProvider === "paypal" ? order.paypalOrderId : order.stripePaymentIntentId;
  const d = copy.orders.detail;

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-order={order.number}>
      <Link href="/admin/narocila" className="text-sm text-mid-1 underline underline-offset-4">{d.back}</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-[2rem]">{order.number}</h1>
        <OrderStatusPill status={order.status} />
        <span className="text-sm text-mid-2">{formatDateTime(order.createdAt)}</span>
      </div>
      {order.refundRequired ? <p role="alert" className="mt-3 rounded-card border border-warning bg-white p-4 text-sm" data-refund-required>{d.refundRequired}</p> : null}
      {order.anonymizedAt ? <p className="mt-3 text-sm text-mid-2">{d.anonymised}</p> : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.customer}</h2>
          <p className="mt-2 text-sm">{shipping[0] ?? copy.common.none}</p>
          <p className="text-sm text-mid-1">{order.email}</p>
          {order.phone ? <p className="text-sm text-mid-1">{d.phone}: {order.phone}</p> : null}
          <p className="mt-2 text-sm">
            {order.user ? (
              <Link href={`/admin/stranke/${order.user.id}`} className="underline underline-offset-4">{d.accountLink}</Link>
            ) : (
              <Link href={`/admin/stranke/gost?email=${encodeURIComponent(order.email)}`} className="underline underline-offset-4">{d.guest}</Link>
            )}
          </p>
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.payment}</h2>
          <p className="mt-2 text-sm">{copy.orders.providers[order.paymentProvider as keyof typeof copy.orders.providers] ?? order.paymentProvider ?? copy.common.none}</p>
          <p className="break-all text-xs text-mid-2">{d.providerRef}: {providerRef ?? copy.common.none}</p>
          {order.couponCode ? <p className="mt-2 text-sm">{d.coupon}: {order.couponCode}</p> : null}
          <p className="mt-2 text-sm">{d.shippingMethod}: {order.shippingMethod ?? copy.common.none}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {hasIssuedInvoice(order) ? <a href={`/racun/narocilo/${order.number}/racun.pdf`} className="underline underline-offset-4" data-invoice-link>{d.invoice}</a> : null}
            <a href={`/admin/narocila/${order.number}/dobavnica.pdf`} className="underline underline-offset-4" data-packing-slip-link>{d.packingSlip}</a>
          </div>
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.tracking}</h2>
          {order.trackingNumber ? (
            <p className="mt-2 text-sm">
              {order.carrier} · {tracking ? <a href={tracking} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" data-tracking-link>{order.trackingNumber}</a> : order.trackingNumber}
            </p>
          ) : <p className="mt-2 text-sm text-mid-2">{d.noTracking}</p>}
          {order.shippedAt ? <p className="text-xs text-mid-2">{copy.orders.timeline.shipped}: {formatDateTime(order.shippedAt)}</p> : null}
          {order.deliveredAt ? <p className="text-xs text-mid-2">{copy.orders.timeline.delivered}: {formatDateTime(order.deliveredAt)}</p> : null}
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.lines}</h2>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {order.items.map((item) => {
              const components = (item.properties as { bundleComponents?: Array<{ title?: string; quantity?: number }> } | null)?.bundleComponents;
              return (
                <li key={item.id} className="border-t border-light-3 pt-3 first:border-t-0 first:pt-0" data-order-line={item.sku}>
                  <div className="flex justify-between gap-3">
                    <span>{item.quantity} × {item.title} <span className="text-mid-2">({item.sku})</span>{item.giftLabel ? <span className="ml-2 text-xs text-success">{item.giftLabel}</span> : null}{item.discountLabel ? <span className="ml-2 text-xs text-mid-2">{item.discountLabel}</span> : null}</span>
                    <span className="shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(item.unitPriceCents * item.quantity)}</span>
                  </div>
                  {Array.isArray(components) && components.length ? (
                    <ul className="mt-1 pl-4 text-xs text-mid-1">
                      {components.map((component, index) => <li key={index}>{d.bundleComponents}: {(component.quantity ?? 1) * item.quantity} × {component.title}</li>)}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.totals}</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <div className="flex justify-between"><dt className="text-mid-1">{d.subtotal}</dt><dd>{formatEUR(order.subtotalCents)}</dd></div>
            {order.discountCents > 0 ? <div className="flex justify-between text-success"><dt>{d.discount}</dt><dd>−{formatEUR(order.discountCents)}</dd></div> : null}
            <div className="flex justify-between"><dt className="text-mid-1">{d.shipping}</dt><dd>{formatEUR(order.shippingCents)}</dd></div>
            <div className="flex justify-between border-t border-light-3 pt-2 font-medium"><dt>{d.total}</dt><dd data-order-total>{formatEUR(order.totalCents)}</dd></div>
            <div className="flex justify-between text-xs text-mid-2"><dt>{d.vat} ({order.vatRatePercent} %)</dt><dd>{formatEUR(order.vatCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-mid-1">{d.refunded}</dt><dd data-order-refunded>{formatEUR(order.refundedCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-mid-1">{d.remaining}</dt><dd>{formatEUR(remainingCents)}</dd></div>
          </dl>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.addresses}</h2>
          <h3 className="mt-3 text-sm text-mid-1">{d.shippingAddress}</h3>
          <address className="text-sm not-italic leading-6">{shipping.map((line, index) => <div key={index}>{line}</div>)}</address>
          <h3 className="mt-3 text-sm text-mid-1">{d.billingAddress}</h3>
          <address className="text-sm not-italic leading-6">{billing.map((line, index) => <div key={index}>{line}</div>)}</address>
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.timeline}</h2>
          <ol className="mt-3 flex flex-col gap-2 text-sm" data-order-timeline>
            {timeline.map((entry, index) => (
              <li key={index} className="flex flex-wrap gap-x-3">
                <span className="text-mid-2" style={{ fontVariantNumeric: "tabular-nums" }}>{entry.at ? formatDateTime(new Date(entry.at)) : ""}</span>
                <span>{timelineLabel(entry.event ?? "")}{entry.detail ? <span className="text-mid-2"> · {entry.detail}</span> : null}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-card border border-light-2 bg-white p-5" data-order-notes-list>
          <h2 className="text-base font-medium">{d.notes}</h2>
          {order.notes.length === 0 ? <p className="mt-3 text-sm text-mid-2">{copy.orders.notes.empty}</p> : (
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              {order.notes.map((note) => (
                <li key={note.id} className="border-t border-light-3 pt-3 first:border-t-0 first:pt-0" data-order-note={note.visibleToCustomer ? "customer" : "internal"}>
                  <p className="text-xs text-mid-2">{formatDateTime(note.createdAt)} · {note.authorName} · {note.visibleToCustomer ? copy.orders.notes.customerVisible : copy.orders.notes.internal}</p>
                  <p className="mt-1 whitespace-pre-line">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5" data-order-refunds>
          <h2 className="text-base font-medium">{d.refunds}</h2>
          {order.refunds.length === 0 ? <p className="mt-3 text-sm text-mid-2">{copy.common.none}</p> : (
            <div className="mt-3 overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs text-mid-2">
                <tr><th className="py-1 pr-3">{copy.orders.refundColumns.date}</th><th className="py-1 pr-3">{copy.orders.refundColumns.amount}</th><th className="py-1 pr-3">{copy.orders.refundColumns.vat}</th><th className="py-1 pr-3">{copy.orders.refundColumns.reason}</th><th className="py-1 pr-3">{copy.orders.refundColumns.status}</th><th className="py-1 pr-3">{copy.orders.refundColumns.restocked}</th><th className="py-1">{copy.orders.refundColumns.actor}</th></tr>
              </thead>
              <tbody>
                {order.refunds.map((refund) => (
                  <tr key={refund.id} className="border-t border-light-2" data-order-refund={refund.status}>
                    <td className="py-2 pr-3">{formatDateTime(refund.createdAt)}</td>
                    <td className="py-2 pr-3" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(refund.amountCents)}</td>
                    <td className="py-2 pr-3" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(refund.vatCents)}</td>
                    <td className="py-2 pr-3">{refund.reason}</td>
                    <td className="py-2 pr-3">{copy.orders.refundStatuses[refund.status]}</td>
                    <td className="py-2 pr-3">{refund.restock ? copy.common.yes : copy.common.no}</td>
                    <td className="py-2 text-mid-1">{refund.actorName}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <h2 className="mt-5 text-base font-medium">{d.tickets}</h2>
          {order.supportTickets.length === 0 ? <p className="mt-2 text-sm text-mid-2">{d.noTickets}</p> : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {order.supportTickets.map((ticket) => (
                <li key={ticket.id}><Link href={`/admin/podpora/${ticket.id}`} className="underline underline-offset-4">{ticket.reference}</Link> · {contact.topics[ticket.topic as TopicCode]?.label ?? ticket.topic} · {copy.tickets.statuses[ticket.status]}</li>
              ))}
            </ul>
          )}
          {unlinkedTickets.length ? (
            <div className="mt-4 rounded-card border border-warning p-3" data-order-unlinked-tickets>
              <h3 className="text-sm font-medium">{d.unlinkedTickets}</h3>
              <p className="mt-1 text-xs text-mid-2">{d.unlinkedTicketsHint}</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {unlinkedTickets.map((ticket) => (
                  <li key={ticket.id} data-order-unlinked-ticket={ticket.reference}><Link href={`/admin/podpora/${ticket.id}`} className="underline underline-offset-4">{ticket.reference}</Link> · {ticket.reason && Object.hasOwn(contact.reasons, ticket.reason) ? contact.reasons[ticket.reason as ReasonCode] : contact.topics[ticket.topic as TopicCode]?.label ?? ticket.topic} · {formatDateTime(ticket.createdAt)} · {copy.tickets.statuses[ticket.status]} · <span className="text-warning">{d.unlinkedTag}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <div className="mt-4">
        <OrderActions
          orderId={order.id}
          status={order.status}
          refundRequired={order.refundRequired}
          hasTracking={!!order.trackingNumber}
          carriers={carriers}
          lines={order.items.map((item) => ({
            orderItemId: item.id, title: item.title, sku: item.sku, unitPriceCents: item.unitPriceCents,
            remaining: order.refundable.find((entry) => entry.orderItemId === item.id)?.remaining ?? 0,
          }))}
          shippingCents={order.shippingCents}
          shippingRefunded={order.shippingRefunded}
          remainingCents={remainingCents}
          permissions={{ fulfil: can(staff.role, "orders:fulfil"), refund: can(staff.role, "orders:refund"), notes: can(staff.role, "orders:notes") }}
        />
      </div>
    </section>
  );
}
