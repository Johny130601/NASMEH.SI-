import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { listTickets, parseTicketFilters, TICKET_STATUSES } from "@/lib/admin/tickets";
import { admin as copy } from "@/lib/copy";
import { contact } from "@/lib/copy/contact";
import { TOPIC_CODES, type ReasonCode } from "@/lib/support/topics";

export const metadata: Metadata = { title: copy.tickets.title, robots: { index: false, follow: false } };

const inputClass = "rounded-input border border-light-1 bg-white px-3 py-2 text-sm text-dark-1";

/** /admin/podpora — the support inbox over the Phase 6 tickets. */
export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("tickets:view");
  const filters = parseTicketFilters(await searchParams);
  const result = await listTickets(filters);
  const c = copy.tickets.columns;
  const pageQuery = (page: number) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.topic) params.set("tema", filters.topic);
    if (page > 1) params.set("stran", String(page));
    const text = params.toString();
    return text ? `?${text}` : "";
  };

  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-tickets>
      <h1 className="text-[2rem]">{copy.tickets.title}</h1>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-card border border-light-2 bg-white p-4" aria-label={copy.common.apply}>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.tickets.filters.status}
          <select name="status" defaultValue={filters.status ?? ""} className={inputClass}>
            <option value="">{copy.common.all}</option>
            {TICKET_STATUSES.map((status) => <option key={status} value={status}>{copy.tickets.statuses[status]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-mid-1">
          {copy.tickets.filters.topic}
          <select name="tema" defaultValue={filters.topic ?? ""} className={inputClass}>
            <option value="">{copy.common.all}</option>
            {TOPIC_CODES.map((topic) => <option key={topic} value={topic}>{contact.topics[topic].label}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-btn bg-dark-1 px-4 py-2 text-sm text-white">{copy.common.apply}</button>
        <Link href="/admin/podpora" className="rounded-btn border border-light-1 px-4 py-2 text-sm">{copy.common.reset}</Link>
        <span className="ml-auto text-xs text-mid-2">{copy.tickets.total.replace("{total}", String(result.total))}</span>
      </form>

      <div className="mt-4 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr>
              <th className="px-4 py-3">{c.reference}</th><th className="px-4 py-3">{c.date}</th><th className="px-4 py-3">{c.topic}</th><th className="px-4 py-3">{c.reason}</th>
              <th className="px-4 py-3">{c.name}</th><th className="px-4 py-3">{c.order}</th><th className="px-4 py-3">{c.status}</th><th className="px-4 py-3">{c.assignee}</th>
            </tr>
          </thead>
          <tbody>
            {result.tickets.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-4 text-mid-2">{copy.tickets.empty}</td></tr>
            ) : result.tickets.map((ticket) => (
              <tr key={ticket.id} className="border-t border-light-2" data-ticket-row={ticket.reference}>
                <td className="whitespace-nowrap px-4 py-3 font-medium"><Link href={`/admin/podpora/${ticket.id}`} className="underline underline-offset-4">{ticket.reference}</Link></td>
                <td className="whitespace-nowrap px-4 py-3 text-mid-1" style={{ fontVariantNumeric: "tabular-nums" }}>{ticket.createdAt.toLocaleDateString("sl-SI")}</td>
                <td className="px-4 py-3">{contact.topics[ticket.topic].label}</td>
                <td className="px-4 py-3 text-mid-1">{ticket.reason && Object.hasOwn(contact.reasons, ticket.reason) ? contact.reasons[ticket.reason as ReasonCode] : ticket.reason ?? copy.common.none}</td>
                <td className="px-4 py-3">{ticket.name}<br /><span className="text-xs text-mid-1">{ticket.email}</span></td>
                <td className="whitespace-nowrap px-4 py-3">{ticket.orderNumber ? <Link href={`/admin/narocila/${ticket.orderNumber}`} className="underline underline-offset-4">{ticket.orderNumber}</Link> : copy.common.none}</td>
                <td className="px-4 py-3">{copy.tickets.statuses[ticket.status]}</td>
                <td className="px-4 py-3 text-mid-1">{ticket.assignee?.name ?? ticket.assignee?.email ?? copy.tickets.detail.unassigned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.pages > 1 ? (
        <nav className="mt-4 flex items-center gap-3 text-sm">
          {result.page > 1 ? <Link href={`/admin/podpora${pageQuery(result.page - 1)}`} className="underline underline-offset-4">{copy.common.prev}</Link> : null}
          <span className="text-mid-2">{copy.common.page.replace("{page}", String(result.page)).replace("{pages}", String(result.pages))}</span>
          {result.page < result.pages ? <Link href={`/admin/podpora${pageQuery(result.page + 1)}`} className="underline underline-offset-4">{copy.common.next}</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
