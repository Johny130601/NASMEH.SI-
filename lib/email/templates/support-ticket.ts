import { siteUrl } from "@/lib/seo";
import { supportEmail as copy } from "@/lib/copy/support-email";
import { contact } from "@/lib/copy/contact";
import type { ReasonCode, TopicCode } from "@/lib/support/topics";
import { readableDetailValue } from "@/lib/support/detail-format";
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
  details?: unknown;
  attachments: Array<{ id: string }>;
}
type DetailsKind = keyof typeof copy.details;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const subjectReference = (reference: string) => reference.replace(/[\r\n]/g, " ");

/** Only the two structured kinds the dedicated forms produce are recognised. */
export function ticketDetailsKind(details: unknown): DetailsKind | null {
  if (!details || typeof details !== "object") return null;
  const kind = (details as { kind?: unknown }).kind;
  return kind === "withdrawal" || kind === "adverse" ? kind : null;
}

/**
 * The kind the mails treat a ticket as. A RETURN/WITHDRAWAL message from the general contact
 * form is a withdrawal notice too (Directive 2011/83/EU Art. 11(1): any unequivocal statement),
 * also when it was stored without details (tickets created before the contact path set them).
 * An ADVERSE ticket from the general contact form is an adverse-event report all the same: its
 * receipt carries the same safety note as the dedicated form (QA T4-F8).
 */
export function ticketKind(ticket: { topic: string; reason: string | null; details?: unknown }): DetailsKind | null {
  return ticketDetailsKind(ticket.details)
    ?? (ticket.topic === "RETURN" && ticket.reason === "WITHDRAWAL" ? "withdrawal" : ticket.topic === "ADVERSE" ? "adverse" : null);
}

function formatDetail(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? copy.staff.yes : copy.staff.no;
  if (key === "reporterType" && typeof value === "string") {
    return copy.reporterTypes[value as keyof typeof copy.reporterTypes] ?? value;
  }
  if (typeof value === "object") {
    const title = (value as { title?: unknown }).title;
    return typeof title === "string" ? title : null;
  }
  return typeof value === "string" ? readableDetailValue(value) : String(value);
}

/** Label/value rows in the copy's order; unknown keys are never rendered. */
export function ticketDetailRows(details: unknown): Array<[string, string]> {
  const kind = ticketDetailsKind(details);
  if (!kind) return [];
  const record = details as Record<string, unknown>;
  return Object.entries(copy.details[kind]).flatMap(([key, label]) => {
    const text = formatDetail(key, record[key]);
    return text ? [[label, text] as [string, string]] : [];
  });
}

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
  const details = ticketDetailRows(ticket.details);
  const withdrawal = ticketKind(ticket) === "withdrawal";
  const footer = withdrawal ? copy.staff.footerWithdrawal : copy.staff.footer;
  const photos = ticket.attachments.map((attachment, index) => ({
    label: `${copy.staff.photo} ${index + 1}`,
    url: `${siteUrl()}/api/support/attachments/${encodeURIComponent(attachment.id)}`,
  }));
  return {
    subject: `${withdrawal ? `${copy.staff.withdrawalSubjectTag} ` : ""}${copy.staff.subjectPrefix} ${subjectReference(ticket.reference)} — Nasmeh.si`,
    html: emailLayout(`
      <h1 style="${emailStyles.h1}">${copy.staff.heading}</h1>
      ${fields.map(([label, value]) => `<p style="${emailStyles.p}"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("")}
      ${details.length ? `<h2 style="${emailStyles.h1}">${copy.staff.details}</h2>
        ${details.map(([label, value]) => `<p style="${emailStyles.p}"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p>`).join("")}` : ""}
      <h2 style="${emailStyles.h1}">${copy.staff.message}</h2>
      <p style="${emailStyles.p}">${escapeHtml(ticket.message).replace(/\r?\n/g, "<br>")}</p>
      ${photos.length ? `<h2 style="${emailStyles.h1}">${copy.staff.photos}</h2>
        <p style="${emailStyles.small}">${copy.staff.photoAccess}</p>
        <ul>${photos.map(photo => `<li><a style="${emailStyles.link}" href="${escapeHtml(photo.url)}">${photo.label}</a></li>`).join("")}</ul>` : ""}
      <p style="${emailStyles.small}">${footer}</p>
    `),
    text: [copy.staff.heading, ...fields.map(([label, value]) => `${label}: ${value}`),
      ...(details.length ? [`${copy.staff.details}:\n${details.map(([label, value]) => `${label}: ${value}`).join("\n")}`] : []),
      `${copy.staff.message}:\n${ticket.message}`,
      ...(photos.length ? [copy.staff.photoAccess, ...photos.map(photo => `${photo.label}: ${photo.url}`)] : []), footer].join("\n\n"),
  };
}

/** An unverified destination receives only the opaque receipt reference plus a
 * generic statutory note for the structured kinds (no submitted data). */
export function renderSupportCustomerEmail(ticket: { reference: string; kind?: DetailsKind | null }) {
  const note = ticket.kind ? copy.customer.notes[ticket.kind] : null;
  return {
    subject: `${copy.customer.subjectPrefix} ${subjectReference(ticket.reference)} — Nasmeh.si`,
    html: emailLayout(`
      <h1 style="${emailStyles.h1}">${copy.customer.heading}</h1>
      <p style="${emailStyles.p}">${copy.customer.body}</p>
      <p style="${emailStyles.p}">${copy.customer.reference}: <strong>${escapeHtml(ticket.reference)}</strong></p>
      ${note ? `<p style="${emailStyles.p}">${note}</p>` : ""}
      <p style="${emailStyles.small}">${copy.customer.ignore}</p>
      <p style="${emailStyles.small}">${copy.customer.footer}</p>
    `),
    text: [copy.customer.heading, copy.customer.body, `${copy.customer.reference}: ${ticket.reference}`,
      ...(note ? [note] : []), copy.customer.ignore, copy.customer.footer].join("\n\n"),
  };
}
