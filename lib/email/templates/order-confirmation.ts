import type { Order, OrderItem } from "@prisma/client";
import { formatEUR } from "@/lib/pricing";
import { email as copy } from "@/lib/copy";
import { emailLayout, emailStyles } from "./layout";

/** Order confirmation email (§8.4) — PDF invoice attached by the caller. */
export function renderOrderConfirmationEmail(
  order: Order & { items: OrderItem[] },
): string {
  const lines = order.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:0.4rem 0;font-size:0.9rem;">${item.quantity} × ${item.title}</td>
          <td style="padding:0.4rem 0;font-size:0.9rem;text-align:right;">${formatEUR(item.unitPriceCents * item.quantity)}</td>
        </tr>`,
    )
    .join("");

  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.orderConfirmation.heading}</h1>
    <p style="${emailStyles.p}">
      ${copy.orderConfirmation.body}<br />
      <strong>${order.number}</strong>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:1rem 0;border-top:1px solid rgb(229,229,234);">
      ${lines}
      <tr>
        <td style="padding:0.4rem 0;font-size:0.9rem;border-top:1px solid rgb(229,229,234);">Dostava (${order.shippingMethod ?? ""})</td>
        <td style="padding:0.4rem 0;font-size:0.9rem;text-align:right;border-top:1px solid rgb(229,229,234);">${formatEUR(order.shippingCents)}</td>
      </tr>
      <tr>
        <td style="padding:0.4rem 0;font-size:1rem;font-weight:500;">${copy.orderConfirmation.totalLabel}</td>
        <td style="padding:0.4rem 0;font-size:1rem;font-weight:500;text-align:right;">${formatEUR(order.totalCents)}</td>
      </tr>
    </table>
    <p style="${emailStyles.p}">${copy.orderConfirmation.deliveryNote}</p>
    <p style="${emailStyles.small}">${copy.orderConfirmation.footer}</p>
  `);
}
