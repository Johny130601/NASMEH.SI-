import type { Order, OrderItem } from "@prisma/client";
import { formatDdvLine, formatEUR } from "@/lib/pricing";
import { email as copy } from "@/lib/copy/email";
import { returns } from "@/lib/copy/returns";
import type { CompanySetting } from "@/lib/settings";
import { companyPlaceholderFields } from "@/lib/settings-schemas";
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
  // A seed placeholder is never stated as the seller's identity (gate G4): its line is left
  // out, as the footer and the legal pages leave the block out (QA 2026-10-03 F-SHOP).
  const placeholders = new Set<string>(companyPlaceholderFields(seller));
  const registry = [
    placeholders.has("registrationNumber") ? null : `${legalCopy.registration}: ${escapeHtml(seller.registrationNumber)}`,
    placeholders.has("vatId") ? null : `${legalCopy.vatId}: ${escapeHtml(seller.vatId)}`,
  ].filter((part): part is string => part !== null);
  const sellerLines = [
    `<strong>${escapeHtml(seller.name)}</strong>`,
    ...(placeholders.has("address") ? [] : [escapeHtml(seller.address)]),
    ...(registry.length > 0 ? [registry.join(" · ")] : []),
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

const ROW = "padding:0.4rem 0;font-size:0.9rem;";
const RULE = "border-top:1px solid rgb(229,229,234);";

/**
 * Items, the discount (code and amount, so the lines add up), shipping, the
 * total and the included-VAT line (lib/pricing, the invoice's figure): the one
 * table the code template renders and an override inserts through {{items}}.
 */
export function renderOrderItemsTable(order: Order & { items: OrderItem[] }): string {
  const row = (label: string, amount: string, style = ROW) =>
    `<tr><td style="${style}">${label}</td><td style="${style}text-align:right;">${amount}</td></tr>`;
  const lines = order.items.map((item) => row(`${item.quantity} × ${escapeHtml(item.title)}`, formatEUR(item.unitPriceCents * item.quantity))).join("");
  const discount = order.discountCents > 0
    ? row(escapeHtml(order.couponCode ? text.discountWithCode(order.couponCode) : text.discountLabel), `−${formatEUR(order.discountCents)}`)
    : "";
  const shipping = row(`${text.shippingLabel} (${escapeHtml(order.shippingMethod ?? "")})`, order.shippingCents === 0 ? text.shippingFree : formatEUR(order.shippingCents), `${ROW}${RULE}`);
  const total = row(text.totalLabel, formatEUR(order.totalCents), "padding:0.4rem 0;font-size:1rem;font-weight:500;");
  const vat = `<tr><td colspan="2" style="padding:0 0 0.4rem;font-size:0.8rem;color:rgb(99,99,102);text-align:right;">${escapeHtml(formatDdvLine(order.totalCents, order.vatRatePercent))}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:1rem 0;${RULE}">${lines}${discount}${shipping}${total}${vat}</table>`;
}

/** Order confirmation email (§8.4) — invoice, model withdrawal form and legal texts attached by the caller. */
export function renderOrderConfirmationEmail(
  order: Order & { items: OrderItem[] },
  details: OrderConfirmationDetails,
): string {
  return emailLayout(`
    <h1 style="${emailStyles.h1}">${text.heading}</h1>
    <p style="${emailStyles.p}">
      ${text.body}<br />
      <strong>${escapeHtml(order.number)}</strong>
    </p>
    ${renderOrderItemsTable(order)}
    <p style="${emailStyles.p}">${escapeHtml(orderConfirmationDeliveryNote(details.estimate))}</p>
    <p style="${emailStyles.small}">${text.footer}</p>
    ${renderOrderConfirmationLegalBlock(details.legal)}
  `);
}
