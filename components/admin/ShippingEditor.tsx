"use client";

import { useState } from "react";
import { saveShippingAction, saveTrackingTemplatesAction } from "@/app/admin/(shell)/nastavitve/actions";
import { TRACKING_CARRIER_KEYS } from "@/lib/settings-schemas";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";
import { SettingsSection, useSettingsSave } from "./SettingsForms";

const c = copy.settings.shipping;
const inputClass = "min-h-[2.75rem] w-full rounded-input border border-light-1 bg-white px-3 text-sm outline-none focus:border-brand";
const smallButton = "rounded-btn border border-light-1 px-3 py-1.5 text-xs disabled:opacity-40";

interface MethodRow { id: string; carrier: string; label: string; priceCents: string; estimate: string; countries: string[] }
export interface ShippingEditorInitial {
  methods: Array<{ id: string; carrier: string; label: string; priceCents: number; estimate: string; countries: string[] }>;
  freeThresholdCents: number;
  standardCostCents: number;
}

const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

/** Methods with their countries, the free-shipping threshold and the cart's shipping estimate (§14.12). */
export function ShippingEditor({ initial, countries }: { initial: ShippingEditorInitial; countries: Array<{ code: string; label: string }> }) {
  const [methods, setMethods] = useState<MethodRow[]>(initial.methods.map((method) => ({ ...method, priceCents: String(method.priceCents) })));
  const [threshold, setThreshold] = useState(String(initial.freeThresholdCents));
  const [standard, setStandard] = useState(String(initial.standardCostCents));
  const { pending, run, status } = useSettingsSave(c.methods.invalid);
  const update = (index: number, patch: Partial<MethodRow>) => setMethods(methods.map((method, position) => (position === index ? { ...method, ...patch } : method)));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= methods.length) return;
    const next = [...methods];
    [next[index], next[target]] = [next[target], next[index]];
    setMethods(next);
  };
  const toggleCountry = (index: number, code: string, checked: boolean) => {
    const current = methods[index].countries;
    update(index, { countries: checked ? [...new Set([...current, code])] : current.filter((entry) => entry !== code) });
  };

  return (
    <form
      className="flex flex-col gap-4"
      data-shipping-editor
      onSubmit={(event) => {
        event.preventDefault();
        run(() => saveShippingAction({
          methods: methods.map((method) => ({ ...method, priceCents: toNumber(method.priceCents) })),
          freeThresholdCents: toNumber(threshold),
          standardCostCents: toNumber(standard),
        }));
      }}
    >
      <SettingsSection id="methods" title={c.methods.title} hint={c.methods.hint}>
        <ol className="flex flex-col gap-3">
          {methods.map((method, index) => (
            <li key={index} className="rounded-card border border-light-2 p-4" data-shipping-method={index}>
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_1fr_1fr]">
                <input aria-label={`${c.methods.columns.id} ${index + 1}`} value={method.id} maxLength={40} required onChange={(event) => update(index, { id: event.target.value })} className={inputClass} />
                <input aria-label={`${c.methods.columns.carrier} ${index + 1}`} value={method.carrier} maxLength={60} required onChange={(event) => update(index, { carrier: event.target.value })} className={inputClass} />
                <input aria-label={`${c.methods.columns.label} ${index + 1}`} value={method.label} maxLength={80} required onChange={(event) => update(index, { label: event.target.value })} className={inputClass} />
                <input aria-label={`${c.methods.columns.price} ${index + 1}`} type="number" min={0} max={100000} step={1} value={method.priceCents} required onChange={(event) => update(index, { priceCents: event.target.value })} className={inputClass} data-method-price={index} />
                <input aria-label={`${c.methods.columns.estimate} ${index + 1}`} value={method.estimate} maxLength={80} onChange={(event) => update(index, { estimate: event.target.value })} className={inputClass} />
              </div>
              <fieldset className="mt-3">
                <legend className="text-xs font-medium text-mid-1">{c.methods.columns.countries}</legend>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {countries.map((country) => (
                    <label key={country.code} className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={method.countries.includes(country.code)} onChange={(event) => toggleCountry(index, country.code, event.target.checked)} className="size-3.5 accent-brand" data-method-country={`${index}-${country.code}`} />
                      {country.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={smallButton} disabled={index === 0} onClick={() => move(index, -1)}>{c.methods.up}</button>
                <button type="button" className={smallButton} disabled={index === methods.length - 1} onClick={() => move(index, 1)}>{c.methods.down}</button>
                <button type="button" className="rounded-btn border border-error px-3 py-1.5 text-xs text-error" disabled={methods.length <= 1} onClick={() => setMethods(methods.filter((_, position) => position !== index))}>{c.methods.remove}</button>
              </div>
            </li>
          ))}
        </ol>
        {methods.length < 20 ? (
          <button type="button" className={`${smallButton} self-start`} onClick={() => setMethods([...methods, { id: "", carrier: "", label: "", priceCents: "0", estimate: "", countries: ["SI"] }])} data-method-add>{c.methods.add}</button>
        ) : null}
      </SettingsSection>
      <SettingsSection id="thresholds" title={c.thresholds.title}>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.thresholds.freeThreshold} name="freeThresholdCents" type="number" min={0} max={1000000} step={1} required value={threshold} onChange={(event) => setThreshold(event.target.value)} />
          <UiInput label={c.thresholds.standardCost} name="standardCostCents" type="number" min={0} max={100000} step={1} required value={standard} onChange={(event) => setStandard(event.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <UiButton type="submit" variant="primary" disabled={pending} data-shipping-save>{copy.settings.common.save}</UiButton>
          {status}
        </div>
      </SettingsSection>
    </form>
  );
}

export function TrackingTemplatesForm({ initial }: { initial: Record<(typeof TRACKING_CARRIER_KEYS)[number], string> }) {
  const [templates, setTemplates] = useState(initial);
  const { pending, run, status } = useSettingsSave(c.tracking.invalid);
  return (
    <form data-settings-form="tracking" onSubmit={(event) => { event.preventDefault(); run(() => saveTrackingTemplatesAction(templates)); }}>
      <SettingsSection id="tracking" title={c.tracking.title} hint={c.tracking.hint}>
        <div className="grid gap-4 md:grid-cols-2">
          {TRACKING_CARRIER_KEYS.map((key) => (
            <UiInput key={key} label={c.tracking.fields[key]} name={`tracking-${key}`} maxLength={2048} value={templates[key]} onChange={(event) => setTemplates({ ...templates, [key]: event.target.value })} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <UiButton type="submit" variant="primary" disabled={pending} data-settings-save>{copy.settings.common.save}</UiButton>
          {status}
        </div>
      </SettingsSection>
    </form>
  );
}
