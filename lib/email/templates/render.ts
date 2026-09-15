import { db } from "@/lib/db";
import { EMAIL_TEMPLATE_DEFS, substitutePlaceholders, type EmailTemplateKey } from "@/lib/email/template-defs";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { emailLayout } from "./layout";
import { sampleRequiredHtml } from "./required-samples";

export interface RenderedMail { subject: string; html: string }

/**
 * A block appended after the operator's body. A function receives the
 * sanitized, substituted body, so the block can leave out what the body
 * already shows (the order confirmation's delivery sentence).
 */
export type RequiredHtml = string | ((renderedBody: string) => string);

/**
 * Renders a subject/body pair with the key's placeholders inside the shared layout.
 * The body is sanitized after substitution (lib/email/sanitize.ts: no comments,
 * style or head elements, hiding styles or unclosed tags), and `requiredHtml`
 * (already escaped) follows it: a block the operator's template can neither
 * remove, alter nor hide.
 */
export function renderTemplate(key: EmailTemplateKey, subject: string, bodyHtml: string, values: Record<string, string>, requiredHtml: RequiredHtml = ""): RenderedMail {
  const body = sanitizeEmailHtml(substitutePlaceholders(key, bodyHtml, values, "html"));
  return {
    subject: substitutePlaceholders(key, subject, values, "text").replace(/\s+/g, " ").trim(),
    html: emailLayout(body + (typeof requiredHtml === "function" ? requiredHtml(body) : requiredHtml)),
  };
}

/** The operator's override for a key rendered with live values, or null when the code template applies. */
export async function renderEmailOverride(key: EmailTemplateKey, values: Record<string, string>, requiredHtml: RequiredHtml = ""): Promise<RenderedMail | null> {
  const override = await db.emailTemplate.findUnique({ where: { key } });
  if (!override) return null;
  return renderTemplate(key, override.subject, override.bodyHtml, values, requiredHtml);
}

/**
 * Override when one exists, otherwise the code template; the mailer never chooses by itself.
 * An override gets `requiredHtml` appended; the code fallback must render it itself.
 */
export async function resolveMail(key: EmailTemplateKey, values: Record<string, string>, fallback: () => RenderedMail, requiredHtml: RequiredHtml = ""): Promise<RenderedMail> {
  try {
    return (await renderEmailOverride(key, values, requiredHtml)) ?? fallback();
  } catch (error) {
    // A broken override must never block a transactional mail.
    console.error(`E-mail override ${key} unavailable`, error instanceof Error ? error.name : error);
    return fallback();
  }
}

/**
 * Preview/test-send rendering: the override or the default definition with the key's sample values,
 * followed by the key's required block rendered with sample data, so the operator sees the whole mail.
 */
export function renderSample(key: EmailTemplateKey, subject: string | null, bodyHtml: string | null, values?: Record<string, string>): RenderedMail {
  const def = EMAIL_TEMPLATE_DEFS[key];
  const sample = values ?? def.sample;
  return renderTemplate(key, subject ?? def.defaultSubject, bodyHtml ?? def.defaultBody, sample, sampleRequiredHtml(key, sample));
}
