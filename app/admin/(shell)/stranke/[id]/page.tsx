import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { can } from "@/lib/admin/permissions";
import { loadCustomer, loadGuest } from "@/lib/admin/customers";
import { formatEUR } from "@/lib/pricing";
import { admin as copy } from "@/lib/copy";
import { contact } from "@/lib/copy/contact";
import type { TopicCode } from "@/lib/support/topics";
import { OrderStatusPill } from "@/components/storefront/account/OrderStatusPill";
import { CustomerActions } from "@/components/admin/CustomerActions";

export const metadata: Metadata = { title: copy.customers.title, robots: { index: false, follow: false } };

const d = copy.customers.detail;

function OrdersTable({ orders }: { orders: Array<{ id: string; number: string; status: "PENDING" | "PAID" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED"; totalCents: number; refundedCents: number; createdAt: Date }> }) {
  if (orders.length === 0) return <p className="mt-3 text-sm text-mid-2">{d.noOrders}</p>;
  return (
    <ul className="mt-3 flex flex-col gap-2 text-sm">
      {orders.map((order) => (
        <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-light-3 pt-2 first:border-t-0 first:pt-0">
          <span><Link href={`/admin/narocila/${order.number}`} className="underline underline-offset-4">{order.number}</Link> · {order.createdAt.toLocaleDateString("sl-SI")}</span>
          <span className="flex items-center gap-3"><OrderStatusPill status={order.status} /><span style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(order.totalCents)}</span></span>
        </li>
      ))}
    </ul>
  );
}

function TicketsList({ tickets }: { tickets: Array<{ id: string; reference: string; topic: string; status: "OPEN" | "IN_PROGRESS" | "CLOSED"; createdAt: Date }> }) {
  if (tickets.length === 0) return <p className="mt-3 text-sm text-mid-2">{d.noTickets}</p>;
  return (
    <ul className="mt-3 flex flex-col gap-1 text-sm">
      {tickets.map((ticket) => (
        <li key={ticket.id}><Link href={`/admin/podpora/${ticket.id}`} className="underline underline-offset-4">{ticket.reference}</Link> · {contact.topics[ticket.topic as TopicCode]?.label ?? ticket.topic} · {copy.tickets.statuses[ticket.status]}</li>
      ))}
    </ul>
  );
}

/** /admin/stranke/[id] — account detail; /admin/stranke/gost?email= — guest purchaser (§14.8). */
export default async function AdminCustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ email?: string }> }) {
  const staff = await requirePagePermission("customers:view");
  const { id } = await params;
  const permissions = { gdpr: can(staff.role, "customers:gdpr") };

  if (id === "gost") {
    const { email } = await searchParams;
    const guest = email ? await loadGuest(email) : null;
    if (!guest) notFound();
    return (
      <section className="mx-auto max-w-(--container-wide)" data-admin-customer={guest.email}>
        <Link href="/admin/stranke" className="text-sm text-mid-1 underline underline-offset-4">{d.back}</Link>
        <h1 className="mt-3 text-[2rem]">{guest.name ?? guest.email}</h1>
        <p className="text-sm text-mid-1">{guest.email} · {copy.customers.types.guest}</p>
        <p className="mt-1 text-xs text-mid-2">{d.guestNote}</p>
        {guest.anonymizedAt ? <p className="mt-2 text-sm text-mid-2" data-customer-anonymised>{d.anonymised.replace("{date}", guest.anonymizedAt.toLocaleDateString("sl-SI"))}</p> : null}
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <section className="rounded-card border border-light-2 bg-white p-5">
            <h2 className="text-base font-medium">{d.orders}</h2>
            <p className="mt-1 text-xs text-mid-2">{d.orderCount}: {guest.orders.length} · {d.ltv}: {formatEUR(guest.ltvCents)}</p>
            <OrdersTable orders={guest.orders} />
          </section>
          <section className="rounded-card border border-light-2 bg-white p-5">
            <h2 className="text-base font-medium">{d.tickets}</h2>
            <TicketsList tickets={guest.tickets} />
          </section>
        </div>
        <div className="mt-4">
          <CustomerActions target={{ email: guest.email }} tags={[]} adminNotes={null} anonymized={guest.anonymizedAt !== null} permissions={permissions} />
        </div>
      </section>
    );
  }

  const customer = await loadCustomer(id);
  if (!customer) notFound();
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-customer={customer.email}>
      <Link href="/admin/stranke" className="text-sm text-mid-1 underline underline-offset-4">{d.back}</Link>
      <h1 className="mt-3 text-[2rem]" data-customer-name>{customer.name ?? copy.common.none}</h1>
      <p className="text-sm text-mid-1" data-customer-email>{customer.email}</p>
      {customer.anonymizedAt ? <p className="mt-2 text-sm text-mid-2" data-customer-anonymised>{d.anonymised.replace("{date}", customer.anonymizedAt.toLocaleDateString("sl-SI"))}</p> : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.profile}</h2>
          <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
            <dt className="text-mid-1">{d.role}</dt><dd>{copy.roles[customer.role]}</dd>
            <dt className="text-mid-1">{d.registered}</dt><dd>{customer.createdAt.toLocaleDateString("sl-SI")}</dd>
            <dt className="text-mid-1">{d.verified}</dt><dd>{customer.emailVerified ? copy.common.yes : copy.common.no}</dd>
            <dt className="text-mid-1">{d.marketingOptIn}</dt><dd>{customer.marketingOptIn ? copy.common.yes : copy.common.no}{customer.subscriber ? ` · ${customer.subscriber.status}` : ""}</dd>
            <dt className="text-mid-1">{d.orderCount}</dt><dd>{customer.orders.length}</dd>
            <dt className="text-mid-1">{d.ltv}</dt><dd style={{ fontVariantNumeric: "tabular-nums" }}>{formatEUR(customer.ltvCents)}</dd>
            <dt className="text-mid-1">{copy.shell.nav.reviews}</dt><dd>{customer._count.reviews}</dd>
          </dl>
          {customer.tags.length ? <p className="mt-3 flex flex-wrap gap-2">{customer.tags.map((tag) => <span key={tag} className="rounded-btn bg-light-3 px-2.5 py-1 text-xs" data-customer-tag={tag}>{tag}</span>)}</p> : null}
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5" data-customer-addresses>
          <h2 className="text-base font-medium">{d.addresses}</h2>
          {customer.addresses.length === 0 ? <p className="mt-3 text-sm text-mid-2">{d.noAddresses}</p> : (
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              {customer.addresses.map((address) => (
                <li key={address.id} className="border-t border-light-3 pt-3 first:border-t-0 first:pt-0">
                  <p className="font-medium">{address.fullName}{address.isDefault ? ` · ${copy.common.yes}` : ""}</p>
                  <p className="text-mid-1">{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.postalCode} {address.city}, {address.country}</p>
                  {address.phone ? <p className="text-mid-1">{address.phone}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.consents}</h2>
          {customer.marketingOptIns.length === 0 ? <p className="mt-3 text-sm text-mid-2">{d.noConsents}</p> : (
            <ul className="mt-3 flex flex-col gap-1 text-xs">
              {customer.marketingOptIns.map((entry) => (
                <li key={entry.id} className="flex flex-wrap gap-x-2">
                  <span className="text-mid-2" style={{ fontVariantNumeric: "tabular-nums" }}>{entry.createdAt.toLocaleString("sl-SI")}</span>
                  <span>{entry.kind} v{entry.version}</span>
                  <span className="break-all text-mid-1">{JSON.stringify(entry.choices)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-card border border-light-2 bg-white p-5" data-customer-orders>
          <h2 className="text-base font-medium">{d.orders}</h2>
          <OrdersTable orders={customer.orders} />
        </section>
        <section className="rounded-card border border-light-2 bg-white p-5">
          <h2 className="text-base font-medium">{d.tickets}</h2>
          <TicketsList tickets={customer.supportTickets} />
        </section>
      </div>

      <div className="mt-4">
        <CustomerActions target={{ userId: customer.id }} tags={customer.tags} adminNotes={customer.adminNotes} anonymized={customer.anonymizedAt !== null} permissions={permissions} />
      </div>
    </section>
  );
}
