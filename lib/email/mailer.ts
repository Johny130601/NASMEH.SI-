import nodemailer, { type Transporter } from "nodemailer";
import type { Order, OrderItem } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { email as copy } from "@/lib/copy";
import { siteUrl } from "@/lib/seo";
import { renderProofEmail } from "./templates/proof";
import { renderVerifySubscriptionEmail } from "./templates/verify-subscription";
import { renderBackInStockEmail } from "./templates/back-in-stock";
import { renderOrderConfirmationEmail } from "./templates/order-confirmation";
import { renderVerifyAccountEmail } from "./templates/verify-account";
import { renderResetPasswordEmail } from "./templates/reset-password";
import { renderReviewRequestEmail, type ReviewRequestItem } from "./templates/review-request";
import { renderOrderShippedEmail } from "./templates/order-shipped";
import { renderOrderStatusEmail, type OrderStatusMailKind } from "./templates/order-status";
import { renderBackInStockAlertEmail, type BackInStockAlertDetails } from "./templates/back-in-stock-alert";
import { resolveMail } from "./templates/render";
import { formatEUR } from "@/lib/pricing";

let transporter: Transporter | null = null;

/** Nodemailer-over-SMTP transactional mailer (AGENTS §2). Local dev: mailpit. */
export function getTransporter(): Transporter {
  if (!transporter) {
    const env = getEnv();
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      ...(env.SMTP_USER
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
        : {}),
    });
  }
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  messageId?: string;
  replyTo?: string;
}

export async function sendMail({ to, subject, html, text, messageId, replyTo }: SendMailInput) {
  const env = getEnv();
  return getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    messageId,
    replyTo,
    text: text ?? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  });
}

/** Phase 0 proof: verifies the SMTP pipeline end-to-end (mailpit in dev). */
export async function sendProofEmail(to: string) {
  return sendMail({
    to,
    subject: copy.proof.subject,
    html: renderProofEmail(),
  });
}

/** Double opt-in verification email (spec §13.1). */
export async function sendSubscriptionVerification(to: string, token: string) {
  const confirmUrl = `${siteUrl()}/potrdi/${token}`;
  const mail = await resolveMail("verifySubscription", { confirmUrl }, () => ({
    subject: copy.verifySubscription.subject,
    html: renderVerifySubscriptionEmail(confirmUrl),
  }));
  return sendMail({ to, ...mail });
}

/** Back-in-stock double opt-in verification (spec §5/§6). */
export async function sendBackInStockVerification(
  to: string,
  token: string,
  productTitle: string,
) {
  const confirmUrl = `${siteUrl()}/potrdi-zalogo/${token}`;
  const mail = await resolveMail("backInStockConfirm", { confirmUrl, productTitle }, () => ({
    subject: copy.backInStock.subject,
    html: renderBackInStockEmail(confirmUrl, productTitle),
  }));
  return sendMail({ to, ...mail });
}

/** Restock alert (§13.1–13.2); stable Message-ID per subscription. */
export async function sendBackInStockAlertEmail(
  input: BackInStockAlertDetails & { to: string; subscriptionId: string },
) {
  const mail = await resolveMail("backInStockAlert", {
    productTitle: input.productTitle, productUrl: input.productUrl, price: formatEUR(input.priceCents), unsubscribeUrl: input.unsubscribeUrl,
  }, () => ({
    subject: `${copy.backInStockAlert.subjectPrefix}: ${input.productTitle} — Nasmeh.si`,
    html: renderBackInStockAlertEmail(input),
  }));
  return sendMail({
    to: input.to,
    messageId: `<back-in-stock.${input.subscriptionId}@nasmeh.si>`,
    ...mail,
  });
}

/** Order confirmation + PDF invoice attachment (§8.4). */
export async function sendOrderConfirmationEmail(
  order: Order & { items: OrderItem[] },
  invoicePdf: Buffer,
) {
  const mail = await resolveMail("orderConfirmation", {
    orderNumber: order.number, total: formatEUR(order.totalCents), shippingMethod: order.shippingMethod ?? "", items: renderOrderItemsBlock(order),
  }, () => ({
    subject: `${copy.orderConfirmation.subjectPrefix} ${order.number} — Nasmeh.si`,
    html: renderOrderConfirmationEmail(order),
  }));
  return sendMailWithAttachments({
    to: order.email,
    messageId: `<order-confirmation.${order.id}@nasmeh.si>`,
    ...mail,
    attachments: [
      { filename: `racun-${order.number}.pdf`, content: invoicePdf },
    ],
  });
}

const escapeText = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

/** Items, shipping and total as the block an override inserts through {{items}}. */
function renderOrderItemsBlock(order: Order & { items: OrderItem[] }): string {
  const rows = order.items.map((item) =>
    `<tr><td style="padding:0.4rem 0;font-size:0.9rem;">${item.quantity} × ${escapeText(item.title)}</td><td style="padding:0.4rem 0;font-size:0.9rem;text-align:right;">${formatEUR(item.unitPriceCents * item.quantity)}</td></tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:1rem 0;border-top:1px solid rgb(229,229,234);">${rows}<tr><td style="padding:0.4rem 0;font-size:0.9rem;border-top:1px solid rgb(229,229,234);">Dostava (${escapeText(order.shippingMethod ?? "")})</td><td style="padding:0.4rem 0;font-size:0.9rem;text-align:right;border-top:1px solid rgb(229,229,234);">${formatEUR(order.shippingCents)}</td></tr><tr><td style="padding:0.4rem 0;font-size:1rem;font-weight:500;">${copy.orderConfirmation.totalLabel}</td><td style="padding:0.4rem 0;font-size:1rem;font-weight:500;text-align:right;">${formatEUR(order.totalCents)}</td></tr></table>`;
}

/** Shipped notification with the carrier link (§12.3); stable Message-ID per order. */
export async function sendOrderShippedEmail(
  order: Order,
  details: { trackingLink: string | null; estimate: string | null },
) {
  const trackingPageUrl = `${siteUrl()}/sledi?sledenje=${encodeURIComponent(order.trackingNumber ?? "")}`;
  const mail = await resolveMail("orderShipped", {
    orderNumber: order.number, carrier: order.carrier ?? "", trackingNumber: order.trackingNumber ?? "",
    trackingUrl: details.trackingLink ?? "", estimate: details.estimate ?? "", trackingPageUrl,
  }, () => ({
    subject: `${copy.orderShipped.subjectPrefix} ${order.number} — Nasmeh.si`,
    html: renderOrderShippedEmail(order, { ...details, trackingPageUrl }),
  }));
  return sendMail({
    to: order.email,
    messageId: `<order-shipped.${order.id}@nasmeh.si>`,
    ...mail,
  });
}

/** Transition notifications (§14.7): processing, delivered, cancelled, refunded. */
export async function sendOrderStatusEmail(
  order: Order,
  kind: OrderStatusMailKind,
  details: { amountCents?: number } = {},
) {
  const accountUrl = order.userId ? `${siteUrl()}/racun/narocilo/${encodeURIComponent(order.number)}` : `${siteUrl()}/sledi`;
  const key = ({ processing: "orderProcessing", delivered: "orderDelivered", cancelled: "orderCancelled", refunded: "orderRefunded" } as const)[kind];
  const mail = await resolveMail(key, {
    orderNumber: order.number, accountUrl, ...(details.amountCents !== undefined ? { amount: formatEUR(details.amountCents) } : {}),
  }, () => ({
    subject: `${copy.orderStatus[kind].subjectPrefix} ${order.number} — Nasmeh.si`,
    html: renderOrderStatusEmail(kind, order, { ...details, accountUrl }),
  }));
  return sendMail({
    to: order.email,
    messageId: `<order-${kind}.${order.id}.${Date.now()}@nasmeh.si>`,
    ...mail,
  });
}

/** Account double opt-in verification (§11.1). */
export async function sendVerifyAccountEmail(to: string, token: string) {
  const confirmUrl = `${siteUrl()}/potrdi-racun/${token}`;
  const mail = await resolveMail("verifyAccount", { confirmUrl }, () => ({
    subject: copy.verifyAccount.subject,
    html: renderVerifyAccountEmail(confirmUrl),
  }));
  return sendMail({ to, ...mail });
}

/** Password reset email (§11.1). */
export async function sendResetPasswordEmail(to: string, token: string) {
  const resetUrl = `${siteUrl()}/ponastavi-geslo/${token}`;
  const mail = await resolveMail("resetPassword", { resetUrl }, () => ({
    subject: copy.resetPassword.subject,
    html: renderResetPasswordEmail(resetUrl),
  }));
  return sendMail({ to, ...mail });
}

/** Post-delivery review request (§10). */
export async function sendReviewRequestEmail(
  order: Order,
  items: ReviewRequestItem[],
) {
  const mail = await resolveMail("reviewRequest", { orderNumber: order.number, items: renderReviewItemsBlock(items) }, () => ({
    subject: `${copy.reviewRequest.subjectPrefix} ${order.number} — Nasmeh.si`,
    html: renderReviewRequestEmail(order, items),
  }));
  return sendMail({
    to: order.email,
    messageId: `<review-request.${order.id}@nasmeh.si>`,
    ...mail,
  });
}

/** Items with their one-click star links as the block an override inserts through {{items}}. */
function renderReviewItemsBlock(items: ReviewRequestItem[]): string {
  const base = siteUrl();
  const rows = items.map((item) => {
    const stars = item.ratingUrls.map(({ rating, token }) =>
      `<a href="${base}/oceni/hitro/${encodeURIComponent(token)}" title="${rating}★" style="font-size:1.4rem;text-decoration:none;color:rgb(0,168,143);">★</a>`).join(" ");
    return `<tr><td style="padding:0.6rem 0;font-size:0.95rem;">${escapeText(item.title)}</td><td style="padding:0.6rem 0;text-align:right;white-space:nowrap;">${stars}</td></tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:1rem 0;border-top:1px solid rgb(229,229,234);">${rows}</table>`;
}

/** Internal: send with optional attachments. */
export async function sendMailWithAttachments(
  input: SendMailInput & { attachments?: Array<{ filename: string; content: Buffer }> },
) {
  const env = getEnv();
  return getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text ?? input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    attachments: input.attachments,
    messageId: input.messageId,
    replyTo: input.replyTo,
  });
}
