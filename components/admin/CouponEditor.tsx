"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { createCouponAction, deleteCouponAction, saveCouponAction, type CouponActionResult } from "@/app/admin/(shell)/kuponi/actions";
import { COUPON_TYPES, type CouponInput } from "@/lib/admin/coupons-schema";
import { admin as copy } from "@/lib/copy/admin";
import { promo } from "@/lib/copy/promo";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiFormField, UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.coupons;
const selectClass = "min-h-[3.25rem] w-full rounded-input border border-light-1 bg-white px-4 text-base outline-none focus:border-brand";
const multiClass = "min-h-[8rem] w-full rounded-input border border-light-1 bg-white p-2 text-sm outline-none focus:border-brand";
const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";

/** `code`: the code as submitted, so a format refusal names it (QA T6-11). */
export function errorText(result: Extract<CouponActionResult, { ok: false }>, code = ""): string {
  switch (result.error) {
    case "codeTaken": return c.editor.codeTaken;
    case "codeInvalid": return c.editor.codeInvalid.replace("{code}", code.trim().toUpperCase());
    case "emailsInvalid": return c.editor.emailsInvalid;
    case "used": return c.editor.used;
    case "not_found": return copy.common.error;
    default: return c.editor.invalid;
  }
}

export function CouponCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<CouponInput["type"]>("PERCENT");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 rounded-card border border-light-2 bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
      data-coupon-create
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const value = Number.parseInt(String(data.get("value") ?? ""), 10);
        setError(null);
        startTransition(async () => {
          try {
            const result = await createCouponAction({
              code: String(data.get("code") ?? ""), type,
              percentOff: type === "PERCENT" && Number.isInteger(value) ? value : null,
              amountOffCents: (type === "FIXED" || type === "FIXED_PRODUCT") && Number.isInteger(value) ? value : null,
              usageLimitTotal: null, usageLimitPerCustomer: null, startsAt: null, endsAt: null, minSpendCents: null,
              eligibleProductIds: [], eligibleCollectionSlugs: [], eligibleEmails: [], excludedProductIds: [], active: true,
            });
            if (result.ok && result.id) router.push(`/admin/kuponi/${result.id}`);
            else if (!result.ok) setError(errorText(result, String(data.get("code") ?? "")));
          } catch {
            setError(copy.common.error);
          }
        });
      }}
    >
      <h2 className="text-base font-medium md:col-span-4">{c.newTitle}</h2>
      <UiInput label={c.editor.fields.code} name="code" required maxLength={24} />
      <UiFormField label={c.editor.fields.type} htmlFor="coupon-new-type">
        <select id="coupon-new-type" value={type} onChange={(event) => setType(event.target.value as CouponInput["type"])} className={selectClass}>
          {COUPON_TYPES.map((entry) => <option key={entry} value={entry}>{c.types[entry]}</option>)}
          <option value="BXGY" disabled>{c.types.BXGY}</option>
        </select>
      </UiFormField>
      {type === "FREE_SHIPPING" ? <div /> : (
        <UiInput label={type === "PERCENT" ? c.editor.fields.percentOff : c.editor.fields.amountOffCents} name="value" type="number" min={1} max={type === "PERCENT" ? 100 : 10_000_000} step={1} required />
      )}
      <UiButton type="submit" variant="primary" disabled={pending}>{c.create}</UiButton>
      {error ? <p role="alert" className="text-sm text-error md:col-span-4">{error}</p> : null}
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-light-2 bg-white p-5">
      <h2 className="text-base font-medium">{title}</h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function intOrNull(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function CouponEditor({ couponId, initial, deletable, products, collections }: {
  couponId: string;
  initial: CouponInput;
  deletable: boolean;
  products: Array<{ id: string; title: string; status: string }>;
  collections: Array<{ slug: string; title: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [values, setValues] = useState(initial);
  const [emails, setEmails] = useState(initial.eligibleEmails.join("\n"));
  const set = <K extends keyof CouponInput>(key: K, value: CouponInput[K]) => setValues({ ...values, [key]: value });
  const selected = (event: React.ChangeEvent<HTMLSelectElement>) => Array.from(event.target.selectedOptions).map((option) => option.value);

  return (
    <form
      className="flex flex-col gap-4"
      data-coupon-editor
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          try {
            const result = await saveCouponAction({ couponId, coupon: { ...values, eligibleEmails: emails.split(/[\n,;]+/).map((entry) => entry.trim()).filter(Boolean) } });
            if (result.ok) { setMessage({ ok: true, text: c.editor.saved }); router.refresh(); }
            else setMessage({ ok: false, text: errorText(result, values.code) });
          } catch {
            setMessage({ ok: false, text: copy.common.error });
          }
        });
      }}
    >
      <Section title={c.editor.sections.basics}>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.editor.fields.code} name="code" value={values.code} required maxLength={24} onChange={(event) => set("code", event.target.value)} />
          <UiFormField label={c.editor.fields.type} htmlFor="coupon-type">
            <select id="coupon-type" value={values.type} onChange={(event) => set("type", event.target.value as CouponInput["type"])} className={selectClass}>
              {COUPON_TYPES.map((entry) => <option key={entry} value={entry}>{c.types[entry]}</option>)}
              <option value="BXGY" disabled>{c.types.BXGY}</option>
            </select>
          </UiFormField>
          {values.type === "PERCENT" ? (
            <UiInput label={c.editor.fields.percentOff} name="percentOff" type="number" min={1} max={100} step={1} value={values.percentOff ?? ""} required onChange={(event) => set("percentOff", intOrNull(event.target.value))} />
          ) : null}
          {values.type === "FIXED" || values.type === "FIXED_PRODUCT" ? (
            <UiInput label={c.editor.fields.amountOffCents} name="amountOffCents" type="number" min={1} step={1} value={values.amountOffCents ?? ""} required onChange={(event) => set("amountOffCents", intOrNull(event.target.value))} />
          ) : null}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={values.active} onChange={(event) => set("active", event.target.checked)} className="size-4 accent-brand" data-coupon-active />
          {c.editor.fields.active}
        </label>
        <p className="text-xs text-mid-2">{c.editor.hints.stacking}</p>
      </Section>

      <Section title={c.editor.sections.limits}>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.editor.fields.usageLimitTotal} name="usageLimitTotal" type="number" min={1} step={1} value={values.usageLimitTotal ?? ""} hint={c.editor.hints.unlimited} onChange={(event) => set("usageLimitTotal", intOrNull(event.target.value))} />
          <UiInput label={c.editor.fields.usageLimitPerCustomer} name="usageLimitPerCustomer" type="number" min={1} step={1} value={values.usageLimitPerCustomer ?? ""} hint={c.editor.hints.unlimited} onChange={(event) => set("usageLimitPerCustomer", intOrNull(event.target.value))} />
          <UiInput label={c.editor.fields.startsAt} name="startsAt" type="datetime-local" value={values.startsAt ?? ""} onChange={(event) => set("startsAt", event.target.value || null)} />
          <UiInput label={c.editor.fields.endsAt} name="endsAt" type="datetime-local" value={values.endsAt ?? ""} onChange={(event) => set("endsAt", event.target.value || null)} />
          <UiInput label={c.editor.fields.minSpendCents} name="minSpendCents" type="number" min={1} step={1} value={values.minSpendCents ?? ""} hint={c.editor.hints.unlimited} onChange={(event) => set("minSpendCents", intOrNull(event.target.value))} />
        </div>
        <p className="text-xs text-mid-2">{promo.adminNotes.usageAtCreation}</p>
      </Section>

      <Section title={c.editor.sections.eligibility}>
        <div className="grid gap-4 md:grid-cols-2">
          <UiFormField label={c.editor.fields.eligibleProducts} htmlFor="coupon-products" hint={c.editor.hints.allProducts}>
            <select id="coupon-products" multiple value={values.eligibleProductIds} onChange={(event) => set("eligibleProductIds", selected(event))} className={multiClass}>
              {products.map((product) => <option key={product.id} value={product.id}>{product.title}{product.status !== "ACTIVE" ? ` (${copy.catalog.products.statuses[product.status as "DRAFT" | "ACTIVE" | "ARCHIVED"]})` : ""}</option>)}
            </select>
          </UiFormField>
          <UiFormField label={c.editor.fields.eligibleCollections} htmlFor="coupon-collections" hint={c.editor.hints.allProducts}>
            <select id="coupon-collections" multiple value={values.eligibleCollectionSlugs} onChange={(event) => set("eligibleCollectionSlugs", selected(event))} className={multiClass}>
              {collections.map((collection) => <option key={collection.slug} value={collection.slug}>{collection.title}</option>)}
            </select>
          </UiFormField>
          <UiFormField label={c.editor.fields.excludedProducts} htmlFor="coupon-excluded">
            <select id="coupon-excluded" multiple value={values.excludedProductIds} onChange={(event) => set("excludedProductIds", selected(event))} className={multiClass}>
              {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
            </select>
          </UiFormField>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {c.editor.fields.eligibleEmails}
            <textarea value={emails} rows={5} maxLength={20000} onChange={(event) => setEmails(event.target.value)} className={textareaClass} data-coupon-emails />
            <span className="text-xs font-normal text-mid-2">{c.editor.hints.emails}</span>
          </label>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-4">
        <UiButton type="submit" variant="primary" disabled={pending} data-coupon-save>{c.editor.save}</UiButton>
        {deletable ? (
          <button
            type="button"
            className="rounded-btn border border-error px-4 py-2 text-sm text-error"
            disabled={pending}
            data-coupon-delete
            onClick={() => {
              if (!window.confirm(c.editor.confirmDelete)) return;
              startTransition(async () => {
                try {
                  const result = await deleteCouponAction({ couponId });
                  if (result.ok) router.push("/admin/kuponi");
                  else setMessage({ ok: false, text: errorText(result, values.code) });
                } catch {
                  setMessage({ ok: false, text: copy.common.error });
                }
              });
            }}
          >
            {c.editor.delete}
          </button>
        ) : <span className="text-xs text-mid-2">{c.editor.used}</span>}
        {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-coupon-message>{message.text}</p> : null}
      </div>
    </form>
  );
}

export function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-btn border border-light-1 px-3 py-1.5 text-xs"
      data-coupon-copy
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? c.editor.copied : c.editor.copy}
    </button>
  );
}
