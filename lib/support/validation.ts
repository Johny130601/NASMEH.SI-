import { createHash } from "node:crypto";
import { z } from "zod";
import { authEmailSchema, humanTokenSchema } from "@/lib/auth-validation";
import { ADVERSE_REPORTER_TYPES, TOPIC_CODES, topicReasons } from "./topics";

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
const notInFuture = (value: string) => new Date(`${value}T00:00:00Z`).getTime() <= Date.now();

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
export const CONTACT_PRIVACY_VERSION = "contact-v1";

/** No challenge token or request key: retries bind the actual immutable intent. */
export function contactPayloadHash(input: ContactInput, userId: string | null, fileDigests: string[]): string {
  return createHash("sha256").update(JSON.stringify({
    userId, name: input.name, email: input.email, topic: input.topic,
    reason: input.reason, message: input.message, orderNumber: input.orderNumber,
    orderEmail: input.orderEmail, privacyVersion: CONTACT_PRIVACY_VERSION, fileDigests,
    details: input.details ?? null,
  })).digest("hex");
}

// ---------- Withdrawal (§12.4, CRD Annex I(B) model form) ----------

export const WITHDRAWAL_STATUTORY_BASIS = "ZVPot-1: odstop od pogodbe v 14 dneh brez navedbe razloga";

export const withdrawalInputSchema = z.object({
  requestKey: z.uuid(),
  name: nameSchema,
  email: authEmailSchema,
  address: freeText(5, 300),
  orderNumber: contactOrderNumberSchema,
  receivedAt: isoDate.refine(notInFuture, { message: "future" }),
  items: freeText(5, 2000),
  note: z.string().trim().max(2000).default(""),
  privacyAccepted: z.literal(true),
}).strict();
export type WithdrawalInput = z.infer<typeof withdrawalInputSchema>;

/** The model wording composed for staff; the order e-mail doubles as proof. */
export function withdrawalToContactInput(input: WithdrawalInput): ContactInput {
  const message = [
    `Obveščam vas, da odstopam od pogodbe za nakup naslednjega blaga: ${input.items}`,
    `Številka naročila: ${input.orderNumber}`,
    `Blago prejeto dne: ${input.receivedAt}`,
    `Naslov potrošnika: ${input.address}`,
    ...(input.note ? [`Opomba: ${input.note}`] : []),
  ].join("\n");
  return {
    requestKey: input.requestKey, name: input.name, email: input.email,
    topic: "RETURN", reason: "WITHDRAWAL", message,
    orderNumber: input.orderNumber, orderEmail: input.email, privacyAccepted: true,
    details: {
      kind: "withdrawal", statutoryBasis: WITHDRAWAL_STATUTORY_BASIS,
      address: input.address, receivedAt: input.receivedAt, items: input.items, note: input.note,
    },
  };
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
  // "natisnjeno na embalaži": mandatory for cosmetics vigilance, never guessed.
  batchNumber: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9 ./-]+$/),
  purchasePlace: freeText(2, 120),
  purchaseDate: z.union([isoDate, z.literal("")]).default(""),
  orderNumber: z.union([contactOrderNumberSchema, z.literal("")]).default(""),
  description: freeText(20, 5000),
  onsetDate: z.union([isoDate, z.literal("")]).default(""),
  ongoing: z.enum(["yes", "no"]),
  medicalTreatment: z.enum(["yes", "no"]),
  medicalDetails: z.string().trim().max(2000).default(""),
  contactPermission: z.boolean().default(false),
  privacyAccepted: z.literal(true),
}).strict();
export type AdverseInput = z.infer<typeof adverseInputSchema>;

export function adverseToContactInput(input: AdverseInput, product: { slug: string; title: string }): ContactInput {
  return {
    requestKey: input.requestKey, name: input.name, email: input.email,
    topic: "ADVERSE", reason: input.reason, message: input.description,
    orderNumber: input.orderNumber, orderEmail: input.orderNumber ? input.email : "", privacyAccepted: true,
    details: {
      kind: "adverse", reporterType: input.reporterType, phone: input.phone,
      product: { slug: product.slug, title: product.title },
      batchNumber: input.batchNumber, purchasePlace: input.purchasePlace, purchaseDate: input.purchaseDate,
      onsetDate: input.onsetDate, ongoing: input.ongoing === "yes",
      medicalTreatment: input.medicalTreatment === "yes", medicalDetails: input.medicalDetails,
      contactPermission: input.contactPermission,
    },
  };
}
