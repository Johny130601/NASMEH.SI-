import { siteUrl } from "@/lib/seo";
import { supportEmail as copy } from "@/lib/copy/support-email";
import { contact } from "@/lib/copy/contact";
import type { ReasonCode, TopicCode } from "@/lib/support/topics";
import { emailLayout, emailStyles } from "./layout";

interface StaffTicket {
  reference: string;
  topic: TopicCode;
  reason: string | null;
  name: string;
  email: string;
  orderNumber: string | null;
  orderProof: string | null;
  message: string;
  attachments: Array<{ id: string }>;
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const subjectReference = (reference: string) => reference.replace(/[\r\n]/g, " ");

/** Staff-only content: filenames and user HTML cannot introduce public links. */
export function renderSupportStaffEmail(ticket: StaffTicket) {
  const topic = contact.topics[ticket.topic]?.label ?? ticket.topic;
  const reason = ticket.reason ? (Object.hasOwn(contact.reasons, ticket.reason)
    ? contact.reasons[ticket.reason as ReasonCode] : ticket.reason) : null;
  const proof = ticket.orderProof === "ACCOUNT" ? copy.staff.proofAccount
    : ticket.orderProof === "EMAIL_NUMBER" ? copy.staff.proofEmailNumber : copy.staff.proofUnknown;
  const fields = [
    [copy.staff.reference, ticket.reference], [copy.staff.topic, topic],
    ...(reason ? [[copy.staff.reason, reason]] : []),
    [copy.staff.name, ticket.name], [copy.staff.email, ticket.email],
    ...(ticket.orderNumber ? [[copy.staff.order, ticket.orderNumber], [copy.staff.orderProof, proof]] : []),
  ];
  const photos = ticket.attachments.map((attachment, index) => ({
    label: `${copy.staff.photo} ${index + 1}`,
    url: `${siteUrl()}/api/support/attachments/${encodeURIComponent(attachment.id)}`,
  }));
  return {
    subject: `${copy.staff.subjectPrefix} ${subjectReference(ticket.reference)} — Nasmeh.si`,
    html: emailLayout(`
      <h1 style="${emailStyles.h1}">${copy.staff.heading}</h1>
      ${fields.map(([label, value]) => `<p style="${emailStyles.p}"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("")}
      <h2 style="${emailStyles.h1}">${copy.staff.message}</h2>
      <p style="${emailStyles.p}">${escapeHtml(ticket.message).replace(/\r?\n/g, "<br>")}</p>
      ${photos.length ? `<h2 style="${emailStyles.h1}">${copy.staff.photos}</h2>
        <p style="${emailStyles.small}">${copy.staff.photoAccess}</p>
        <ul>${photos.map(photo => `<li><a style="${emailStyles.link}" href="${escapeHtml(photo.url)}">${photo.label}</a></li>`).join("")}</ul>` : ""}
      <p style="${emailStyles.small}">${copy.staff.footer}</p>
    `),
    text: [copy.staff.heading, ...fields.map(([label, value]) => `${label}: ${value}`),
      `${copy.staff.message}:\n${ticket.message}`,
      ...(photos.length ? [copy.staff.photoAccess, ...photos.map(photo => `${photo.label}: ${photo.url}`)] : []), copy.staff.footer].join("\n\n"),
  };
}

/** An unverified destination receives only the opaque receipt reference. */
export function renderSupportCustomerEmail(ticket: { reference: string }) {
  return {
    subject: `${copy.customer.subjectPrefix} ${subjectReference(ticket.reference)} — Nasmeh.si`,
    html: emailLayout(`
      <h1 style="${emailStyles.h1}">${copy.customer.heading}</h1>
      <p style="${emailStyles.p}">${copy.customer.body}</p>
      <p style="${emailStyles.p}">${copy.customer.reference}: <strong>${escapeHtml(ticket.reference)}</strong></p>
      <p style="${emailStyles.small}">${copy.customer.ignore}</p>
      <p style="${emailStyles.small}">${copy.customer.footer}</p>
    `),
    text: [copy.customer.heading, copy.customer.body, `${copy.customer.reference}: ${ticket.reference}`,
      copy.customer.ignore, copy.customer.footer].join("\n\n"),
  };
}
