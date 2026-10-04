"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteMediaAction, moveMediaAction, updateMediaAction, uploadProductMediaAction, type CatalogActionResult } from "@/app/admin/(shell)/izdelki/actions";
import { MEDIA_KINDS } from "@/lib/admin/catalog";
import { admin as copy } from "@/lib/copy/admin";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiFormField, UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.catalog.editor.media;
const selectClass = "min-h-[2.75rem] rounded-input border border-light-1 bg-white px-3 text-sm outline-none focus:border-brand";
const smallButton = "rounded-btn border border-light-1 px-3 py-1.5 text-xs";
/** Files one upload takes; the server refuses more in one request too (izdelki/actions.ts). */
const MAX_FILES = 4;

export interface MediaRow { id: string; url: string; alt: string; kind: "GALLERY" | "CARD" | "HERO"; sortOrder: number }

export function MediaManager({ productId, media }: { productId: string; media: MediaRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (task: () => Promise<CatalogActionResult>, okText: string) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        setMessage(result.ok ? { ok: true, text: okText } : { ok: false, text: result.error === "media" ? c.invalid : copy.common.error });
        router.refresh();
      } catch {
        setMessage({ ok: false, text: copy.common.error });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4" data-media-manager>
      <form
        className="grid gap-3 rounded-card border border-light-2 p-4 md:grid-cols-[1fr_12rem_1fr_auto] md:items-end"
        data-media-upload
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          // One file per request, as the media library does: four large photos in one request met the
          // 10 MB Server Action limit and failed with a bare error (QA 2026-10-03 T5-05).
          const picked = data.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
          const files = picked.slice(0, MAX_FILES);
          // Every file's outcome is reported: a refused one no longer hides the ones already stored,
          // and the selection is cleared once any landed, so a retry cannot store them twice (QA 2026-10-03 V5-02/V5-03).
          setMessage(null);
          startTransition(async () => {
            const refused: string[] = [];
            let stored = 0;
            try {
              for (const file of files) {
                const one = new FormData();
                one.set("productId", productId);
                one.set("kind", String(data.get("kind") ?? ""));
                one.set("alt", String(data.get("alt") ?? ""));
                one.append("files", file, file.name);
                const result = await uploadProductMediaAction(one);
                if (result.ok) stored += 1;
                else refused.push(file.name);
              }
            } catch {
              refused.push(...files.slice(stored + refused.length).map((file) => file.name));
            }
            // only the files are cleared: the kind and the alt stay for a retry of the refused ones (QA 2026-10-03 W2-01)
            if (stored > 0) { const input = form.elements.namedItem("files"); if (input instanceof HTMLInputElement) input.value = ""; }
            const parts = [
              refused.length === 0
                ? (stored === 1 ? c.uploaded : c.uploadedMany.replace("{count}", String(stored)))
                : stored === 0
                  ? c.refusedAll.replace("{files}", refused.join(", "))
                  : c.uploadedPartly.replace("{ok}", String(stored)).replace("{total}", String(files.length)).replace("{files}", refused.join(", ")),
              picked.length > MAX_FILES ? c.tooMany.replace("{max}", String(MAX_FILES)) : "",
            ].filter(Boolean);
            setMessage({ ok: refused.length === 0 && picked.length <= MAX_FILES, text: parts.join(" ") });
            if (stored > 0) router.refresh();
          });
        }}
      >
        <UiFormField label={c.file} htmlFor="media-files">
          <input id="media-files" name="files" type="file" accept="image/jpeg,image/png,image/webp" multiple required className="w-full min-w-0 rounded-input border border-light-1 p-2 text-sm file:mr-3 file:rounded-btn file:border-0 file:bg-light-3 file:px-3 file:py-1.5" />
        </UiFormField>
        <UiFormField label={c.kind} htmlFor="media-kind">
          <select id="media-kind" name="kind" defaultValue="GALLERY" className={selectClass}>
            {MEDIA_KINDS.map((kind) => <option key={kind} value={kind}>{c.kinds[kind]}</option>)}
          </select>
        </UiFormField>
        <UiInput label={c.alt} name="alt" maxLength={200} />
        <UiButton type="submit" variant="primary" disabled={pending} data-media-submit>{c.upload}</UiButton>
      </form>
      {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-media-message>{message.text}</p> : null}

      {media.length === 0 ? <p className="text-sm text-mid-2">{c.empty}</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {media.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-card border border-light-2 p-3" data-media-item={item.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.alt} className="h-24 w-24 shrink-0 rounded-card bg-light-3 object-cover" />
              <form
                className="flex min-w-0 flex-1 flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  run(() => updateMediaAction({ mediaId: item.id, alt: String(data.get("alt") ?? ""), kind: String(data.get("kind") ?? item.kind) }), copy.common.done);
                }}
              >
                <div className="flex flex-wrap gap-2">
                  <select name="kind" defaultValue={item.kind} aria-label={c.kind} className={selectClass}>
                    {MEDIA_KINDS.map((kind) => <option key={kind} value={kind}>{c.kinds[kind]}</option>)}
                  </select>
                  <span className="self-center text-xs text-mid-2">#{item.sortOrder}</span>
                </div>
                <input name="alt" defaultValue={item.alt} aria-label={c.alt} maxLength={200} className="min-h-[2.75rem] w-full rounded-input border border-light-1 px-3 text-sm outline-none focus:border-brand" />
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className={smallButton} disabled={pending}>{c.saveAlt}</button>
                  <button type="button" className={smallButton} disabled={pending} onClick={() => run(() => moveMediaAction({ mediaId: item.id, direction: "up" }), copy.common.done)}>{c.moveUp}</button>
                  <button type="button" className={smallButton} disabled={pending} onClick={() => run(() => moveMediaAction({ mediaId: item.id, direction: "down" }), copy.common.done)}>{c.moveDown}</button>
                  <button
                    type="button"
                    className="rounded-btn border border-error px-3 py-1.5 text-xs text-error"
                    disabled={pending}
                    onClick={() => {
                      // Irreversible: the file is removed from disk (QA T6-12).
                      if (!window.confirm(c.confirmDelete)) return;
                      run(() => deleteMediaAction({ mediaId: item.id }), c.deleted);
                    }}
                    data-media-delete
                  >
                    {c.delete}
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
