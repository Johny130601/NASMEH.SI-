import { createHash } from "node:crypto";
import { z } from "zod";
import { authEmailSchema, humanTokenSchema } from "@/lib/auth-validation";
import { TOPIC_CODES, topicReasons } from "./topics";

export const contactOrderNumberSchema = z.string().trim().toUpperCase().regex(/^NS-\d{4}-\d{5}$/);
export const contactLookupSchema = z.object({
  email: authEmailSchema,
  orderNumber: contactOrderNumberSchema,
  turnstileToken: humanTokenSchema,
}).strict();

export const contactInputSchema = z.object({
  requestKey: z.uuid(),
  name: z.string().trim().min(2).max(120).refine(value => !/[\r\n\u0000]/.test(value)),
  email: authEmailSchema,
  topic: z.enum(TOPIC_CODES),
  reason: z.string().max(50),
  message: z.string().trim().min(10).max(5000).refine(value => !value.includes("\u0000")),
  orderNumber: z.union([contactOrderNumberSchema, z.literal("")]).default(""),
  orderEmail: z.union([authEmailSchema, z.literal("")]).default(""),
  privacyAccepted: z.literal(true),
}).strict().refine(value => (topicReasons[value.topic] as readonly string[]).includes(value.reason), { path: ["reason"] });

export type ContactInput = z.infer<typeof contactInputSchema>;
export const CONTACT_PRIVACY_VERSION = "contact-v1";

/** No challenge token or request key: retries bind the actual immutable intent. */
export function contactPayloadHash(input: ContactInput, userId: string | null, fileDigests: string[]): string {
  return createHash("sha256").update(JSON.stringify({
    userId, name: input.name, email: input.email, topic: input.topic,
    reason: input.reason, message: input.message, orderNumber: input.orderNumber,
    orderEmail: input.orderEmail, privacyVersion: CONTACT_PRIVACY_VERSION, fileDigests,
  })).digest("hex");
}
