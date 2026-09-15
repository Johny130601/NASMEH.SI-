"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { sendMail } from "@/lib/email/mailer";
import { EMAIL_TEMPLATE_KEYS, unknownPlaceholders, type EmailTemplateKey } from "@/lib/email/template-defs";
import { renderSample } from "@/lib/email/templates/render";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";

export type EmailTemplateActionResult = { ok: true } | { ok: false; error: "invalid" | "unknownPlaceholders" | "send"; names?: string[] };

/**
 * The body is stored sanitized (lib/email/sanitize.ts), so what the operator saves is what
 * renders: no comment, style or head element and no unclosed tag can hide the required block.
 */
const templateSchema = z.object({
  key: z.enum(EMAIL_TEMPLATE_KEYS),
  subject: z.string().trim().min(1).max(200),
  bodyHtml: z.string().min(1).max(60_000).transform(sanitizeEmailHtml).refine((body) => body.trim().length > 0),
});

function validate(input: unknown): { ok: true; data: z.output<typeof templateSchema> } | Extract<EmailTemplateActionResult, { ok: false }> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const names = unknownPlaceholders(parsed.data.key, parsed.data.subject, parsed.data.bodyHtml);
  if (names.length) return { ok: false, error: "unknownPlaceholders", names };
  return { ok: true, data: parsed.data };
}

function refresh(key: EmailTemplateKey) {
  revalidatePath("/admin/e-posta");
  revalidatePath(`/admin/e-posta/${key}`);
}

/** Stores an override; the mailer uses it for every later send of that key. */
export async function saveEmailTemplateAction(input: { key: string; subject: string; bodyHtml: string }): Promise<EmailTemplateActionResult> {
  await requirePermission("content:manage");
  const checked = validate(input);
  if (!checked.ok) return checked;
  const { key, subject, bodyHtml } = checked.data;
  await db.emailTemplate.upsert({ where: { key }, create: { key, subject, bodyHtml }, update: { subject, bodyHtml } });
  refresh(key);
  return { ok: true };
}

/** Removes the override so the code template applies again. */
export async function resetEmailTemplateAction(input: { key: string }): Promise<EmailTemplateActionResult> {
  await requirePermission("content:manage");
  const parsed = z.object({ key: z.enum(EMAIL_TEMPLATE_KEYS) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await db.emailTemplate.deleteMany({ where: { key: parsed.data.key } });
  refresh(parsed.data.key);
  return { ok: true };
}

/** Sends the editor's current subject/body with the key's sample values to one address. */
export async function sendTestEmailAction(input: { key: string; subject: string; bodyHtml: string; to: string }): Promise<EmailTemplateActionResult> {
  await requirePermission("content:manage");
  const to = z.string().trim().toLowerCase().email().max(200).safeParse(input.to);
  if (!to.success) return { ok: false, error: "invalid" };
  const checked = validate(input);
  if (!checked.ok) return checked;
  const mail = renderSample(checked.data.key, checked.data.subject, checked.data.bodyHtml);
  try {
    await sendMail({ to: to.data, subject: `[TEST] ${mail.subject}`, html: mail.html });
  } catch (error) {
    console.error("Test e-mail failed", error instanceof Error ? error.name : error);
    return { ok: false, error: "send" };
  }
  return { ok: true };
}
