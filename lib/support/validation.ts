import { createHash } from "node:crypto";
import { z } from "zod";
import { authEmailSchema, humanTokenSchema } from "@/lib/auth-validation";
import { wordingVersion } from "@/lib/consent-log";
import { adverse } from "@/lib/copy/adverse";
import { contact } from "@/lib/copy/contact";
import { returns } from "@/lib/copy/returns";
import { readableDetailValue } from "./detail-format";
import { ADVERSE_REPORTER_TYPES, TOPIC_CODES, topicReasons, WITHDRAWAL_DELIVERY_STATUSES } from "./topics";

const NUL = String.fromCharCode(0);
const CONTROL = new RegExp(`[\\r\\n${NUL}]`);

export const contactOrderNumberSchema = z.string().trim().toUpperCase().regex(/^NS-\d{4}-\d{5}$/);
const nameSchema = z.string().trim().min(2).max(120).refine(value => !CONTROL.test(value));
const freeText = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine(value => !value.includes(NUL));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
/** Calendar date where the shop trades: "today" typed just after midnight in Ljubljana is not in the future. */
const SHOP_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit" });
export function shopToday(now = new Date()): string {
  return SHOP_DATE.format(now);
}
const notInFuture = (value: string) => value <= shopToday();

/**
 * The field a failed parse names first (schema order), so a server-side refusal can say which
 * field to correct instead of one generic sentence (QA T4-F6).
 */
export function firstInvalidField(error: z.ZodError): string | null {
  const key = error.issues[0]?.path[0];
  return typeof key === "string" ? key : null;
}

export const contactLookupSchema = z.object({
  email: authEmailSchema,
  orderNumber: contactOrderNumberSchema,
  turnstileToken: humanTokenSchema,
}).strict();

export const contactInputSchema = z.object({
  requestKey: z.uuid(),
  name: nameSchema,
  email: authEmailSchema,
  topic: z.enum(TOPIC_CODES),
  reason: z.string().max(50),
  message: freeText(10, 5000),
  orderNumber: z.union([contactOrderNumberSchema, z.literal("")]).default(""),
  orderEmail: z.union([authEmailSchema, z.literal("")]).default(""),
  privacyAccepted: z.literal(true),
}).strict().refine(value => (topicReasons[value.topic] as readonly string[]).includes(value.reason), { path: ["reason"] });

/** Structured payload of the dedicated forms; the contact form sends none. */
export type TicketDetails = { kind: "withdrawal" | "adverse" } & Record<string, unknown>;
export type ContactInput = z.infer<typeof contactInputSchema> & { details?: TicketDetails };

/**
 * Version of the privacy acknowledgement each form shows, stored in Ticket.privacyVersion
 * (GDPR Art. 5(2)). Derived from the wording like the consent log's versions, so editing one
 * form's text changes only that form's version. The adverse form's optional contact
 * permission sits in the same notice block and is covered by its version.
 */
export const PRIVACY_NOTICE_VERSIONS = {
  contact: `contact-${wordingVersion(contact.message.privacy)}`,
  withdrawal: `withdrawal-${wordingVersion(returns.withdrawal.privacy)}`,
  adverse: `adverse-${wordingVersion(`${adverse.consent.privacy}\n${adverse.consent.contact}`)}`,
} as const;

/** The form is known from the server-built details, never from a client field. */
export function privacyNoticeVersion(input: Pick<ContactInput, "details">): string {
  return PRIVACY_NOTICE_VERSIONS[input.details?.kind ?? "contact"];
}

/** No challenge token or request key: retries bind the actual immutable intent. */
export function contactPayloadHash(input: ContactInput, userId: string | null, fileDigests: string[]): string {
  return createHash("sha256").update(JSON.stringify({
    userId, name: input.name, email: input.email, topic: input.topic,
    reason: input.reason, message: input.message, orderNumber: input.orderNumber,
    orderEmail: input.orderEmail, privacyVersion: privacyNoticeVersion(input), fileDigests,
    details: input.details ?? null,
  })).digest("hex");
}

// ---------- Withdrawal (§12.4, CRD Annex I(B) model form) ----------

export const WITHDRAWAL_STATUTORY_BASIS = "ZVPot-1: odstop od pogodbe v 14 dneh brez navedbe razloga";

/**
 * Annex I(B) "ordered on / received on": the consumer may withdraw before delivery too
 * (Directive 2011/83/EU Art. 9), so the receipt date is required only for received goods.
 */
export const withdrawalInputSchema = z.object({
  requestKey: z.uuid(),
  name: nameSchema,
  email: authEmailSchema,
  address: freeText(5, 300),
  orderNumber: contactOrderNumberSchema,
  deliveryStatus: z.enum(WITHDRAWAL_DELIVERY_STATUSES),
  receivedAt: z.union([isoDate.refine(notInFuture, { message: "future" }), z.literal("")]).default(""),
  items: freeText(5, 2000),
  note: z.string().trim().max(2000).default(""),
  privacyAccepted: z.literal(true),
}).strict().refine(value => value.deliveryStatus === "not_received" || value.receivedAt !== "", { path: ["receivedAt"] });
export type WithdrawalInput = z.infer<typeof withdrawalInputSchema>;

/**
 * The model wording composed for staff. The order e-mail links the order when it matches;
 * a notice that matches no order is still recorded (lib/support/tickets.ts).
 */
export function withdrawalToContactInput(input: WithdrawalInput): ContactInput {
  const goodsReceived = input.deliveryStatus === "received";
  // A date sent with "not received" contradicts the answer; the answer wins.
  const receivedAt = goodsReceived ? input.receivedAt : "";
  // Staff read the date as "1. 9. 2026" in the message too, not only in the rows below it; details keep ISO.
  const lines = returns.withdrawal.staffMessage;
  const message = [
    lines.intro(input.items),
    lines.orderNumber(input.orderNumber),
    goodsReceived ? lines.receivedAt(readableDetailValue(receivedAt)) : lines.notReceived,
    lines.address(input.address),
    ...(input.note ? [lines.note(input.note)] : []),
  ].join("\n");
  return {
    requestKey: input.requestKey, name: input.name, email: input.email,
    topic: "RETURN", reason: "WITHDRAWAL", message,
    orderNumber: input.orderNumber, orderEmail: input.email, privacyAccepted: true,
    details: {
      kind: "withdrawal", statutoryBasis: WITHDRAWAL_STATUTORY_BASIS,
      goodsReceived, address: input.address, receivedAt, items: input.items, note: input.note,
    },
  };
}

/**
 * Details of a ticket as stored. A RETURN/WITHDRAWAL message from the general contact form is a
 * withdrawal notice as well (Directive 2011/83/EU Art. 11(1)), so it gets the withdrawal kind the
 * mails, the unlinked-order exception and the admin screens key on, without the model form's
 * fields. The privacy version and the payload hash keep using the submitted input.
 */
export function ticketDetailsForInput(input: ContactInput): TicketDetails | undefined {
  if (input.details) return input.details;
  if (input.topic === "RETURN" && input.reason === "WITHDRAWAL") {
    return { kind: "withdrawal", statutoryBasis: WITHDRAWAL_STATUTORY_BASIS, viaContactForm: true };
  }
  return undefined;
}

// ---------- Adverse-event report (§12.6) ----------

export const adverseInputSchema = z.object({
  requestKey: z.uuid(),
  name: nameSchema,
  email: authEmailSchema,
  phone: z.string().trim().max(40).regex(/^[+0-9 ()/-]*$/).default(""),
  reporterType: z.enum(ADVERSE_REPORTER_TYPES),
  reason: z.enum(["REACTION", "PRODUCT_SAFETY"]).default("REACTION"),
  productSlug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  // "natisnjeno na embalaži": strongly encouraged and never guessed, but a reporter
  // without the packaging states that it is unknown instead of being turned away.
  batchNumber: z.union([z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9 ./-]+$/), z.literal("")]).default(""),
  batchUnknown: z.boolean().default(false),
  purchasePlace: freeText(2, 120),
  // A purchase or an onset cannot lie in the future (QA T4-F4), like the withdrawal receipt date.
  purchaseDate: z.union([isoDate.refine(notInFuture, { message: "future" }), z.literal("")]).default(""),
  orderNumber: z.union([contactOrderNumberSchema, z.literal("")]).default(""),
  description: freeText(20, 5000),
  onsetDate: z.union([isoDate.refine(notInFuture, { message: "future" }), z.literal("")]).default(""),
  ongoing: z.enum(["yes", "no"]),
  medicalTreatment: z.enum(["yes", "no"]),
  medicalDetails: z.string().trim().max(2000).default(""),
  contactPermission: z.boolean().default(false),
  privacyAccepted: z.literal(true),
}).strict().refine(value => value.batchNumber !== "" || value.batchUnknown, { path: ["batchNumber"] });
export type AdverseInput = z.infer<typeof adverseInputSchema>;

export function adverseToContactInput(input: AdverseInput, product: { slug: string; title: string }): ContactInput {
  return {
    requestKey: input.requestKey, name: input.name, email: input.email,
    topic: "ADVERSE", reason: input.reason, message: input.description,
    orderNumber: input.orderNumber, orderEmail: input.orderNumber ? input.email : "", privacyAccepted: true,
    details: {
      kind: "adverse", reporterType: input.reporterType, phone: input.phone,
      product: { slug: product.slug, title: product.title },
      // A given batch number wins over a contradictory "unknown" tick.
      batchNumber: input.batchNumber, batchUnknown: input.batchNumber === "",
      purchasePlace: input.purchasePlace, purchaseDate: input.purchaseDate,
      onsetDate: input.onsetDate, ongoing: input.ongoing === "yes",
      medicalTreatment: input.medicalTreatment === "yes", medicalDetails: input.medicalDetails,
      contactPermission: input.contactPermission,
    },
  };
}
