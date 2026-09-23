"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBundleBuilderAction, saveMarqueeAction, savePopupAction, type CmsActionResult } from "@/app/admin/(shell)/vsebina/actions";
import type { BundleBuilderInput, MarqueeInput, WelcomePopupInput } from "@/lib/admin/cms-schemas";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";

const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";

function useSave(invalidText: string, errorTexts: Partial<Record<string, string>> = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (task: () => Promise<CmsActionResult>, okText: string) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        setMessage(result.ok ? { ok: true, text: okText } : { ok: false, text: errorTexts[result.error] ?? invalidText });
        if (result.ok) router.refresh();
      } catch {
        setMessage({ ok: false, text: copy.common.error });
      }
    });
  };
  const status = message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-cms-message>{message.text}</p> : null;
  return { pending, run, status };
}

export function MarqueeForm({ initial }: { initial: MarqueeInput }) {
  const c = copy.content.marquee;
  const [values, setValues] = useState(initial);
  const { pending, run, status } = useSave(c.invalid);
  return (
    <form className="flex flex-col gap-4 rounded-card border border-light-2 bg-white p-5" data-marquee-form onSubmit={(event) => { event.preventDefault(); run(() => saveMarqueeAction(values), c.saved); }}>
      <UiInput label={c.fields.text} name="text" required maxLength={160} value={values.text} onChange={(event) => setValues({ ...values, text: event.target.value })} />
      <UiInput label={c.fields.href} name="href" maxLength={500} value={values.href ?? ""} onChange={(event) => setValues({ ...values, href: event.target.value })} />
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={values.active} onChange={(event) => setValues({ ...values, active: event.target.checked })} className="size-4 accent-brand" data-marquee-active />
        {c.fields.active}
      </label>
      <div className="flex items-center gap-3">
        <UiButton type="submit" variant="primary" disabled={pending} data-marquee-save>{c.save}</UiButton>
        {status}
      </div>
    </form>
  );
}

export function PopupForm({ initial }: { initial: WelcomePopupInput }) {
  const c = copy.content.popup;
  const [values, setValues] = useState(initial);
  const { pending, run, status } = useSave(c.invalid, { couponUnknown: c.couponUnknown });
  const text = (key: "couponCode" | "title" | "cta" | "thankYouTitle") => ({ value: values[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: event.target.value }) });
  return (
    <form className="flex flex-col gap-4 rounded-card border border-light-2 bg-white p-5" data-popup-form onSubmit={(event) => { event.preventDefault(); run(() => savePopupAction(values), c.saved); }}>
      <p className="text-sm text-mid-1">{c.intro}</p>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={values.active} onChange={(event) => setValues({ ...values, active: event.target.checked })} className="size-4 accent-brand" data-popup-active />
        {c.fields.active}
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <UiInput label={c.fields.delaySeconds} name="delaySeconds" type="number" min={0} max={600} step={1} required value={values.delaySeconds} onChange={(event) => setValues({ ...values, delaySeconds: Number.parseInt(event.target.value, 10) || 0 })} />
        <UiInput label={c.fields.couponCode} name="couponCode" required maxLength={24} {...text("couponCode")} />
        <UiInput label={c.fields.title} name="title" required maxLength={120} {...text("title")} />
        <UiInput label={c.fields.cta} name="cta" required maxLength={40} {...text("cta")} />
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {c.fields.body}
        <textarea value={values.body} rows={3} maxLength={600} required onChange={(event) => setValues({ ...values, body: event.target.value })} className={textareaClass} />
      </label>
      <UiInput label={c.fields.thankYouTitle} name="thankYouTitle" required maxLength={120} {...text("thankYouTitle")} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {c.fields.thankYouBody}
        <textarea value={values.thankYouBody} rows={3} maxLength={600} required onChange={(event) => setValues({ ...values, thankYouBody: event.target.value })} className={textareaClass} />
      </label>
      <div className="flex items-center gap-3">
        <UiButton type="submit" variant="primary" disabled={pending} data-popup-save>{c.save}</UiButton>
        {status}
      </div>
    </form>
  );
}

/** Switch with its own explanation underneath; the bundle-builder switches both need one. */
function SwitchRow({ label, hint, checked, onChange, marker }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void; marker: string }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 size-4 accent-brand" data-bundle-switch={marker} />
      <span className="font-medium">
        {label}
        <span className="mt-1 block text-xs font-normal text-mid-2">{hint}</span>
      </span>
    </label>
  );
}

/** Comma- or space-separated entries, like the featured slugs in the menu editor. */
const entries = (value: string) => value.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);

export function BundleBuilderForm({ initial }: { initial: BundleBuilderInput }) {
  const c = copy.content.bundle;
  const [values, setValues] = useState(initial);
  // The two list fields stay raw text while typing; they become arrays on submit.
  const [offerUnits, setOfferUnits] = useState(initial.offerUnits.join(", "));
  const [addOnSlugs, setAddOnSlugs] = useState(initial.addOnSlugs.join(", "));
  const { pending, run, status } = useSave(c.invalid, { couponUnknown: c.couponUnknown, productUnknown: c.productUnknown });
  const save = () => run(() => saveBundleBuilderAction({ ...values, offerUnits: entries(offerUnits).map(Number), addOnSlugs: entries(addOnSlugs) }), c.saved);
  return (
    <form className="flex flex-col gap-4 rounded-card border border-light-2 bg-white p-5" data-bundle-form onSubmit={(event) => { event.preventDefault(); save(); }}>
      <p className="text-sm text-mid-1">{c.intro}</p>
      <SwitchRow marker="enabled" label={c.fields.enabled} hint={c.hints.enabled} checked={values.enabled} onChange={(enabled) => setValues({ ...values, enabled })} />
      <SwitchRow marker="subscription" label={c.fields.subscriptionRow} hint={c.hints.subscriptionRow} checked={values.subscriptionRow} onChange={(subscriptionRow) => setValues({ ...values, subscriptionRow })} />
      <div className="grid gap-4 md:grid-cols-2">
        <UiInput label={c.fields.offerUnits} name="offerUnits" hint={c.hints.offerUnits} required maxLength={20} inputMode="numeric" value={offerUnits} onChange={(event) => setOfferUnits(event.target.value)} />
        <UiInput label={c.fields.couponCode} name="bundleCouponCode" hint={c.hints.couponCode} maxLength={24} value={values.couponCode} onChange={(event) => setValues({ ...values, couponCode: event.target.value })} />
      </div>
      <UiInput label={c.fields.addOnSlugs} name="addOnSlugs" hint={c.hints.addOnSlugs} maxLength={200} value={addOnSlugs} onChange={(event) => setAddOnSlugs(event.target.value)} />
      <div className="flex items-center gap-3">
        <UiButton type="submit" variant="primary" disabled={pending} data-bundle-save>{c.save}</UiButton>
        {status}
      </div>
    </form>
  );
}
