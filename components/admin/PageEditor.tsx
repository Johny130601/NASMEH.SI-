"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPageAction, deletePageAction, savePageAction, type PageActionResult } from "@/app/admin/(shell)/strani/actions";
import { CONTENT_TEMPLATES, SHADOWED_SLUGS, type ContentPageInput } from "@/lib/admin/cms-schemas";
import { admin as copy } from "@/lib/copy/admin";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiFormField, UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.content.pages;
const selectClass = "min-h-[3.25rem] w-full rounded-input border border-light-1 bg-white px-4 text-base outline-none focus:border-brand";

function errorText(result: Extract<PageActionResult, { ok: false }>, action: "save" | "delete" = "save"): string {
  switch (result.error) {
    case "slugTaken": return c.editor.slugTaken;
    case "slugReserved": return c.editor.slugReserved;
    case "protected": return action === "delete" ? c.editor.deleteProtected : c.editor.slugLocked;
    case "not_found": return copy.common.error;
    default: return c.editor.invalid;
  }
}

export function PageCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 rounded-card border border-light-2 bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
      data-page-create
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            const result = await createPageAction({ title: String(data.get("title") ?? ""), slug: String(data.get("slug") ?? ""), template: String(data.get("template") ?? "DEFAULT") });
            if (result.ok && result.id) router.push(`/admin/strani/${result.id}`);
            else if (!result.ok) setError(errorText(result));
          } catch {
            setError(copy.common.error);
          }
        });
      }}
    >
      <h2 className="text-base font-medium md:col-span-4">{c.newTitle}</h2>
      <UiInput label={c.editor.fields.title} name="title" required maxLength={160} />
      <UiInput label={c.editor.fields.slug} name="slug" required maxLength={80} />
      <UiFormField label={c.editor.fields.template} htmlFor="page-new-template">
        <select id="page-new-template" name="template" defaultValue="DEFAULT" className={selectClass}>
          {CONTENT_TEMPLATES.map((template) => <option key={template} value={template}>{c.templates[template]}</option>)}
        </select>
      </UiFormField>
      <UiButton type="submit" variant="primary" disabled={pending}>{c.create}</UiButton>
      {error ? <p role="alert" className="text-sm text-error md:col-span-4" data-page-create-error>{error}</p> : null}
    </form>
  );
}

/** `locked`: a legal page (static-route, fixed or `legal.links` slug) — slug read-only, no delete; the actions enforce the same rule. */
export function PageEditor({ pageId, initial, locked = false }: { pageId: string; initial: ContentPageInput; locked?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [page, setPage] = useState(initial);
  const set = <K extends keyof ContentPageInput>(key: K, value: ContentPageInput[K]) => setPage({ ...page, [key]: value });
  const templateLocked = locked && initial.template === "LEGAL";
  const slugHint = [SHADOWED_SLUGS.has(page.slug) ? c.editor.shadowedHint : null, locked ? c.editor.lockedHint : null].filter(Boolean).join(" ") || undefined;
  return (
    <form
      className="flex flex-col gap-4 rounded-card border border-light-2 bg-white p-5"
      data-page-editor
      data-page-locked={locked || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (locked && initial.published && !page.published && !window.confirm(c.editor.confirmUnpublishLegal)) {
          // dismissed: the page stays published, and so does the form (QA 2026-10-03 w2)
          setPage((current) => ({ ...current, published: true }));
          return;
        }
        setMessage(null);
        startTransition(async () => {
          try {
            const result = await savePageAction({ pageId, page });
            if (result.ok) {
              // The server did not store the review mark for changed text; untick it so a later save cannot re-mark it unseen.
              if (result.reviewCleared) setPage((current) => ({ ...current, reviewed: false }));
              setMessage({ ok: true, text: result.reviewCleared ? c.editor.savedReviewCleared : c.editor.saved });
              router.refresh();
            } else setMessage({ ok: false, text: errorText(result) });
          } catch {
            setMessage({ ok: false, text: copy.common.error });
          }
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <UiInput label={c.editor.fields.title} name="title" required maxLength={160} value={page.title} onChange={(event) => set("title", event.target.value)} />
        <UiInput label={c.editor.fields.slug} name="slug" required maxLength={80} value={page.slug} readOnly={locked} onChange={(event) => set("slug", event.target.value)} hint={slugHint} />
        <UiFormField label={c.editor.fields.template} htmlFor="page-template" hint={templateLocked ? c.editor.templateLockedHint : undefined}>
          <select id="page-template" value={page.template} disabled={templateLocked} onChange={(event) => set("template", event.target.value as ContentPageInput["template"])} className={`${selectClass} disabled:bg-light-3 disabled:text-mid-1`}>
            {CONTENT_TEMPLATES.map((template) => <option key={template} value={template}>{c.templates[template]}</option>)}
          </select>
        </UiFormField>
        <div className="flex flex-col justify-center gap-2">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={page.published} onChange={(event) => set("published", event.target.checked)} className="size-4 accent-brand" data-page-published />
            {c.editor.fields.published}
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={page.reviewed} onChange={(event) => set("reviewed", event.target.checked)} className="size-4 accent-brand" data-page-reviewed />
            {c.editor.fields.reviewed}
          </label>
          <span className="text-xs text-mid-2">{c.editor.reviewedHint}</span>
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {c.editor.fields.body}
        <textarea value={page.body} rows={18} maxLength={200_000} onChange={(event) => set("body", event.target.value)} className="w-full resize-y rounded-input border border-light-1 bg-white p-4 font-mono text-sm outline-none focus:border-brand" data-page-body />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <UiInput label={c.editor.fields.seoTitle} name="seoTitle" maxLength={200} value={page.seoTitle ?? ""} onChange={(event) => set("seoTitle", event.target.value)} />
        <UiInput label={c.editor.fields.seoDescription} name="seoDescription" maxLength={320} value={page.seoDescription ?? ""} onChange={(event) => set("seoDescription", event.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <UiButton type="submit" variant="primary" disabled={pending} data-page-save>{c.editor.save}</UiButton>
        {locked ? null : <button
          type="button"
          className="rounded-btn border border-error px-4 py-2 text-sm text-error"
          disabled={pending}
          data-page-delete
          onClick={() => {
            if (!window.confirm(c.editor.confirmDelete)) return;
            startTransition(async () => {
              try {
                const result = await deletePageAction({ pageId });
                if (result.ok) router.push("/admin/strani");
                else setMessage({ ok: false, text: errorText(result, "delete") });
              } catch {
                setMessage({ ok: false, text: copy.common.error });
              }
            });
          }}
        >
          {c.editor.delete}
        </button>}
        {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-page-message>{message.text}</p> : null}
      </div>
    </form>
  );
}
