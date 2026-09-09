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
  return sendMail({
    to,
    subject: copy.verifySubscription.subject,
    html: renderVerifySubscriptionEmail(confirmUrl),
  });
}

/** Back-in-stock double opt-in verification (spec §5/§6). */
export async function sendBackInStockVerification(
  to: string,
  token: string,
  productTitle: string,
) {
  const confirmUrl = `${siteUrl()}/potrdi-zalogo/${token}`;
  return sendMail({
    to,
    subject: copy.backInStock.subject,
    html: renderBackInStockEmail(confirmUrl, productTitle),
  });
}

/** Order confirmation + PDF invoice attachment (§8.4). */
export async function sendOrderConfirmationEmail(
  order: Order & { items: OrderItem[] },
  invoicePdf: Buffer,
) {
  return sendMailWithAttachments({
    to: order.email,
    subject: `${copy.orderConfirmation.subjectPrefix} ${order.number} — Nasmeh.si`,
    messageId: `<order-confirmation.${order.id}@nasmeh.si>`,
    html: renderOrderConfirmationEmail(order),
    attachments: [
      { filename: `racun-${order.number}.pdf`, content: invoicePdf },
    ],
  });
}

/** Account double opt-in verification (§11.1). */
export async function sendVerifyAccountEmail(to: string, token: string) {
  const confirmUrl = `${siteUrl()}/potrdi-racun/${token}`;
  return sendMail({
    to,
    subject: copy.verifyAccount.subject,
    html: renderVerifyAccountEmail(confirmUrl),
  });
}

/** Password reset email (§11.1). */
export async function sendResetPasswordEmail(to: string, token: string) {
  const resetUrl = `${siteUrl()}/ponastavi-geslo/${token}`;
  return sendMail({
    to,
    subject: copy.resetPassword.subject,
    html: renderResetPasswordEmail(resetUrl),
  });
}

/** Post-delivery review request (§10). */
export async function sendReviewRequestEmail(
  order: Order,
  items: ReviewRequestItem[],
) {
  return sendMail({
    to: order.email,
    subject: `${copy.reviewRequest.subjectPrefix} ${order.number} — Nasmeh.si`,
    messageId: `<review-request.${order.id}@nasmeh.si>`,
    html: renderReviewRequestEmail(order, items),
  });
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
