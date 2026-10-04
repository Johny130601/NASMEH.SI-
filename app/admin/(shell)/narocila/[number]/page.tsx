import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { can } from "@/lib/admin/permissions";
import { loadOrderDetail } from "@/lib/admin/orders";
import { refundRequiredReason, timelineDetail, timelineEventLabel } from "@/lib/admin/order-display";
import { orderMailStates, type OrderMailState } from "@/lib/admin/order-mail-state";
import { snapshotAddressLines, hasIssuedInvoice } from "@/lib/account/order-view";
import { formatEUR } from "@/lib/pricing";
import { configuredCarriers, getShippingMethods, trackingUrl } from "@/lib/tracking";
import { admin as copy } from "@/lib/copy";
import { contact } from "@/lib/copy/contact";
import { AdminOrderStatusPill } from "@/components/admin/OrderStatusPill";
import { OrderActions } from "@/components/admin/OrderActions";
import { listUnlinkedTicketsClaimingOrder } from "@/lib/support/tickets";
import type { ReasonCode, TopicCode } from "@/lib/support/topics";

export const metadata: Metadata = { title: copy.orders.title, robots: { index: false, follow: false } };

function formatDateTime(date: Date): string {
  return date.toLocaleString("sl-SI", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** One queued mail's delivery state in words; the date never breaks inside (QA 2026-10-03 T4-03). */
function MailState({ kind, mail }: { kind: "confirmation" | "shipped"; mail: OrderMailState }) {
  const m = copy.orders.detail.mails;
  if (mail.state === "sent") {
    const [before, after = ""] = m.sent.split("{date}");
    return <>{before}<span className="whitespace-nowrap">{formatDateTime(mail.at)}</span>{after}</>;
  }
  if (mail.state === "queued") {
    return <>{m.queued}{mail.lastError ? <span className="text-error"> · {m.lastError.replace("{error}", mail.lastError)}</span> : null}</>;
  }
  return <>{mail.state === "notDue" ? m.notDue[kind] : m.notQueued}</>;
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
  const refundReason = order.refundRequired ? refundRequiredReason(order.fulfillmentIssue, order.items) : null;
  const canRefund = can(staff.role, "orders:refund");
  const mails = orderMailStates(order);
  // Only an account holder reads a customer-visible note (/racun/narocilo); erasure leaves no reader (QA 2026-10-03 T4-04).
  const notesAudience = order.anonymizedAt ? "anonymised" : order.userId ? "account" : "guest";
  // A withdrawal claiming this number is the consumer's notice; any other unlinked report (e.g. an adverse event) is listed apart (QA T4-F5).
  const unlinkedGroups = [
    { key: "withdrawals", title: d.unlinkedTickets, hint: d.unlinkedTicketsHint, tickets: unlinkedTickets.filter((ticket) => ticket.kind === "withdrawal") },
    { key: "other", title: d.unlinkedOtherTickets, hint: d.unlinkedOtherTicketsHint, tickets: unlinkedTickets.filter((ticket) => ticket.kind !== "withdrawal") },
  ].filter((group) => group.tickets.length > 0);

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-order={order.number}>
      <Link href="/admin/narocila" className="text-sm text-mid-1 underline underline-offset-4">{d.back}</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="whitespace-nowrap text-[2rem]">{order.number}</h1>
        <AdminOrderStatusPill status={order.status} />
        <span className="whitespace-nowrap text-sm text-mid-2">{formatDateTime(order.createdAt)}</span>
      </div>
      {order.refundRequired ? (
        <div role="alert" className="mt-3 rounded-card border border-warning bg-white p-4 text-sm" data-refund-required>
          <p className="font-medium">{d.refundRequired}</p>
          {refundReason ? <p className="mt-1" data-refund-required-reason>{refundReason}</p> : null}
          {/* The settle button is rendered only for a role that may refund (OrderActions); the others are told who can. */}
          <p className="mt-1 text-mid-1" data-refund-required-hint>{canRefund ? d.refundRequiredHint : d.refundRequiredHintNoPermission}</p>
        </div>
      ) : null}
      {order.anonymizedAt ? <p className="mt-3 text-sm text-mid-2">{d.anonymised}</p> : null}

      {/* Three cards to a row only where each gets 18rem (1280 and up); beside the sidebar at 991 that is two. The min() keeps one track inside the page at a large root font. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))]">
        <section className="rounded-card border border-light-2 bg-white p-5" data-order-customer>
          <h2 className="text-base font-medium">{d.customer}</h2>
          {order.anonymizedAt ? (
            // Erasure leaves a placeholder address and a country-only address: neither is a person to show (QA 2026-10-03 T4-07).
            <p className="mt-2 text-sm text-mid-1" data-order-customer-anonymised>{copy.common.anonymised}</p>
          ) : (
            <>
              <p className="mt-2 text-sm">{shipping[0] ?? copy.common.none}</p>
              <p className="break-words text-sm text-mid-1">{order.email}</p>
              {order.phone ? <p className="text-sm text-mid-1">{d.phone}: {order.phone}</p> : null}
            </>
          )}
          <p className="mt-2 text-sm">
            {order.user ? (
              <Link href={`/admin/stranke/${order.user.id}`} className="underline underline-offset-4">{d.accountLink}</Link>
            ) : order.anonymizedAt ? (
              // The erased guest has no person page left, only this order.
              <span className="text-mid-1" data-order-guest-anonymised>{d.guest}</span>
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
          {order.shippedAt ? <p className="text-xs text-mid-2">{copy.orders.timeline.shipped}: <span className="whitespace-nowrap">{formatDateTime(order.shippedAt)}</span></p> : null}
          {order.deliveredAt ? <p className="text-xs text-mid-2">{copy.orders.timeline.delivered}: <span className="whitespace-nowrap">{formatDateTime(order.deliveredAt)}</span></p> : null}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.lines}</h2>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {order.items.map((item) => {
              const components = (item.properties as { bundleComponents?: Array<{ title?: string; quantity?: number }> } | null)?.bundleComponents;
              return (
                <li key={item.id} className="border-t border-light-3 pt-3 first:border-t-0 first:pt-0" data-order-line={item.sku}>
                  <div className="flex justify-between gap-3">
                    <span>{item.quantity} × {item.title} <span className="whitespace-nowrap text-mid-2">({item.sku})</span>{item.giftLabel ? <span className="ml-2 text-xs text-success">{item.giftLabel}</span> : null}{item.discountLabel ? <span className="ml-2 text-xs text-mid-2">{item.discountLabel}</span> : null}</span>
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
                <span className="whitespace-nowrap text-mid-2" style={{ fontVariantNumeric: "tabular-nums" }}>{entry.at ? formatDateTime(new Date(entry.at)) : ""}</span>
                <span>{timelineEventLabel(entry.event ?? "")}{entry.detail ? <span className="text-mid-2"> · {timelineDetail(entry.event ?? "", entry.detail, order.items)}</span> : null}</span>
              </li>
            ))}
          </ol>
          {/* The confirmation and shipment notice go out through durable queues (payment webhook, daily job, re-send): their state lives on the order, not in the log. */}
          <h3 className="mt-5 text-sm font-medium">{d.mails.title}</h3>
          <dl className="mt-2 flex flex-col gap-1 text-sm" data-order-mails>
            {(["confirmation", "shipped"] as const).map((kind) => (
              <div key={kind} className="flex flex-wrap gap-x-2" data-order-mail={kind} data-order-mail-state={mails[kind].state}>
                <dt className="text-mid-1">{d.mails[kind]}:</dt>
                <dd><MailState kind={kind} mail={mails[kind]} /></dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* Notes and tickets are lists and share a row; the seven-column refunds table gets the full row (QA round 2: a half card clipped it). */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-light-2 bg-white p-5" data-order-notes-list>
          <h2 className="text-base font-medium">{d.notes}</h2>
          {order.notes.length === 0 ? <p className="mt-3 text-sm text-mid-2">{copy.orders.notes.empty}</p> : (
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              {order.notes.map((note) => (
                <li key={note.id} className="border-t border-light-3 pt-3 first:border-t-0 first:pt-0" data-order-note={note.visibleToCustomer ? "customer" : "internal"}>
                  <p className="text-xs text-mid-2"><span className="whitespace-nowrap">{formatDateTime(note.createdAt)}</span> · {note.authorName} · {note.visibleToCustomer ? copy.orders.notes.customerVisible : copy.orders.notes.internal}</p>
                  <p className="mt-1 whitespace-pre-line">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5" data-order-tickets>
          <h2 className="text-base font-medium">{d.tickets}</h2>
          {order.supportTickets.length === 0 ? <p className="mt-2 text-sm text-mid-2">{d.noTickets}</p> : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {order.supportTickets.map((ticket) => (
                <li key={ticket.id}><Link href={`/admin/podpora/${ticket.id}`} className="whitespace-nowrap underline underline-offset-4">{ticket.reference}</Link> · {contact.topics[ticket.topic as TopicCode]?.label ?? ticket.topic} · {copy.tickets.statuses[ticket.status]}</li>
              ))}
            </ul>
          )}
          {unlinkedGroups.map((group) => (
            <div key={group.key} className="mt-4 rounded-card border border-warning p-3" data-order-unlinked-tickets={group.key}>
              <h3 className="text-sm font-medium">{group.title}</h3>
              <p className="mt-1 text-xs text-mid-2">{group.hint}</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {group.tickets.map((ticket) => (
                  <li key={ticket.id} data-order-unlinked-ticket={ticket.reference}><Link href={`/admin/podpora/${ticket.id}`} className="whitespace-nowrap underline underline-offset-4">{ticket.reference}</Link> · {ticket.reason && Object.hasOwn(contact.reasons, ticket.reason) ? contact.reasons[ticket.reason as ReasonCode] : contact.topics[ticket.topic as TopicCode]?.label ?? ticket.topic} · <span className="whitespace-nowrap">{formatDateTime(ticket.createdAt)}</span> · {copy.tickets.statuses[ticket.status]} · <span className="text-warning">{d.unlinkedTag}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="min-w-0 rounded-card border border-light-2 bg-white p-5 lg:col-span-2" data-order-refunds>
          <h2 className="text-base font-medium">{d.refunds}</h2>
          {order.refunds.length === 0 ? <p className="mt-3 text-sm text-mid-2">{copy.common.none}</p> : (
            <div className="mt-3 overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs text-mid-2">
                <tr><th className="py-1 pr-3">{copy.orders.refundColumns.date}</th><th className="py-1 pr-3">{copy.orders.refundColumns.amount}</th><th className="py-1 pr-3">{copy.orders.refundColumns.vat}</th><th className="py-1 pr-3">{copy.orders.refundColumns.reason}</th><th className="py-1 pr-3">{copy.orders.refundColumns.status}</th><th className="py-1 pr-3">{copy.orders.refundColumns.restocked}</th><th className="py-1">{copy.orders.refundColumns.actor}</th></tr>
              </thead>
              <tbody>
                {/* Dates, amounts and statuses never break; the reason wraps between words and a long actor e-mail anywhere. */}
                {order.refunds.map((refund) => (
                  <tr key={refund.id} className="border-t border-light-2" data-order-refund={refund.status}>
                    <td className="whitespace-nowrap py-2 pr-3" style={{ fontVariantNumeric: "tabular-nums" }}>{formatDateTime(refund.createdAt)}</td>
                    <td className="whitespace-nowrap py-2 pr-3" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(refund.amountCents)}</td>
                    <td className="whitespace-nowrap py-2 pr-3" style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(refund.vatCents)}</td>
                    <td className="py-2 pr-3">{refund.reason}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{copy.orders.refundStatuses[refund.status]}</td>
                    <td className="py-2 pr-3">{refund.restock ? copy.common.yes : copy.common.no}</td>
                    <td className="break-all py-2 text-mid-1">{refund.actorName}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
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
          permissions={{ fulfil: can(staff.role, "orders:fulfil"), refund: canRefund, notes: can(staff.role, "orders:notes") }}
          notesAudience={notesAudience}
        />
      </div>
    </section>
  );
}
