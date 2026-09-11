"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteMediaAssetAction, updateMediaAltAction, uploadMediaAssetsAction, type MediaActionResult } from "@/app/admin/(shell)/mediji/actions";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiFormField, UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.content.media;
const smallButton = "rounded-btn border border-light-1 px-3 py-1.5 text-xs disabled:opacity-40";

export interface MediaAssetRow { id: string; url: string; alt: string; width: number; height: number; bytes: number; references: number }

export function MediaLibrary({ assets }: { assets: MediaAssetRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const run = (task: () => Promise<MediaActionResult>, okText: string) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        setMessage(result.ok ? { ok: true, text: okText } : { ok: false, text: result.error === "media" ? c.invalid : result.error === "referenced" ? c.cannotDelete : copy.common.error });
        router.refresh();
      } catch {
        setMessage({ ok: false, text: copy.common.error });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4" data-media-library>
      <form
        className="grid gap-3 rounded-card border border-light-2 bg-white p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
        data-library-upload
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          run(async () => { const result = await uploadMediaAssetsAction(data); if (result.ok) form.reset(); return result; }, c.uploaded);
        }}
      >
        <UiFormField label={c.file} htmlFor="library-files">
          <input id="library-files" name="files" type="file" accept="image/jpeg,image/png,image/webp" multiple required className="w-full min-w-0 rounded-input border border-light-1 p-2 text-sm file:mr-3 file:rounded-btn file:border-0 file:bg-light-3 file:px-3 file:py-1.5" />
        </UiFormField>
        <UiInput label={c.alt} name="alt" maxLength={200} />
        <UiButton type="submit" variant="primary" disabled={pending} data-library-submit>{c.upload}</UiButton>
      </form>
      {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-library-message>{message.text}</p> : null}
      {assets.length === 0 ? <p className="text-sm text-mid-2">{c.empty}</p> : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <li key={asset.id} className="flex flex-col gap-2 rounded-card border border-light-2 bg-white p-3" data-library-item={asset.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.url} alt={asset.alt} className="aspect-[4/3] w-full rounded-card bg-light-3 object-cover" />
              <p className="break-all text-xs text-mid-1" data-library-url>{asset.url}</p>
              <p className="text-xs text-mid-2">{asset.width} × {asset.height} · {Math.round(asset.bytes / 1024)} kB · {c.references.replace("{count}", String(asset.references))}</p>
              <form
                className="flex gap-2"
                onSubmit={(event) => { event.preventDefault(); run(() => updateMediaAltAction({ assetId: asset.id, alt: String(new FormData(event.currentTarget).get("alt") ?? "") }), copy.common.done); }}
              >
                <input name="alt" defaultValue={asset.alt} aria-label={c.alt} maxLength={200} className="min-h-[2.5rem] w-full rounded-input border border-light-1 px-3 text-sm outline-none focus:border-brand" />
                <button type="submit" className={smallButton} disabled={pending}>{c.saveAlt}</button>
              </form>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={smallButton} onClick={async () => { try { await navigator.clipboard.writeText(asset.url); setCopied(asset.id); setTimeout(() => setCopied(null), 2000); } catch { setCopied(null); } }}>{copied === asset.id ? c.copied : c.copy}</button>
                <button type="button" className="rounded-btn border border-error px-3 py-1.5 text-xs text-error disabled:opacity-40" disabled={pending || asset.references > 0} title={asset.references > 0 ? c.cannotDelete : undefined} onClick={() => run(() => deleteMediaAssetAction({ assetId: asset.id }), copy.common.done)} data-library-delete>{c.delete}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
