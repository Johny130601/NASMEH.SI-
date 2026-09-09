import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatEUR } from "@/lib/pricing";
import { buildMetadata } from "@/lib/seo";
import { account as copy, common } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { OrderStatusPill } from "@/components/storefront/account/OrderStatusPill";
import { logoutAction } from "../prijava/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: copy.rows.orders,
  path: "/racun",
  noindex: true,
});

/** Moj račun dashboard (§11.2): greeting, rows, order accordion cards. */
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/prijava");

  const orders = await db.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  const firstName = session.user.name?.split(" ")[0] ?? session.user.email;

  return (
    <div className="mx-auto max-w-(--container-narrow) px-(--padding) py-12">
      <h1 className="text-[2rem]">
        {copy.greeting}, {firstName}
      </h1>

      <nav aria-label={common.siteName} className="mt-8 grid gap-3 md:grid-cols-2">
        <Link href="#narocila" className="rounded-card border border-light-2 bg-white p-5 text-base font-medium text-dark-1 transition-colors hover:border-brand">
          {copy.rows.orders}
        </Link>
        <Link href="/racun/podatki" className="rounded-card border border-light-2 bg-white p-5 text-base font-medium text-dark-1 transition-colors hover:border-brand">
          {copy.rows.details}
        </Link>
        <Link href="/kontakt" className="rounded-card border border-light-2 bg-white p-5 text-base font-medium text-dark-1 transition-colors hover:border-brand">
          {copy.rows.support}
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="w-full rounded-card border border-light-2 bg-white p-5 text-left text-base font-medium text-dark-1 transition-colors hover:border-error">
            {copy.rows.logout}
          </button>
        </form>
      </nav>

      <section id="narocila" className="mt-12">
        <h2 className="text-2xl">{copy.orders.title}</h2>
        {orders.length === 0 ? (
          <div className="mt-6">
            <p className="text-sm text-mid-1">{copy.orders.empty}</p>
            <div className="mt-4">
              <UiButton href="/trgovina" variant="primary">
                {common.nav.shop}
              </UiButton>
            </div>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {orders.map((order) => (
              <li key={order.id}>
                <details className="group rounded-card border border-light-2 bg-white p-5" data-order-card={order.number}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="font-medium text-dark-1">{order.number}</span>
                      <OrderStatusPill status={order.status} />
                    </span>
                    <span className="text-sm text-mid-2">
                      {order.createdAt.toLocaleDateString("sl-SI", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </summary>
                  <div className="mt-4 border-t border-light-3 pt-4">
                    <ul className="text-sm text-mid-1">
                      {order.items.slice(0, 3).map((item) => (
                        <li key={item.id}>
                          {item.quantity} × {item.title}
                        </li>
                      ))}
                      {order.items.length > 3 ? (
                        <li className="mt-2">
                          <details data-order-more>
                            <summary className="cursor-pointer text-xs text-mid-2">{copy.orders.showMore} ({order.items.length - 3})</summary>
                            <ul className="mt-2">{order.items.slice(3).map(item => <li key={item.id}>{item.quantity} × {item.title}</li>)}</ul>
                          </details>
                        </li>
                      ) : null}
                    </ul>
                    {order.trackingNumber && order.carrier ? (
                      <p className="mt-2 text-xs text-mid-2">
                        {copy.orders.shippedWith} {order.carrier}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-sm font-medium text-dark-1">
                        {formatEUR(order.totalCents)}
                      </p>
                      <Link
                        href={`/racun/narocilo/${order.number}`}
                        className="text-sm text-dark-1 underline underline-offset-2"
                      >
                        {copy.orders.detailLink}
                      </Link>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
