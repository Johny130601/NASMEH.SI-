"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { saveProductAction } from "@/app/admin/(shell)/izdelki/actions";
import { BADGE_STYLES, PRODUCT_STATUSES, SOLD_OUT_BEHAVIOURS, type ProductBasics, type ProductContent } from "@/lib/admin/catalog";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiFormField, UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.catalog.editor;
const selectClass = "min-h-[3.25rem] w-full rounded-input border border-light-1 bg-white px-4 text-base outline-none focus:border-brand";
const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";
const smallButton = "rounded-btn border border-light-1 px-3 py-1.5 text-xs";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-light-2 bg-white p-5">
      <h2 className="text-base font-medium">{title}</h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function StringList({ label, values, max, onChange, maxLength }: { label: string; values: string[]; max: number; onChange: (next: string[]) => void; maxLength: number }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-dark-1">{label}</legend>
      {values.map((value, index) => (
        <div key={index} className="flex gap-2">
          <input aria-label={`${label} ${index + 1}`} value={value} maxLength={maxLength} onChange={(event) => onChange(values.map((entry, position) => (position === index ? event.target.value : entry)))} className="min-h-[2.75rem] w-full rounded-input border border-light-1 px-3 text-sm outline-none focus:border-brand" />
          <button type="button" className={smallButton} onClick={() => onChange(values.filter((_, position) => position !== index))}>{c.merchandising.remove}</button>
        </div>
      ))}
      {values.length < max ? <button type="button" className={`${smallButton} self-start`} onClick={() => onChange([...values, ""])}>{c.merchandising.add}</button> : null}
    </fieldset>
  );
}

export function ProductEditor({ productId, basics: initialBasics, content: initialContent, crossSellOptions }: {
  productId: string;
  basics: ProductBasics;
  content: ProductContent;
  crossSellOptions: Array<{ slug: string; title: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [basics, setBasics] = useState(initialBasics);
  const [content, setContent] = useState(initialContent);
  const merch = content.merchandising;
  const setMerch = (patch: Partial<typeof merch>) => setContent({ ...content, merchandising: { ...merch, ...patch } });
  const field = (key: keyof ProductBasics, value: string | boolean) => setBasics({ ...basics, [key]: value });

  return (
    <form
      className="flex flex-col gap-4"
      data-product-editor
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          try {
            const result = await saveProductAction({ productId, basics, content: { ...content, merchandising: { ...merch, uspChips: merch.uspChips.filter(Boolean), bullets: merch.bullets.filter(Boolean), crossSell: merch.crossSell.filter(Boolean) } } });
            if (result.ok) {
              setMessage({ ok: true, text: c.saved });
              router.refresh();
            } else {
              setMessage({ ok: false, text: result.error === "slugTaken" ? c.slugTaken : result.error === "extraJson" ? c.extraJsonInvalid : c.invalid });
            }
          } catch {
            setMessage({ ok: false, text: copy.common.error });
          }
        });
      }}
    >
      <Section title={c.sections.basics}>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.fields.title} name="title" value={basics.title} required maxLength={200} onChange={(event) => field("title", event.target.value)} />
          <UiInput label={c.fields.slug} name="slug" value={basics.slug} required maxLength={80} onChange={(event) => field("slug", event.target.value)} />
          <UiFormField label={c.fields.status} htmlFor="product-status">
            <select id="product-status" value={basics.status} onChange={(event) => field("status", event.target.value)} className={selectClass}>
              {PRODUCT_STATUSES.map((status) => <option key={status} value={status}>{copy.catalog.products.statuses[status]}</option>)}
            </select>
          </UiFormField>
          <UiFormField label={c.fields.soldOutBehavior} htmlFor="product-soldout">
            <select id="product-soldout" value={basics.soldOutBehavior} onChange={(event) => field("soldOutBehavior", event.target.value)} className={selectClass}>
              {SOLD_OUT_BEHAVIOURS.map((value) => <option key={value} value={value}>{c.fields.soldOut[value]}</option>)}
            </select>
          </UiFormField>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.fields.description}
          <textarea value={basics.description} rows={5} maxLength={5000} onChange={(event) => field("description", event.target.value)} className={textareaClass} />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.fields.seoTitle} name="seoTitle" value={basics.seoTitle ?? ""} maxLength={200} onChange={(event) => field("seoTitle", event.target.value)} />
          <UiInput label={c.fields.seoDescription} name="seoDescription" value={basics.seoDescription ?? ""} maxLength={320} onChange={(event) => field("seoDescription", event.target.value)} />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {([["visibleInCatalog", c.fields.visibleInCatalog], ["visibleInSearch", c.fields.visibleInSearch], ["klarnaEligible", c.fields.klarnaEligible], ["hiddenDeal", c.fields.hiddenDeal]] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={basics[key]} onChange={(event) => field(key, event.target.checked)} className="size-4 accent-brand" data-flag={key} />
              {label}
            </label>
          ))}
        </div>
      </Section>

      <Section title={c.sections.merchandising}>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{c.badges.title}</legend>
          {content.badges.map((badge, index) => (
            <div key={index} className="flex flex-wrap gap-2">
              <input aria-label={`${c.badges.label} ${index + 1}`} value={badge.label} maxLength={30} onChange={(event) => setContent({ ...content, badges: content.badges.map((entry, position) => (position === index ? { ...entry, label: event.target.value } : entry)) })} className="min-h-[2.75rem] flex-1 rounded-input border border-light-1 px-3 text-sm outline-none focus:border-brand" />
              <select aria-label={`${c.badges.style} ${index + 1}`} value={badge.style} onChange={(event) => setContent({ ...content, badges: content.badges.map((entry, position) => (position === index ? { ...entry, style: event.target.value as typeof entry.style } : entry)) })} className="min-h-[2.75rem] rounded-input border border-light-1 px-3 text-sm">
                {BADGE_STYLES.map((style) => <option key={style} value={style}>{c.badges.styles[style]}</option>)}
              </select>
              <button type="button" className={smallButton} onClick={() => setContent({ ...content, badges: content.badges.filter((_, position) => position !== index) })}>{c.badges.remove}</button>
            </div>
          ))}
          {content.badges.length < 4 ? <button type="button" className={`${smallButton} self-start`} onClick={() => setContent({ ...content, badges: [...content.badges, { label: "", style: "solid" }] })}>{c.badges.add}</button> : null}
        </fieldset>
        <StringList label={c.merchandising.uspChips} values={merch.uspChips} max={3} maxLength={40} onChange={(uspChips) => setMerch({ uspChips })} />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.merchandising.intro}
          <textarea value={merch.intro} rows={3} maxLength={600} onChange={(event) => setMerch({ intro: event.target.value })} className={textareaClass} />
        </label>
        <StringList label={c.merchandising.bullets} values={merch.bullets} max={6} maxLength={120} onChange={(bullets) => setMerch({ bullets })} />
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.merchandising.unitPriceQuantity} name="unitPriceQuantity" type="number" min={1} value={merch.unitPrice?.quantity ?? ""} hint={c.merchandising.unitPriceHint}
            onChange={(event) => { const quantity = Number.parseInt(event.target.value, 10); setMerch({ unitPrice: Number.isInteger(quantity) && quantity > 0 ? { quantity, unit: merch.unitPrice?.unit ?? "" } : null }); }} />
          <UiInput label={c.merchandising.unitPriceUnit} name="unitPriceUnit" value={merch.unitPrice?.unit ?? ""} maxLength={30} disabled={!merch.unitPrice}
            onChange={(event) => setMerch({ unitPrice: merch.unitPrice ? { ...merch.unitPrice, unit: event.target.value } : null })} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{c.merchandising.crossSell}</legend>
          {merch.crossSell.map((slug, index) => (
            <div key={index} className="flex gap-2">
              <select aria-label={`${c.merchandising.crossSell} ${index + 1}`} value={slug} onChange={(event) => setMerch({ crossSell: merch.crossSell.map((entry, position) => (position === index ? event.target.value : entry)) })} className={selectClass}>
                <option value="">—</option>
                {crossSellOptions.map((option) => <option key={option.slug} value={option.slug}>{option.title}</option>)}
              </select>
              <button type="button" className={smallButton} onClick={() => setMerch({ crossSell: merch.crossSell.filter((_, position) => position !== index) })}>{c.merchandising.remove}</button>
            </div>
          ))}
          {merch.crossSell.length < 6 ? <button type="button" className={`${smallButton} self-start`} onClick={() => setMerch({ crossSell: [...merch.crossSell, ""] })}>{c.merchandising.add}</button> : null}
        </fieldset>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.merchandising.extraJson}
          <textarea value={merch.extraJson} rows={4} maxLength={20000} onChange={(event) => setMerch({ extraJson: event.target.value })} className={`${textareaClass} font-mono text-sm`} data-extra-json />
        </label>
      </Section>

      <Section title={c.sections.content}>
        {(["howItWorks", "inci", "guarantee", "tested"] as const).map((key) => (
          <label key={key} className="flex flex-col gap-1.5 text-sm font-medium">
            {c.content.accordions[key]}
            <textarea value={content.accordions[key]} rows={4} maxLength={8000} aria-describedby={key === "tested" ? "product-tested-hint" : undefined} onChange={(event) => setContent({ ...content, accordions: { ...content.accordions, [key]: event.target.value } })} className={textareaClass} />
            {key === "tested" ? <span id="product-tested-hint" className="text-xs font-normal text-mid-2" data-tested-hint>{c.content.testedHint}</span> : null}
          </label>
        ))}
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">{c.content.faq}</legend>
          {content.faq.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-card border border-light-2 p-3 md:grid-cols-[1fr_2fr_auto]">
              <input aria-label={`${c.content.faqQ} ${index + 1}`} value={item.q} maxLength={200} onChange={(event) => setContent({ ...content, faq: content.faq.map((entry, position) => (position === index ? { ...entry, q: event.target.value } : entry)) })} className="min-h-[2.75rem] rounded-input border border-light-1 px-3 text-sm" />
              <textarea aria-label={`${c.content.faqA} ${index + 1}`} value={item.a} rows={2} maxLength={1000} onChange={(event) => setContent({ ...content, faq: content.faq.map((entry, position) => (position === index ? { ...entry, a: event.target.value } : entry)) })} className={`${textareaClass} text-sm`} />
              <button type="button" className={`${smallButton} self-start`} onClick={() => setContent({ ...content, faq: content.faq.filter((_, position) => position !== index) })}>{c.merchandising.remove}</button>
            </div>
          ))}
          {content.faq.length < 12 ? <button type="button" className={`${smallButton} self-start`} onClick={() => setContent({ ...content, faq: [...content.faq, { q: "", a: "" }] })}>{c.merchandising.add}</button> : null}
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">{c.content.education}</legend>
          {content.education.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-card border border-light-2 p-3 md:grid-cols-[1fr_2fr_auto]">
              <input aria-label={`${c.content.educationHeading} ${index + 1}`} value={item.heading} maxLength={120} onChange={(event) => setContent({ ...content, education: content.education.map((entry, position) => (position === index ? { ...entry, heading: event.target.value } : entry)) })} className="min-h-[2.75rem] rounded-input border border-light-1 px-3 text-sm" />
              <textarea aria-label={`${c.content.educationBody} ${index + 1}`} value={item.body} rows={2} maxLength={1500} onChange={(event) => setContent({ ...content, education: content.education.map((entry, position) => (position === index ? { ...entry, body: event.target.value } : entry)) })} className={`${textareaClass} text-sm`} />
              <button type="button" className={`${smallButton} self-start`} onClick={() => setContent({ ...content, education: content.education.filter((_, position) => position !== index) })}>{c.merchandising.remove}</button>
            </div>
          ))}
          {content.education.length < 6 ? <button type="button" className={`${smallButton} self-start`} onClick={() => setContent({ ...content, education: [...content.education, { heading: "", body: "" }] })}>{c.merchandising.add}</button> : null}
        </fieldset>
      </Section>

      <div className="flex items-center gap-4">
        <UiButton type="submit" variant="primary" disabled={pending} data-product-save>{c.save}</UiButton>
        {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-product-message>{message.text}</p> : null}
      </div>
    </form>
  );
}
