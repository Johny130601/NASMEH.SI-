"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createBundleAction, saveBundleAction } from "@/app/admin/(shell)/paketi/actions";
import { admin as copy } from "@/lib/copy";
import { bundleSavings, formatEUR } from "@/lib/pricing";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiFormField, UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.catalog.bundles;
const selectClass = "min-h-[2.75rem] w-full rounded-input border border-light-1 bg-white px-3 text-sm outline-none focus:border-brand";
const smallButton = "rounded-btn border border-light-1 px-3 py-1.5 text-xs";

export function BundleCreateForm({ products }: { products: Array<{ id: string; title: string; slug: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-card border border-light-2 bg-white p-4"
      data-bundle-create
      onSubmit={(event) => {
        event.preventDefault();
        const productId = String(new FormData(event.currentTarget).get("productId") ?? "");
        setError(null);
        startTransition(async () => {
          try {
            const result = await createBundleAction({ productId });
            if (result.ok && result.id) router.push(`/admin/paketi/${result.id}`);
            else setError(c.editor.invalid);
          } catch {
            setError(copy.common.error);
          }
        });
      }}
    >
      <UiFormField label={c.chooseProduct} htmlFor="bundle-product">
        <select id="bundle-product" name="productId" required defaultValue="" className={selectClass}>
          <option value="" disabled>—</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
        </select>
      </UiFormField>
      <UiButton type="submit" variant="primary" disabled={pending || products.length === 0}>{c.create}</UiButton>
      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
    </form>
  );
}

export interface BundleEditorProps {
  productId: string;
  priceCents: number;
  active: boolean;
  items: Array<{ variantId: string; quantity: number }>;
  options: Array<{ id: string; sku: string; title: string; priceCents: number; productTitle: string }>;
}

export function BundleEditor({ productId, priceCents: initialPrice, active: initialActive, items: initialItems, options }: BundleEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [priceCents, setPriceCents] = useState(initialPrice);
  const [active, setActive] = useState(initialActive);
  const [items, setItems] = useState(initialItems.length ? initialItems : [{ variantId: "", quantity: 1 }]);
  const savings = useMemo(() => {
    const prices = items.flatMap((item) => { const option = options.find((candidate) => candidate.id === item.variantId); return option ? [option.priceCents * item.quantity] : []; });
    return prices.length && Number.isSafeInteger(priceCents) ? bundleSavings(prices, Math.max(0, priceCents)) : null;
  }, [items, options, priceCents]);

  return (
    <form
      className="rounded-card border border-light-2 bg-white p-5"
      data-bundle-editor
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          try {
            const result = await saveBundleAction({ productId, priceCents, active, items: items.filter((item) => item.variantId) });
            setMessage(result.ok ? { ok: true, text: c.editor.saved } : { ok: false, text: c.editor.invalid });
            router.refresh();
          } catch {
            setMessage({ ok: false, text: copy.common.error });
          }
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <UiInput label={c.editor.price} name="priceCents" type="number" min={0} step={1} value={priceCents} onChange={(event) => setPriceCents(Number.parseInt(event.target.value, 10) || 0)} required />
        <label className="flex items-center gap-3 self-end text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="size-4 accent-brand" data-bundle-active />{c.editor.active}</label>
      </div>
      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="text-sm font-medium">{c.editor.components}</legend>
        {items.map((item, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[1fr_8rem_auto]">
            <select aria-label={`${c.editor.variant} ${index + 1}`} value={item.variantId} onChange={(event) => setItems(items.map((entry, position) => (position === index ? { ...entry, variantId: event.target.value } : entry)))} className={selectClass} data-bundle-variant={index}>
              <option value="">—</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.productTitle} · {option.sku} · {formatEUR(option.priceCents)}</option>)}
            </select>
            <input aria-label={`${c.editor.quantity} ${index + 1}`} type="number" min={1} max={10} value={item.quantity} onChange={(event) => setItems(items.map((entry, position) => (position === index ? { ...entry, quantity: Number.parseInt(event.target.value, 10) || 1 } : entry)))} className="min-h-[2.75rem] rounded-input border border-light-1 px-3 text-sm" />
            <button type="button" className={smallButton} onClick={() => setItems(items.filter((_, position) => position !== index))}>{c.editor.remove}</button>
          </div>
        ))}
        {items.length < 10 ? <button type="button" className={`${smallButton} self-start`} onClick={() => setItems([...items, { variantId: "", quantity: 1 }])}>{c.editor.add}</button> : null}
      </fieldset>
      {savings ? (
        <p className="mt-4 text-sm" data-bundle-savings>
          {c.editor.value.replace("{value}", formatEUR(savings.valueCents))} · {c.editor.savings.replace("{savings}", formatEUR(savings.savingsCents)).replace("{percent}", String(savings.savingsPercent))}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-mid-2">{c.editor.omnibusNote}</p>
      <div className="mt-4 flex items-center gap-3">
        <UiButton type="submit" variant="primary" disabled={pending} data-bundle-save>{c.editor.save}</UiButton>
        {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-bundle-message>{message.text}</p> : null}
      </div>
    </form>
  );
}
