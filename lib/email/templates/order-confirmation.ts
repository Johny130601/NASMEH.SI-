import type { Order, OrderItem } from "@prisma/client";
import { formatEUR } from "@/lib/pricing";
import { email as copy } from "@/lib/copy";
import { returns } from "@/lib/copy/returns";
import type { CompanySetting } from "@/lib/settings";
import { telHref } from "@/lib/phone";
import { sanitizedText } from "@/lib/email/sanitize";
import { emailLayout, emailStyles, escapeHtml } from "./layout";

/** What the confirmation must carry on a durable medium, whatever template renders the body. */
export interface OrderConfirmationLegal {
  /** The seller as printed on the invoice (the snapshot taken at issuance). */
  seller: CompanySetting;
  /** Absolute URLs of the published pages. */
  links: { terms: string; withdrawal: string; complaints: string; guarantee: string };
  /** SHA-256 of the page bodies the buyer confirmed at checkout (Order.legalAcceptance); null when unknown. */
  accepted: { terms: string | null; withdrawal: string | null };
}

export interface OrderConfirmationDetails {
  /** Estimate of the chosen shipping method; null when the method is no longer configured. */
  estimate: string | null;
  legal: OrderConfirmationLegal;
}

const text = copy.orderConfirmation;
const legalCopy = text.legal;

export function orderConfirmationDeliveryNote(estimate: string | null): string {
  return estimate?.trim() ? text.deliveryEstimate(estimate.trim()) : text.deliveryNote;
}

const link = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="${emailStyles.link}">${escapeHtml(label)}</a>`;

/**
 * Marks the block for tests and mail checks. The attribute name is random per
 * render, so operator markup has no stable selector to aim at (the body
 * sanitizer also drops style elements and data-* attributes).
 */
function legalBlockMarker(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return `data-order-legal-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The delivery arrangement (CRD Art. 6(1)(g)), seller identity, withdrawal
 * summary, complaints and guarantee pointers and the legal links (CRD Art.
 * 6(1), 8(7)). The mailer appends it after an operator override too, so no
 * template edit can drop it. `deliveryNote` null leaves the delivery sentence
 * out: only for a body that already shows it (orderConfirmationRequiredHtml).
 */
export function renderOrderConfirmationLegalBlock(legal: OrderConfirmationLegal, deliveryNote: string | null = null): string {
  const { seller, links, accepted } = legal;
  const phone = seller.phone?.trim();
  const phoneHref = phone ? telHref(phone) : null;
  const sellerLines = [
    `<strong>${escapeHtml(seller.name)}</strong>`,
    escapeHtml(seller.address),
    `${legalCopy.registration}: ${escapeHtml(seller.registrationNumber)} · ${legalCopy.vatId}: ${escapeHtml(seller.vatId)}`,
    `${legalCopy.email}: ${link(`mailto:${seller.email}`, seller.email)}`,
    ...(phone ? [`${legalCopy.phone}: ${phoneHref ? link(phoneHref, phone) : escapeHtml(phone)}`] : []),
  ];
  const acceptedLines = [
    accepted.terms ? legalCopy.accepted(legalCopy.links.terms, accepted.terms) : null,
    accepted.withdrawal ? legalCopy.accepted(legalCopy.links.withdrawal, accepted.withdrawal) : null,
  ].filter((line): line is string => line !== null);
  const p = (content: string) => `<p style="${emailStyles.small}">${content}</p>`;

  return `
    <div ${legalBlockMarker()} style="margin-top:2rem;border-top:1px solid rgb(229,229,234);padding-top:0.5rem;">
      ${deliveryNote ? `<h2 style="${emailStyles.h2}">${legalCopy.deliveryTitle}</h2>
      ${p(escapeHtml(deliveryNote))}` : ""}
      ${p(escapeHtml(legalCopy.attachments))}
      <h2 style="${emailStyles.h2}">${legalCopy.sellerTitle}</h2>
      ${p(sellerLines.join("<br />"))}
      <h2 style="${emailStyles.h2}">${legalCopy.withdrawalTitle}</h2>
      ${p(escapeHtml(legalCopy.withdrawal))}
      ${p(escapeHtml(legalCopy.withdrawalHow(seller.email)))}
      ${p(escapeHtml(returns.withdrawal.success.statutory))}
      ${p(escapeHtml(legalCopy.returnCosts))}
      ${p(`${escapeHtml(legalCopy.complaints)} ${link(links.complaints, legalCopy.links.complaints)}.`)}
      ${p(`${escapeHtml(legalCopy.guarantee)} ${link(links.guarantee, legalCopy.links.guarantee)}.`)}
      <h2 style="${emailStyles.h2}">${legalCopy.linksTitle}</h2>
      ${p([link(links.terms, legalCopy.links.terms), link(links.withdrawal, legalCopy.links.withdrawal), link(links.complaints, legalCopy.links.complaints)].join(" · "))}
      ${acceptedLines.map((line) => p(escapeHtml(line))).join("")}
    </div>`;
}

/**
 * The required part after a body (override or code template): the legal block,
 * with the delivery sentence unless the body's text already carries it through
 * {{deliveryNote}}. Expects sanitized markup (renderTemplate sanitizes the
 * override), so a sentence inside a comment or an attribute does not count.
 */
export function orderConfirmationRequiredHtml(details: OrderConfirmationDetails): (renderedBody: string) => string {
  const note = orderConfirmationDeliveryNote(details.estimate);
  return (renderedBody) => renderOrderConfirmationLegalBlock(details.legal, sanitizedText(renderedBody).includes(escapeHtml(note)) ? null : note);
}

/** Order confirmation email (§8.4) — invoice, model withdrawal form and legal texts attached by the caller. */
export function renderOrderConfirmationEmail(
  order: Order & { items: OrderItem[] },
  details: OrderConfirmationDetails,
): string {
  const lines = order.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:0.4rem 0;font-size:0.9rem;">${item.quantity} × ${escapeHtml(item.title)}</td>
          <td style="padding:0.4rem 0;font-size:0.9rem;text-align:right;">${formatEUR(item.unitPriceCents * item.quantity)}</td>
        </tr>`,
    )
    .join("");

  return emailLayout(`
    <h1 style="${emailStyles.h1}">${text.heading}</h1>
    <p style="${emailStyles.p}">
      ${text.body}<br />
      <strong>${escapeHtml(order.number)}</strong>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:1rem 0;border-top:1px solid rgb(229,229,234);">
      ${lines}
      <tr>
        <td style="padding:0.4rem 0;font-size:0.9rem;border-top:1px solid rgb(229,229,234);">Dostava (${escapeHtml(order.shippingMethod ?? "")})</td>
        <td style="padding:0.4rem 0;font-size:0.9rem;text-align:right;border-top:1px solid rgb(229,229,234);">${formatEUR(order.shippingCents)}</td>
      </tr>
      <tr>
        <td style="padding:0.4rem 0;font-size:1rem;font-weight:500;">${text.totalLabel}</td>
        <td style="padding:0.4rem 0;font-size:1rem;font-weight:500;text-align:right;">${formatEUR(order.totalCents)}</td>
      </tr>
    </table>
    <p style="${emailStyles.p}">${escapeHtml(orderConfirmationDeliveryNote(details.estimate))}</p>
    <p style="${emailStyles.small}">${text.footer}</p>
    ${renderOrderConfirmationLegalBlock(details.legal)}
  `);
}
