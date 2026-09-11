import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/admin/access";
import { loadEmailTemplate } from "@/lib/admin/cms";
import { isEmailTemplateKey } from "@/lib/email/template-defs";
import { admin as copy } from "@/lib/copy";
import { EmailTemplateEditor } from "@/components/admin/EmailTemplateEditor";

export const metadata: Metadata = { title: copy.content.email.title, robots: { index: false, follow: false } };

/** /admin/e-posta/[key] — subject and body override with live preview and test send (§14.10). */
export default async function AdminEmailTemplatePage({ params }: { params: Promise<{ key: string }> }) {
  await requirePagePermission("content:manage");
  const { key } = await params;
  if (!isEmailTemplateKey(key)) notFound();
  const template = await loadEmailTemplate(key);
  const c = copy.content.email;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-email-template={key}>
      <Link href="/admin/e-posta" className="text-sm text-mid-1 underline underline-offset-4">{c.editor.back}</Link>
      <h1 className="mt-3 text-[2rem]">{template.def.label}</h1>
      <p className="text-sm text-mid-1">{template.def.description} · {template.overridden ? c.states.override : c.states.default}</p>
      <div className="mt-6">
        <EmailTemplateEditor templateKey={key} initialSubject={template.subject} initialBody={template.bodyHtml} overridden={template.overridden} />
      </div>
    </section>
  );
}
