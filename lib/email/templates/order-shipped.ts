import type { Order } from "@prisma/client";
import { email as copy } from "@/lib/copy";
import { emailLayout, emailStyles } from "./layout";

export interface ShippedEmailDetails {
  trackingLink: string | null;
  estimate: string | null;
  trackingPageUrl: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char
  ));
}

/** Shipped notification (§12.3): carrier, number, the same carrier link as the site. */
export function renderOrderShippedEmail(order: Order, details: ShippedEmailDetails): string {
  const carrier = escapeHtml(order.carrier ?? "");
  const number = escapeHtml(order.trackingNumber ?? "");
  const pageUrl = details.trackingPageUrl.replace(/"/g, "%22");
  const trackingRow = details.trackingLink
    ? `<p style="${emailStyles.p}">${copy.orderShipped.trackingLabel}: <strong>${number}</strong><br />
        <a href="${details.trackingLink.replace(/"/g, "%22")}" style="${emailStyles.link}">${copy.orderShipped.carrierLink}</a></p>`
    : `<p style="${emailStyles.p}">${copy.orderShipped.trackingLabel}: <strong>${number}</strong><br />${copy.orderShipped.noLink}</p>`;

  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.orderShipped.heading}</h1>
    <p style="${emailStyles.p}">
      ${copy.orderShipped.body}<br />
      <strong>${escapeHtml(order.number)}</strong>
    </p>
    <p style="${emailStyles.p}">${copy.orderShipped.carrierLabel}: <strong>${carrier}</strong></p>
    ${trackingRow}
    ${details.estimate ? `<p style="${emailStyles.p}">${copy.orderShipped.estimateLabel}: ${escapeHtml(details.estimate)}</p>` : ""}
    <p style="margin:2rem 0;">
      <a href="${pageUrl}" style="${emailStyles.button}">${copy.orderShipped.cta}</a>
    </p>
    <p style="${emailStyles.small}">${copy.orderShipped.footer}</p>
  `);
}
