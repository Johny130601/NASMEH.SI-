"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addCollectionProductAction, createCollectionAction, deleteCollectionAction, moveCollectionProductAction,
  removeCollectionBannerAction, removeCollectionProductAction, saveCollectionAction, uploadCollectionBannerAction, type CollectionActionResult,
} from "@/app/admin/(shell)/kolekcije/actions";
import type { CollectionInput } from "@/lib/admin/catalog";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiFormField, UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.catalog.collections;
const smallButton = "rounded-btn border border-light-1 px-3 py-1.5 text-xs";
const selectClass = "min-h-[2.75rem] rounded-input border border-light-1 bg-white px-3 text-sm outline-none focus:border-brand";

export function CollectionCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 rounded-card border border-light-2 bg-white p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
      data-collection-create
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            const result = await createCollectionAction({ title: String(data.get("title") ?? ""), slug: String(data.get("slug") ?? "") });
            if (result.ok && result.id) router.push(`/admin/kolekcije/${result.id}`);
            else setError(!result.ok && result.error === "slugTaken" ? c.editor.slugTaken : c.editor.invalid);
          } catch {
            setError(copy.common.error);
          }
        });
      }}
    >
      <h2 className="text-base font-medium md:col-span-3">{c.newTitle}</h2>
      <UiInput label={c.editor.fields.title} name="title" required maxLength={120} />
      <UiInput label={c.editor.fields.slug} name="slug" required maxLength={80} />
      <UiButton type="submit" variant="primary" disabled={pending}>{c.create}</UiButton>
      {error ? <p role="alert" className="text-sm text-error md:col-span-3">{error}</p> : null}
    </form>
  );
}

export interface CollectionEditorProps {
  collectionId: string;
  fields: CollectionInput;
  bannerImage: string | null;
  bannerImageMobile: string | null;
  products: Array<{ productId: string; title: string; slug: string; status: string }>;
  candidates: Array<{ id: string; title: string; slug: string }>;
}

export function CollectionEditor({ collectionId, fields: initial, bannerImage, bannerImageMobile, products, candidates }: CollectionEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [fields, setFields] = useState(initial);
  const run = (task: () => Promise<CollectionActionResult>, okText: string = copy.common.done) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        setMessage(result.ok ? { ok: true, text: okText } : { ok: false, text: result.error === "slugTaken" ? c.editor.slugTaken : result.error === "media" ? copy.catalog.editor.media.invalid : c.editor.invalid });
        router.refresh();
      } catch {
        setMessage({ ok: false, text: copy.common.error });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4" data-collection-editor>
      {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-collection-message>{message.text}</p> : null}
      <form
        className="rounded-card border border-light-2 bg-white p-5"
        onSubmit={(event) => { event.preventDefault(); run(() => saveCollectionAction({ collectionId, fields }), c.editor.saved); }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.editor.fields.title} name="title" value={fields.title} required maxLength={120} onChange={(event) => setFields({ ...fields, title: event.target.value })} />
          <UiInput label={c.editor.fields.slug} name="slug" value={fields.slug} required maxLength={80} onChange={(event) => setFields({ ...fields, slug: event.target.value })} />
          <UiInput label={c.editor.fields.seoTitle} name="seoTitle" value={fields.seoTitle ?? ""} maxLength={200} onChange={(event) => setFields({ ...fields, seoTitle: event.target.value })} />
          <UiInput label={c.editor.fields.seoDescription} name="seoDescription" value={fields.seoDescription ?? ""} maxLength={320} onChange={(event) => setFields({ ...fields, seoDescription: event.target.value })} />
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={fields.noindex} onChange={(event) => setFields({ ...fields, noindex: event.target.checked })} className="size-4 accent-brand" data-collection-noindex />{c.editor.fields.noindex}</label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={fields.hideBannerText} onChange={(event) => setFields({ ...fields, hideBannerText: event.target.checked })} className="size-4 accent-brand" />{c.editor.fields.hideBannerText}</label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <UiButton type="submit" variant="primary" disabled={pending} data-collection-save>{c.editor.save}</UiButton>
          <button type="button" className="rounded-btn border border-error px-4 py-2 text-sm text-error" disabled={pending} onClick={() => { if (window.confirm(c.editor.confirmDelete)) startTransition(async () => { const result = await deleteCollectionAction({ collectionId }); if (result.ok) router.push("/admin/kolekcije"); }); }}>{c.editor.delete}</button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {([["desktop", c.editor.banner, bannerImage], ["mobile", c.editor.bannerMobile, bannerImageMobile]] as const).map(([target, label, url]) => (
          <form
            key={target}
            className="rounded-card border border-light-2 bg-white p-5"
            data-banner-form={target}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              data.set("collectionId", collectionId);
              data.set("target", target);
              run(() => uploadCollectionBannerAction(data), copy.catalog.editor.media.uploaded);
            }}
          >
            <h2 className="text-base font-medium">{label}</h2>
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={label} className="mt-3 max-h-40 w-full rounded-card bg-light-3 object-cover" data-banner-preview={target} />
            ) : null}
            <UiFormField label={copy.catalog.editor.media.file} htmlFor={`banner-${target}`}>
              <input id={`banner-${target}`} name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="w-full min-w-0 rounded-input border border-light-1 p-2 text-sm file:mr-3 file:rounded-btn file:border-0 file:bg-light-3 file:px-3 file:py-1.5" />
            </UiFormField>
            <div className="mt-3 flex gap-2">
              <UiButton type="submit" variant="outline" disabled={pending}>{c.editor.uploadBanner}</UiButton>
              {url ? <button type="button" className={smallButton} disabled={pending} onClick={() => run(() => removeCollectionBannerAction({ collectionId, target }))}>{c.editor.removeBanner}</button> : null}
            </div>
          </form>
        ))}
      </div>

      <section className="rounded-card border border-light-2 bg-white p-5" data-collection-products>
        <h2 className="text-base font-medium">{c.editor.products}</h2>
        {products.length === 0 ? <p className="mt-3 text-sm text-mid-2">{c.editor.empty}</p> : (
          <ol className="mt-3 flex flex-col gap-2">
            {products.map((product, index) => (
              <li key={product.productId} className="flex flex-wrap items-center gap-2 border-t border-light-2 pt-2 first:border-t-0 first:pt-0 text-sm" data-collection-product={product.slug}>
                <span className="w-6 text-mid-2">{index + 1}.</span>
                <span className="flex-1">{product.title} <span className="text-xs text-mid-2">/{product.slug}</span></span>
                <button type="button" className={smallButton} disabled={pending || index === 0} onClick={() => run(() => moveCollectionProductAction({ collectionId, productId: product.productId, direction: "up" }))}>{c.editor.up}</button>
                <button type="button" className={smallButton} disabled={pending || index === products.length - 1} onClick={() => run(() => moveCollectionProductAction({ collectionId, productId: product.productId, direction: "down" }))}>{c.editor.down}</button>
                <button type="button" className="rounded-btn border border-error px-3 py-1.5 text-xs text-error" disabled={pending} onClick={() => run(() => removeCollectionProductAction({ collectionId, productId: product.productId }))}>{c.editor.remove}</button>
              </li>
            ))}
          </ol>
        )}
        {candidates.length ? (
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(event) => { event.preventDefault(); const productId = String(new FormData(event.currentTarget).get("productId") ?? ""); if (productId) run(() => addCollectionProductAction({ collectionId, productId })); }}
          >
            <UiFormField label={c.editor.addProduct} htmlFor="collection-add">
              <select id="collection-add" name="productId" className={selectClass} defaultValue="">
                <option value="" disabled>—</option>
                {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
              </select>
            </UiFormField>
            <UiButton type="submit" variant="outline" disabled={pending}>{c.editor.add}</UiButton>
          </form>
        ) : null}
      </section>
    </div>
  );
}
