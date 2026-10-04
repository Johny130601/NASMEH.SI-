"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { resetEmailTemplateAction, saveEmailTemplateAction, sendTestEmailAction, type EmailTemplateActionResult } from "@/app/admin/(shell)/e-posta/actions";
import { EMAIL_TEMPLATE_DEFS, substitutePlaceholders, type EmailTemplateKey } from "@/lib/email/template-defs";
import { emailLayout } from "@/lib/email/templates/layout";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { sampleRequiredHtml } from "@/lib/email/templates/required-samples";
import { admin as copy } from "@/lib/copy/admin";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.content.email.editor;

function errorText(result: Extract<EmailTemplateActionResult, { ok: false }>): string {
  switch (result.error) {
    case "unknownPlaceholders": return c.unknown.replace("{names}", (result.names ?? []).map((name) => `{{${name}}}`).join(", "));
    case "missingPlaceholders": return c.missing.replace("{names}", (result.names ?? []).map((name) => `{{${name}}}`).join(", "));
    case "send": return c.sendFailed;
    case "invalidAddress": return c.invalidAddress;
    default: return c.invalid;
  }
}

/**
 * The live preview, built like renderTemplate with sample values: the
 * sanitized body plus the block the mailer always appends (order legal block,
 * newsletter unsubscribe), so the operator sees what a customer receives.
 */
export function buildEmailPreview(templateKey: EmailTemplateKey, subject: string, body: string) {
  const sample = EMAIL_TEMPLATE_DEFS[templateKey].sample;
  const rendered = sanitizeEmailHtml(substitutePlaceholders(templateKey, body, sample, "html"));
  const required = sampleRequiredHtml(templateKey, sample);
  return {
    subject: substitutePlaceholders(templateKey, subject, sample, "text"),
    html: emailLayout(rendered + (typeof required === "function" ? required(rendered) : required)),
  };
}

export function EmailTemplateEditor({ templateKey, initialSubject, initialBody, overridden }: { templateKey: EmailTemplateKey; initialSubject: string; initialBody: string; overridden: boolean }) {
  const router = useRouter();
  const def = EMAIL_TEMPLATE_DEFS[templateKey];
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [testTo, setTestTo] = useState("");
  const preview = useMemo(() => buildEmailPreview(templateKey, subject, body), [templateKey, subject, body]);
  const run = (task: () => Promise<EmailTemplateActionResult>, okText: string) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        setMessage(result.ok ? { ok: true, text: okText } : { ok: false, text: errorText(result) });
        if (result.ok) router.refresh();
      } catch {
        setMessage({ ok: false, text: copy.common.error });
      }
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]" data-email-editor={templateKey}>
      <form className="flex flex-col gap-4 rounded-card border border-light-2 bg-white p-5" onSubmit={(event) => { event.preventDefault(); run(() => saveEmailTemplateAction({ key: templateKey, subject, bodyHtml: body }), c.saved); }}>
        <div>
          <h2 className="text-sm font-medium">{c.placeholders}</h2>
          <p className="mt-1 text-xs text-mid-2">{c.placeholderHint}</p>
          <ul className="mt-2 flex flex-wrap gap-2" data-email-placeholders>
            {def.placeholders.map((placeholder) => (
              <li key={placeholder.name} className="rounded-btn bg-light-3 px-2 py-1 text-xs" title={placeholder.description}>
                <code>{`{{${placeholder.name}}}`}</code>{placeholder.html ? " (HTML)" : ""}
              </li>
            ))}
          </ul>
        </div>
        <UiInput label={c.subject} name="subject" required maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} data-email-subject />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.body}
          <textarea value={body} rows={16} maxLength={60_000} required onChange={(event) => setBody(event.target.value)} className="w-full resize-y rounded-input border border-light-1 bg-white p-4 font-mono text-sm outline-none focus:border-brand" data-email-body />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <UiInput label={c.testTo} name="testTo" type="email" maxLength={200} value={testTo} onChange={(event) => setTestTo(event.target.value)} className="min-w-[16rem]" data-email-test-to />
          <UiButton type="button" variant="outline" disabled={pending || !testTo} onClick={() => run(() => sendTestEmailAction({ key: templateKey, subject, bodyHtml: body, to: testTo }), c.sent)} data-email-send-test>{c.sendTest}</UiButton>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <UiButton type="submit" variant="primary" disabled={pending} data-email-save>{c.save}</UiButton>
          {overridden ? (
            <button type="button" className="rounded-btn border border-light-1 px-4 py-2 text-sm" disabled={pending} data-email-reset onClick={() => { if (window.confirm(c.confirmReset)) run(() => resetEmailTemplateAction({ key: templateKey }), c.resetDone); }}>{c.reset}</button>
          ) : null}
          {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-email-message>{message.text}</p> : null}
        </div>
      </form>
      <section className="rounded-card border border-light-2 bg-white p-5">
        <h2 className="text-base font-medium">{c.preview}</h2>
        <p className="mt-2 text-sm" data-email-preview-subject>{preview.subject}</p>
        <iframe title={c.preview} srcDoc={preview.html} sandbox="" className="mt-3 h-[32rem] w-full rounded-card border border-light-2 bg-white" data-email-preview />
      </section>
    </div>
  );
}
