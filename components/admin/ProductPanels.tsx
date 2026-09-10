"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createProductAction, saveLowStockAction, sendRestockAlertsAction, toggleCollectionProductAction,
} from "@/app/admin/(shell)/izdelki/actions";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";

/** Small client panels of the catalog screens: create, low-stock threshold, restock alerts, collection membership. */

export function ProductCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const c = copy.catalog.products;
  return (
    <form
      className="grid gap-3 rounded-card border border-light-2 bg-white p-4 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end"
      data-product-create
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            const result = await createProductAction({
              title: String(data.get("title") ?? ""), slug: String(data.get("slug") ?? ""), sku: String(data.get("sku") ?? ""),
              priceCents: Number.parseInt(String(data.get("priceCents") ?? "0"), 10) || 0,
            });
            if (result.ok && result.id) router.push(`/admin/izdelki/${result.id}`);
            else setError(!result.ok && result.error === "slugTaken" ? copy.catalog.editor.slugTaken : !result.ok && result.error === "skuTaken" ? copy.catalog.editor.variants.skuTaken : copy.catalog.editor.invalid);
          } catch {
            setError(copy.common.error);
          }
        });
      }}
    >
      <h2 className="text-base font-medium md:col-span-5">{c.newTitle}</h2>
      <UiInput label={c.newTitleLabel} name="title" required maxLength={200} />
      <UiInput label={c.newSlugLabel} name="slug" required maxLength={80} />
      <UiInput label={c.newSkuLabel} name="sku" required maxLength={40} />
      <UiInput label={c.newPriceLabel} name="priceCents" type="number" min={0} step={1} required />
      <UiButton type="submit" variant="primary" disabled={pending}>{c.create}</UiButton>
      {error ? <p role="alert" className="text-sm text-error md:col-span-5">{error}</p> : null}
    </form>
  );
}

export function LowStockForm({ threshold }: { threshold: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const c = copy.catalog.products;
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-card border border-light-2 bg-white p-4"
      data-low-stock-form
      onSubmit={(event) => {
        event.preventDefault();
        const value = Number.parseInt(String(new FormData(event.currentTarget).get("lowStockThreshold") ?? ""), 10);
        startTransition(async () => {
          try {
            const result = await saveLowStockAction({ lowStockThreshold: value });
            setMessage(result.ok ? copy.common.done : copy.common.error);
            router.refresh();
          } catch {
            setMessage(copy.common.error);
          }
        });
      }}
    >
      <UiInput label={c.lowStockLabel} name="lowStockThreshold" type="number" min={0} max={1000} step={1} defaultValue={threshold} className="w-56" />
      <UiButton type="submit" variant="outline" disabled={pending}>{c.lowStockSave}</UiButton>
      {message ? <p role="status" className="text-sm text-mid-1">{message}</p> : null}
    </form>
  );
}

export function RestockPanel({ productId, counts, hasStock }: { productId: string; counts: { PENDING: number; CONFIRMED: number; notified: number; UNSUBSCRIBED: number; armable: number }; hasStock: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const c = copy.catalog.editor.restock;
  return (
    <div data-restock-panel>
      <p className="text-sm text-mid-1">{c.intro}</p>
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm sm:grid-cols-[14rem_1fr]">
        <dt className="text-mid-1">{c.pending}</dt><dd>{counts.PENDING}</dd>
        <dt className="text-mid-1">{c.confirmed}</dt><dd>{counts.CONFIRMED}</dd>
        <dt className="text-mid-1">{c.notified}</dt><dd>{counts.notified}</dd>
        <dt className="text-mid-1">{c.unsubscribed}</dt><dd>{counts.UNSUBSCRIBED}</dd>
        <dt className="text-mid-1">{c.armable}</dt><dd data-restock-armable>{counts.armable}</dd>
      </dl>
      <p className="mt-3 text-xs text-mid-2">{hasStock ? c.sendHint : c.noStock}</p>
      <div className="mt-3 flex items-center gap-3">
        <UiButton
          variant="outline"
          disabled={pending || !hasStock || counts.armable === 0}
          data-restock-send
          onClick={() => startTransition(async () => {
            try {
              const result = await sendRestockAlertsAction({ productId });
              setMessage(result.ok ? c.sent.replace("{armed}", String(result.armed ?? 0)).replace("{sent}", String(result.sent ?? 0)).replace("{failed}", String(result.failed ?? 0)) : result.error === "noStock" ? c.noStock : copy.common.error);
              router.refresh();
            } catch {
              setMessage(copy.common.error);
            }
          })}
        >
          {c.send}
        </UiButton>
        {message ? <p role="status" className="text-sm text-mid-1" data-restock-message>{message}</p> : null}
      </div>
    </div>
  );
}

export function CollectionMembership({ productId, collections }: { productId: string; collections: Array<{ id: string; title: string; slug: string; member: boolean }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const c = copy.catalog.editor.collections;
  return (
    <div data-collection-membership>
      <p className="text-sm text-mid-1">{c.hint}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {collections.map((collection) => (
          <li key={collection.id}>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={collection.member}
                disabled={pending}
                data-collection-toggle={collection.slug}
                onChange={(event) => startTransition(async () => {
                  try {
                    const result = await toggleCollectionProductAction({ productId, collectionId: collection.id, member: event.target.checked });
                    setMessage(result.ok ? c.saved : copy.common.error);
                    router.refresh();
                  } catch {
                    setMessage(copy.common.error);
                  }
                })}
                className="size-4 accent-brand"
              />
              {collection.title} <span className="text-xs text-mid-2">/{collection.slug}</span>
            </label>
          </li>
        ))}
      </ul>
      {message ? <p role="status" className="mt-2 text-sm text-mid-1">{message}</p> : null}
    </div>
  );
}
