import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { listAssignees, loadTicket, readableDetailValue } from "@/lib/admin/tickets";
import { ticketDetailRows } from "@/lib/email/templates/support-ticket";
import { admin as copy } from "@/lib/copy";
import { contact } from "@/lib/copy/contact";
import type { ReasonCode } from "@/lib/support/topics";
import { TicketActions } from "@/components/admin/TicketActions";

export const metadata: Metadata = { title: copy.tickets.title, robots: { index: false, follow: false } };

const d = copy.tickets.detail;

/** /admin/podpora/[id] — one ticket with its structured details, attachments and handling controls. */
export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("tickets:view");
  const { id } = await params;
  const [ticket, assignees] = await Promise.all([loadTicket(id), listAssignees()]);
  if (!ticket) notFound();
  const details = ticketDetailRows(ticket.details);
  const reason = ticket.reason && Object.hasOwn(contact.reasons, ticket.reason) ? contact.reasons[ticket.reason as ReasonCode] : ticket.reason;

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-ticket={ticket.reference}>
      <Link href="/admin/podpora" className="text-sm text-mid-1 underline underline-offset-4">{d.back}</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="whitespace-nowrap text-[2rem]">{ticket.reference}</h1>
        <span className="rounded-btn bg-light-3 px-2.5 py-1 text-xs font-medium" data-ticket-status>{copy.tickets.statuses[ticket.status]}</span>
        <span className="whitespace-nowrap text-sm text-mid-2">{ticket.createdAt.toLocaleString("sl-SI")}</span>
      </div>
      <p className="mt-1 text-sm text-mid-1">{contact.topics[ticket.topic].label}{reason ? ` · ${reason}` : ""}</p>

      {/* Three cards to a row only where each gets 18rem (1280 and up); beside the sidebar at 991 that is two. The min() keeps one track inside the page at a large root font. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))]">
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.reporter}</h2>
          <p className="mt-2 text-sm">{ticket.name}</p>
          <p className="break-words text-sm text-mid-1">{ticket.email}</p>
          {ticket.user ? <p className="mt-2 text-sm"><Link href={`/admin/stranke/${ticket.user.id}`} className="underline underline-offset-4">{d.customer}</Link></p>
            : !ticket.email.endsWith("@invalid") ? <p className="mt-2 text-sm"><Link href={`/admin/stranke/gost?email=${encodeURIComponent(ticket.email)}`} className="underline underline-offset-4" data-ticket-guest-link>{d.customer}</Link></p> : null}
          {/* the wording fingerprint is a record id, not text for staff: kept on the element, as the consent history does */}
          <p className="mt-2 text-xs text-mid-2" title={ticket.privacyVersion} data-ticket-privacy-version={ticket.privacyVersion}>{d.privacy}: <span className="whitespace-nowrap">{ticket.privacyAcceptedAt.toLocaleDateString("sl-SI")}</span></p>
        </section>
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.order}</h2>
          {ticket.orderNumber ? (
            <p className="mt-2 text-sm"><Link href={`/admin/narocila/${ticket.orderNumber}`} className="whitespace-nowrap underline underline-offset-4">{ticket.orderNumber}</Link>{ticket.order ? ` · ${copy.dashboard.statuses[ticket.order.status]}` : ""}</p>
          ) : <p className="mt-2 text-sm text-mid-2">{copy.common.none}</p>}
          {ticket.orderProof ? <p className="text-xs text-mid-2">{d.proof}: {ticket.orderProof === "ACCOUNT" ? d.proofAccount : d.proofEmailNumber}</p> : null}
        </section>
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.deliveries}</h2>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-mid-1">
            {ticket.deliveries.map((delivery) => (
              <li key={delivery.kind} className="break-words">
                {/* A long recipient may break when it overflows; the timestamp never breaks inside. */}
                {d.deliveryKinds[delivery.kind]} → {delivery.recipient}: {delivery.sentAt
                  ? <>{d.deliverySent} <span className="whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>{delivery.sentAt.toLocaleString("sl-SI")}</span></>
                  : `${d.deliveryPending} (${delivery.attempts})`}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Message and handling share a row only where each gets 28rem (about 1220 px and up); beside the sidebar at 991 they stack, so the details list keeps room for its values. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(min(28rem,100%),1fr))]">
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.message}</h2>
          <p className="mt-3 whitespace-pre-line text-sm" data-ticket-message-body>{ticket.message}</p>
          {details.length ? (
            <>
              <h3 className="mt-5 text-sm font-medium">{d.details}</h3>
              {/* The label column takes at most half the list, so a claimed order number or a date keeps a whole line on a phone as well (QA round 2). */}
              <dl className="mt-2 grid grid-cols-[minmax(8rem,min(14rem,50%))_1fr] gap-y-1 text-sm">
                {details.map(([label, value]) => <div key={label} className="contents"><dt className="text-mid-1">{label}</dt><dd className="whitespace-pre-line">{readableDetailValue(value)}</dd></div>)}
              </dl>
            </>
          ) : null}
          {ticket.attachments.length ? (
            <>
              <h3 className="mt-5 text-sm font-medium">{d.attachments}</h3>
              <ul className="mt-2 flex flex-wrap gap-3">
                {ticket.attachments.map((attachment, index) => (
                  <li key={attachment.id}>
                    <a href={`/api/support/attachments/${attachment.id}`} target="_blank" rel="noopener noreferrer" className="block" data-ticket-attachment>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/support/attachments/${attachment.id}`} alt={d.attachment.replace("{n}", String(index + 1))} className="h-24 w-24 rounded-card object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <TicketActions ticketId={ticket.id} status={ticket.status} assigneeId={ticket.assigneeId} internalNote={ticket.internalNote} assignees={assignees} />
      </div>
    </section>
  );
}
