import type { Metadata } from "next";
import { z } from "zod";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getOrderReceipt, hasOrderAccess } from "@/lib/orders/access";
import { getEnv } from "@/lib/env";
import { formatDdvLine, formatEUR } from "@/lib/pricing";
import { buildMetadata } from "@/lib/seo";
import { orders } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { CreateAccountForm } from "@/components/storefront/checkout/CreateAccountForm";
import { ClearCartOnPaid } from "@/components/storefront/checkout/ClearCartOnPaid";
import { PendingOrderRefresh } from "@/components/storefront/checkout/PendingOrderRefresh";
import { ResumeOrderPayment } from "@/components/storefront/checkout/ResumeOrderPayment";
import { TrackPurchase } from "@/components/storefront/analytics/TrackPurchase";
import type { EcommerceEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: orders.confirmation.paidTitle,
  path: "/potrditev",
  noindex: true,
});

/** Order confirmation page (§8.4): NS number, summary, estimates, invites. */
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const parsed = z.object({ orderNumber: z.string().min(1).max(80) }).safeParse(await params);
  if (!parsed.success) notFound();
  const { orderNumber } = parsed.data;
  const order = await db.order.findUnique({
    where: { number: orderNumber },
    include: { items: true },
  });
  const session = await auth();
  if (!order || !(await hasOrderAccess(order, session))) notFound();

  const paid = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status);
  const cancelled = order.status === "CANCELLED";
  const refunded = order.status === "REFUNDED";
  const purchaser = await getOrderReceipt(order);
  const env = getEnv();

  const purchaseEvent: EcommerceEvent | null = paid
    ? {
        event: "purchase",
        ecommerce: {
          currency: "EUR",
          value: order.totalCents / 100,
          items: order.items.map((item) => ({
            item_id: item.sku,
            item_name: item.title,
            price: item.unitPriceCents / 100,
            quantity: item.quantity,
          })),
        },
      }
    : null;

  return (
    <section className="mx-auto max-w-(--container-narrow) px-(--padding) py-16">
      {paid ? (
        <>
          <h1 className="text-[2rem]">{orders.confirmation.paidTitle}</h1>
          <p className="mt-3 max-w-lg text-sm text-mid-1">
            {orders.confirmation.paidBody}
          </p>
          {purchaseEvent ? <TrackPurchase event={purchaseEvent} /> : null}
          <ClearCartOnPaid orderNumber={order.number} />
        </>
      ) : cancelled ? (
        <>
          <h1 className="text-[2rem]">{orders.confirmation.cancelledTitle}</h1>
          <p role="alert" className="mt-3 max-w-lg text-sm text-error">
            {order.refundRequired ? orders.confirmation.refundRequiredBody : orders.confirmation.cancelledBody}
          </p>
        </>
      ) : refunded ? (
        <>
          <h1 className="text-[2rem]">{orders.confirmation.refundedTitle}</h1>
          <p className="mt-3 max-w-lg text-sm text-mid-1">{orders.confirmation.refundedBody}</p>
        </>
      ) : (
        <>
          <h1 className="text-[2rem]">{orders.confirmation.pendingTitle}</h1>
          <p className="mt-3 max-w-lg text-sm text-mid-1">
            {orders.confirmation.pendingBody}
          </p>
          <PendingOrderRefresh />
          <ResumeOrderPayment key={order.number} orderNumber={order.number}
            stripeKey={env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
            paypalClientId={env.PAYPAL_CLIENT_ID ?? null} />
        </>
      )}

      <div className="mt-8 rounded-card border border-light-2 bg-white p-6">
        <p className="text-sm text-mid-2">{orders.confirmation.orderNumber}</p>
        <p className="text-2xl font-medium text-dark-1" data-order-number>
          {order.number}
        </p>

        <h2 className="mt-6 text-lg">{orders.confirmation.summaryTitle}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between text-sm">
              <span className="text-mid-1">
                {item.quantity} × {item.title}
              </span>
              <span className="text-dark-1">
                {formatEUR(item.unitPriceCents * item.quantity)}
              </span>
            </li>
          ))}
          <li className="flex justify-between border-t border-light-3 pt-2 text-sm">
            <span className="text-mid-1">{order.shippingMethod}</span>
            <span className="text-dark-1">{formatEUR(order.shippingCents)}</span>
          </li>
          {order.discountCents > 0 ? (
            <li className="flex justify-between text-sm text-success">
              <span>{orders.confirmation.discountLabel}</span>
              <span>−{formatEUR(order.discountCents)}</span>
            </li>
          ) : null}
          <li className="flex justify-between text-base font-medium">
            <span className="text-dark-1">{orders.confirmation.totalLabel}</span>
            <span className="text-dark-1">{formatEUR(order.totalCents)}</span>
          </li>
        </ul>
        <p className="mt-1 text-xs text-mid-2">
          {formatDdvLine(order.totalCents, order.vatRatePercent)}
        </p>

        {paid ? (
          <>
            <p className="mt-6 text-sm text-dark-1">
              {orders.confirmation.deliveryEstimate}
            </p>
            <p className="mt-1 text-xs text-mid-2">
              {orders.confirmation.trackingNote}
            </p>
          </>
        ) : null}
      </div>

      {paid && !order.userId && purchaser ? (
        <div className="mt-8 max-w-md rounded-card border border-light-2 bg-white p-6">
          <h2 className="text-lg">{orders.confirmation.createAccountTitle}</h2>
          <p className="mt-1 text-sm text-mid-1">
            {orders.confirmation.createAccountBody}
          </p>
          <CreateAccountForm orderNumber={order.number} />
        </div>
      ) : null}

      <div className="mt-8">
        <UiButton href="/" variant="primary">
          {orders.confirmation.backHome}
        </UiButton>
      </div>
    </section>
  );
}
