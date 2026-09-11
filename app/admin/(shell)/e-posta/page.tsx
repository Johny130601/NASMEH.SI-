import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { listEmailTemplates } from "@/lib/admin/cms";
import { admin as copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.content.email.title, robots: { index: false, follow: false } };

/** /admin/e-posta — the editable transactional mails (§14.10). */
export default async function AdminEmailTemplatesPage() {
  await requirePagePermission("content:manage");
  const templates = await listEmailTemplates();
  const c = copy.content.email;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-email>
      <h1 className="text-[2rem]">{c.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-mid-1">{c.intro}</p>
      <div className="mt-4 overflow-x-auto rounded-card border border-light-2 bg-white">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-left text-xs text-mid-2">
            <tr><th className="px-4 py-3">{c.columns.template}</th><th className="px-4 py-3">{c.columns.description}</th><th className="px-4 py-3">{c.columns.state}</th><th className="px-4 py-3">{c.columns.updated}</th></tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.key} className="border-t border-light-2" data-email-row={template.key}>
                <td className="px-4 py-3 font-medium"><Link href={`/admin/e-posta/${template.key}`} className="underline underline-offset-4">{template.label}</Link></td>
                <td className="px-4 py-3 text-mid-1">{template.description}</td>
                <td className="px-4 py-3" data-email-state={template.overridden ? "override" : "default"}>{template.overridden ? c.states.override : c.states.default}</td>
                <td className="px-4 py-3 text-mid-1">{template.updatedAt ? template.updatedAt.toLocaleDateString("sl-SI") : copy.common.none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
