"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMarqueeAction, savePopupAction, type CmsActionResult } from "@/app/admin/(shell)/vsebina/actions";
import type { MarqueeInput, WelcomePopupInput } from "@/lib/admin/cms-schemas";
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
