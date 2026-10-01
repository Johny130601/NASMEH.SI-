import nodemailer, { type Transporter } from "nodemailer";
import type { Order, OrderItem } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { email as copy } from "@/lib/copy/email";
import { siteUrl } from "@/lib/seo";
import { renderProofEmail } from "./templates/proof";
import { renderSubscriptionUnsubscribeBlock, renderVerifySubscriptionEmail } from "./templates/verify-subscription";
import { escapeHtml } from "./templates/layout";
import { htmlToText } from "./text";
import { newsletterUnsubscribePath } from "@/lib/newsletter/unsubscribe-token";
import { renderBackInStockEmail } from "./templates/back-in-stock";
import {
  orderConfirmationDeliveryNote, orderConfirmationRequiredHtml, renderOrderConfirmationEmail, renderOrderItemsTable,
  type OrderConfirmationDetails,
} from "./templates/order-confirmation";
import { returns } from "@/lib/copy/returns";
import { legalTexts } from "@/lib/copy/invoice";
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
    text: text ?? htmlToText(html),
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

/**
 * Double opt-in verification email (spec §13.1). The signed newsletter
 * withdrawal link (GDPR Art. 7(3)) is a required block: an operator override
 * gets it appended and cannot remove it; the code template renders it itself.
 */
export async function sendSubscriptionVerification(to: string, token: string, subscriberId: string) {
  const base = siteUrl();
  const confirmUrl = `${base}/potrdi/${token}`;
  const unsubscribeUrl = `${base}${newsletterUnsubscribePath(subscriberId, getEnv().AUTH_SECRET)}`;
  const mail = await resolveMail("verifySubscription", { confirmUrl }, () => ({
    subject: copy.verifySubscription.subject,
    html: renderVerifySubscriptionEmail(confirmUrl, unsubscribeUrl),
  }), renderSubscriptionUnsubscribeBlock(unsubscribeUrl));
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

export interface OrderConfirmationContent extends OrderConfirmationDetails {
  invoicePdf: Buffer;
  /** Model withdrawal form (CRD Annex I(B)) with the seller block. */
  withdrawalFormPdf: Buffer;
  /** Terms and withdrawal page texts as the customer's durable copy. */
  legalTextsPdf: Buffer;
}

/**
 * Order confirmation on a durable medium (§8.4, CRD Art. 8(7)): the body from
 * the override or the code template, the legal block appended in either case
 * (with the delivery sentence unless the body shows {{deliveryNote}}), and the
 * invoice, the model withdrawal form and the legal texts as PDFs.
 */
export async function sendOrderConfirmationEmail(
  order: Order & { items: OrderItem[] },
  content: OrderConfirmationContent,
) {
  const details: OrderConfirmationDetails = { estimate: content.estimate, legal: content.legal };
  const mail = await resolveMail("orderConfirmation", {
    orderNumber: order.number, total: formatEUR(order.totalCents), shippingMethod: order.shippingMethod ?? "", items: renderOrderItemsTable(order),
    estimate: content.estimate ?? "", deliveryNote: orderConfirmationDeliveryNote(content.estimate),
  }, () => ({
    subject: `${copy.orderConfirmation.subjectPrefix} ${order.number} — Nasmeh.si`,
    html: renderOrderConfirmationEmail(order, details),
  }), orderConfirmationRequiredHtml(details));
  return sendMailWithAttachments({
    to: order.email,
    messageId: `<order-confirmation.${order.id}@nasmeh.si>`,
    ...mail,
    attachments: [
      { filename: `racun-${order.number}.pdf`, content: content.invoicePdf },
      { filename: returns.withdrawalPdf.filename, content: content.withdrawalFormPdf },
      { filename: legalTexts.filename(order.number), content: content.legalTextsPdf },
    ],
  });
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
    return `<tr><td style="padding:0.6rem 0;font-size:0.95rem;">${escapeHtml(item.title)}</td><td style="padding:0.6rem 0;text-align:right;white-space:nowrap;">${stars}</td></tr>`;
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
    text: input.text ?? htmlToText(input.html),
    attachments: input.attachments,
    messageId: input.messageId,
    replyTo: input.replyTo,
  });
}
