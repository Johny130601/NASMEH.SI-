"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteVariantAction, saveVariantAction, type CatalogActionResult } from "@/app/admin/(shell)/izdelki/actions";
import type { VariantInput } from "@/lib/admin/catalog";
import { admin as copy } from "@/lib/copy/admin";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.catalog.editor.variants;

export interface VariantRow extends VariantInput {
  id: string | null;
  orderItems: number;
  bundleItems: number;
  /** PriceHistory rows; more than the initial one is a price change, the Omnibus record. */
  priceRows: number;
}

/** Sold or repriced: its history is the Omnibus record, so it cannot be deleted (QA 2026-10-03 T5-09, V5-04). */
function hasHistory(variant: VariantRow): boolean {
  return variant.orderItems > 0 || variant.priceRows > 1;
}

const EMPTY: VariantInput = {
  title: "", sku: "", priceCents: 0, compareAtPriceCents: null, costCents: null, barcode: null, weightGrams: null,
  stock: 0, maxCartQuantity: 5, allowBackorder: false, backorderNote: null,
};

function readForm(data: FormData): VariantInput {
  const int = (name: string) => { const value = String(data.get(name) ?? "").trim(); return value === "" ? null : Number.parseInt(value, 10); };
  return {
    title: String(data.get("title") ?? ""),
    sku: String(data.get("sku") ?? ""),
    priceCents: int("priceCents") ?? 0,
    compareAtPriceCents: int("compareAtPriceCents"),
    costCents: int("costCents"),
    barcode: String(data.get("barcode") ?? ""),
    weightGrams: int("weightGrams"),
    stock: int("stock") ?? 0,
    maxCartQuantity: int("maxCartQuantity") ?? 5,
    allowBackorder: data.get("allowBackorder") === "on",
    backorderNote: String(data.get("backorderNote") ?? ""),
  };
}

type DoneHandler = (result: CatalogActionResult, action?: "save" | "delete") => void;

function VariantForm({ productId, variant, onDone, deletable, priceLocked }: { productId: string; variant: VariantRow; onDone: DoneHandler; deletable: boolean; priceLocked: boolean }) {
  const [pending, startTransition] = useTransition();
  // The stock figure the operator saw before touching the field. Every other save on the page
  // refreshes `variant.stock`; an untouched field follows it, a touched one keeps the figure it
  // was edited from, so a sale in between is caught instead of overwritten (QA 2026-10-03 T5-01, V5-01).
  const [stock, setStock] = useState(String(variant.stock));
  const stockTouched = useRef(false);
  const openedStock = useRef(variant.stock);
  useEffect(() => {
    if (stockTouched.current) return;
    openedStock.current = variant.stock;
    setStock(String(variant.stock));
  }, [variant.stock]);
  const label = (name: string) => `${name}${variant.id ? ` (${variant.sku})` : ""}`;
  // UiInput derives ids from names; several variant forms share names on one page.
  const prefix = `variant-${variant.id ?? "new"}`;
  return (
    <form
      className="grid gap-3 rounded-card border border-light-2 p-4 md:grid-cols-3"
      data-variant-form={variant.id ? variant.sku : "new"}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const input = readForm(new FormData(form));
        startTransition(async () => {
          try {
            // the figure the form opened with: stock is written only if the operator changed it,
            // and only over that figure (QA 2026-10-03 T5-01)
            const result = await saveVariantAction({ productId, variantId: variant.id, variant: input, stockLoaded: variant.id ? openedStock.current : null });
            if (result.ok) {
              // saved: the field follows the server again from here
              stockTouched.current = false;
              openedStock.current = input.stock;
              if (!variant.id) { form.reset(); setStock(String(EMPTY.stock)); }
            } else if (result.error === "stockChanged" && typeof result.currentStock === "number") {
              // the refusal names the current figure; a second save is a decision made knowing it
              openedStock.current = result.currentStock;
            }
            onDone(result);
          } catch {
            onDone({ ok: false, error: "invalid" });
          }
        });
      }}
    >
      <UiInput id={`${prefix}-title`} label={label(c.title)} name="title" defaultValue={variant.title} maxLength={120} />
      <UiInput id={`${prefix}-sku`} label={label(c.sku)} name="sku" defaultValue={variant.sku} required maxLength={40} />
      {/* A bundle sells at its bundle price: the field stays (and still submits
          the current value) but is edited in the bundle editor, never here. */}
      <UiInput id={`${prefix}-price`} label={label(c.price)} name="priceCents" type="number" min={0} step={1} defaultValue={variant.priceCents} required readOnly={priceLocked} />
      <UiInput id={`${prefix}-compare`} label={label(c.compareAt)} name="compareAtPriceCents" type="number" min={0} step={1} defaultValue={variant.compareAtPriceCents ?? ""} />
      <UiInput id={`${prefix}-cost`} label={label(c.cost)} name="costCents" type="number" min={0} step={1} defaultValue={variant.costCents ?? ""} />
      <UiInput id={`${prefix}-barcode`} label={label(c.barcode)} name="barcode" defaultValue={variant.barcode ?? ""} maxLength={40} />
      <UiInput id={`${prefix}-weight`} label={label(c.weight)} name="weightGrams" type="number" min={0} step={1} defaultValue={variant.weightGrams ?? ""} />
      {/* a backordered variant may stand below zero; the browser must not block saving its other fields (QA 2026-10-03 T5-02) */}
      <UiInput
        id={`${prefix}-stock`} label={label(c.stock)} name="stock" type="number" min={Math.min(0, variant.stock)} step={1} required
        value={stock} onChange={(event) => { stockTouched.current = true; setStock(event.target.value); }}
      />
      <UiInput id={`${prefix}-max`} label={label(c.maxCart)} name="maxCartQuantity" type="number" min={1} max={20} step={1} defaultValue={variant.maxCartQuantity} required />
      <label className="flex items-center gap-3 text-sm md:col-span-1">
        <input type="checkbox" name="allowBackorder" defaultChecked={variant.allowBackorder} className="size-4 accent-brand" data-variant-backorder />
        {c.allowBackorder}
      </label>
      <UiInput id={`${prefix}-note`} label={label(c.backorderNote)} name="backorderNote" defaultValue={variant.backorderNote ?? ""} maxLength={160} className="md:col-span-2" />
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <UiButton type="submit" variant={variant.id ? "outline" : "primary"} disabled={pending} data-variant-save>{variant.id ? c.save : c.add}</UiButton>
        {variant.id && deletable ? (
          <button
            type="button"
            className="rounded-btn border border-error px-4 py-2 text-sm text-error"
            disabled={pending}
            data-variant-delete
            onClick={() => {
              if (!window.confirm(c.confirmDelete)) return;
              startTransition(async () => {
                try { onDone(await deleteVariantAction({ productId, variantId: variant.id! }), "delete"); }
                catch { onDone({ ok: false, error: "invalid" }, "delete"); }
              });
            }}
          >
            {c.delete}
          </button>
        ) : null}
        {variant.id ? <span className="text-xs text-mid-2">{copy.orders.columns.items}: {variant.orderItems}{variant.bundleItems ? ` · ${copy.catalog.products.bundleTag}` : ""}</span> : null}
        {variant.id && hasHistory(variant) ? <span className="text-xs text-mid-2" data-variant-history>{c.historyNote}</span> : null}
      </div>
    </form>
  );
}

/** `isBundle`: this product IS a bundle, so its price belongs to the bundle editor (saveVariantAction refuses it here). */
export function VariantEditor({ productId, variants, isBundle = false }: { productId: string; variants: VariantRow[]; isBundle?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const onDone: DoneHandler = (result, action = "save") => {
    if (result.ok) {
      // A delete reports the delete, not a save (QA T6-12).
      const text = action === "delete" ? c.deleted : result.armed ? `${c.saved} ${c.armed.replace("{count}", String(result.armed))}` : c.saved;
      setMessage({ ok: true, text });
      router.refresh();
    } else {
      const text = result.error === "skuTaken" ? c.skuTaken : result.error === "lastVariant" ? c.lastVariant
        : result.error === "inBundle" ? c.inBundle : result.error === "hasHistory" ? c.hasHistory : result.error === "bundlePrice" ? c.bundlePrice
          : result.error === "stockChanged" ? c.stockChanged.replace("{stock}", String(result.currentStock ?? "?"))
            : result.error === "stockNegative" ? c.stockNegative : copy.catalog.editor.invalid;
      setMessage({ ok: false, text });
    }
  };
  return (
    <div className="flex flex-col gap-4" data-variant-editor>
      <p className="text-sm text-mid-1">{c.priceHint}</p>
      {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-variant-message>{message.text}</p> : null}
      {variants.map((variant) => <VariantForm key={variant.id} productId={productId} variant={variant} onDone={onDone} deletable={variants.length > 1 && variant.bundleItems === 0 && !hasHistory(variant)} priceLocked={isBundle} />)}
      {/* a new variant of a bundle starts at the bundle price the existing ones already carry */}
      <VariantForm
        productId={productId}
        variant={{ ...EMPTY, priceCents: isBundle ? (variants[0]?.priceCents ?? 0) : EMPTY.priceCents, id: null, orderItems: 0, bundleItems: 0, priceRows: 0 }}
        onDone={onDone}
        deletable={false}
        priceLocked={isBundle}
      />
    </div>
  );
}
