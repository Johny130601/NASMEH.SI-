import { db } from "@/lib/db";
import { EMAIL_TEMPLATE_DEFS, substitutePlaceholders, type EmailTemplateKey } from "@/lib/email/template-defs";
import { emailLayout } from "./layout";

export interface RenderedMail { subject: string; html: string }

/** Renders a subject/body pair with the key's placeholders inside the shared layout. */
export function renderTemplate(key: EmailTemplateKey, subject: string, bodyHtml: string, values: Record<string, string>): RenderedMail {
  return {
    subject: substitutePlaceholders(key, subject, values, "text").replace(/\s+/g, " ").trim(),
    html: emailLayout(substitutePlaceholders(key, bodyHtml, values, "html")),
  };
}

/** The operator's override for a key rendered with live values, or null when the code template applies. */
export async function renderEmailOverride(key: EmailTemplateKey, values: Record<string, string>): Promise<RenderedMail | null> {
  const override = await db.emailTemplate.findUnique({ where: { key } });
  if (!override) return null;
  return renderTemplate(key, override.subject, override.bodyHtml, values);
}

/** Override when one exists, otherwise the code template; the mailer never chooses by itself. */
export async function resolveMail(key: EmailTemplateKey, values: Record<string, string>, fallback: () => RenderedMail): Promise<RenderedMail> {
  try {
    return (await renderEmailOverride(key, values)) ?? fallback();
  } catch (error) {
    // A broken override must never block a transactional mail.
    console.error(`E-mail override ${key} unavailable`, error instanceof Error ? error.name : error);
    return fallback();
  }
}

/** Preview/test-send rendering: the override or the default definition with the key's sample values. */
export function renderSample(key: EmailTemplateKey, subject: string | null, bodyHtml: string | null, values?: Record<string, string>): RenderedMail {
  const def = EMAIL_TEMPLATE_DEFS[key];
  return renderTemplate(key, subject ?? def.defaultSubject, bodyHtml ?? def.defaultBody, values ?? def.sample);
}
