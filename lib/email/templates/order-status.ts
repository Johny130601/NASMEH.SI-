import type { Order } from "@prisma/client";
import { formatEUR } from "@/lib/pricing";
import { email as copy } from "@/lib/copy";
import { emailLayout, emailStyles } from "./layout";

export type OrderStatusMailKind = "processing" | "delivered" | "cancelled" | "refunded";

export interface OrderStatusMailDetails {
  amountCents?: number;
  accountUrl: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char
  ));
}

/** Transition notifications (§14.7): one short message per status change. */
export function renderOrderStatusEmail(kind: OrderStatusMailKind, order: Pick<Order, "number">, details: OrderStatusMailDetails): string {
  const text = copy.orderStatus[kind];
  const amount = kind === "refunded" && details.amountCents !== undefined
    ? `<p style="${emailStyles.p}">${copy.orderStatus.refundedAmountLabel}: <strong>${formatEUR(details.amountCents)}</strong></p>`
    : "";
  return emailLayout(`
    <h1 style="${emailStyles.h1}">${text.heading}</h1>
    <p style="${emailStyles.p}">${text.body}<br /><strong>${escapeHtml(order.number)}</strong></p>
    ${amount}
    <p style="margin:2rem 0;">
      <a href="${details.accountUrl.replace(/"/g, "%22")}" style="${emailStyles.button}">${copy.orderStatus.cta}</a>
    </p>
    <p style="${emailStyles.small}">${copy.orderStatus.footer}</p>
  `);
}
