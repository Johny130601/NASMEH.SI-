"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bumpConsentVersionAction, saveConsentConfigAction } from "@/app/admin/(shell)/nastavitve/actions";
import { CONSENT_CATEGORIES, type ConsentBannerInput, type CookieRowInput } from "@/lib/settings-schemas";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";
import { SettingsSection, textareaClass, useSettingsSave } from "./SettingsForms";

const c = copy.settings.marketing.consent;
const inputClass = "min-h-[2.5rem] w-full rounded-input border border-light-1 bg-white px-3 text-sm outline-none focus:border-brand";
const smallButton = "rounded-btn border border-light-1 px-3 py-1.5 text-xs disabled:opacity-40";

/** Cookie table, banner copy overrides and the consent version (§14.14). */
export function ConsentEditor({ initial }: { initial: { version: number; cookies: CookieRowInput[]; banner: ConsentBannerInput } }) {
  const router = useRouter();
  const [cookies, setCookies] = useState(initial.cookies);
  const [banner, setBanner] = useState(initial.banner);
  const { pending, run, status } = useSettingsSave(c.invalid);
  const [bumping, startBump] = useTransition();
  const [bumpMessage, setBumpMessage] = useState<string | null>(null);
  const update = (index: number, patch: Partial<CookieRowInput>) => setCookies(cookies.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  return (
    <div className="flex flex-col gap-4" data-consent-editor>
      <form data-settings-form="consent" onSubmit={(event) => { event.preventDefault(); run(() => saveConsentConfigAction({ cookies, banner })); }}>
        <SettingsSection id="consent" title={c.title}>
          <div className="grid gap-4 md:grid-cols-2">
            <UiInput label={c.banner.title} name="consentBannerTitle" maxLength={120} value={banner.title} onChange={(event) => setBanner({ ...banner, title: event.target.value })} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {c.banner.body}
              <textarea value={banner.body} rows={2} maxLength={600} onChange={(event) => setBanner({ ...banner, body: event.target.value })} className={textareaClass} data-consent-banner-body />
            </label>
          </div>
          <h3 className="text-sm font-medium">{c.cookies.title}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-left text-xs text-mid-2">
                <tr>
                  <th className="px-2 py-2">{c.cookies.columns.name}</th><th className="px-2 py-2">{c.cookies.columns.provider}</th><th className="px-2 py-2">{c.cookies.columns.purpose}</th>
                  <th className="px-2 py-2">{c.cookies.columns.duration}</th><th className="px-2 py-2">{c.cookies.columns.category}</th><th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {cookies.map((row, index) => (
                  <tr key={index} className="border-t border-light-2" data-cookie-row-editor={index}>
                    <td className="px-2 py-2"><input aria-label={`${c.cookies.columns.name} ${index + 1}`} value={row.name} maxLength={80} required onChange={(event) => update(index, { name: event.target.value })} className={inputClass} /></td>
                    <td className="px-2 py-2"><input aria-label={`${c.cookies.columns.provider} ${index + 1}`} value={row.provider} maxLength={80} required onChange={(event) => update(index, { provider: event.target.value })} className={inputClass} /></td>
                    <td className="px-2 py-2"><input aria-label={`${c.cookies.columns.purpose} ${index + 1}`} value={row.purpose} maxLength={300} required onChange={(event) => update(index, { purpose: event.target.value })} className={inputClass} /></td>
                    <td className="px-2 py-2"><input aria-label={`${c.cookies.columns.duration} ${index + 1}`} value={row.duration} maxLength={40} required onChange={(event) => update(index, { duration: event.target.value })} className={inputClass} /></td>
                    <td className="px-2 py-2">
                      <select aria-label={`${c.cookies.columns.category} ${index + 1}`} value={row.category} onChange={(event) => update(index, { category: event.target.value as CookieRowInput["category"] })} className={inputClass}>
                        {CONSENT_CATEGORIES.map((category) => <option key={category} value={category}>{c.cookies.categories[category]}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2"><button type="button" className={smallButton} onClick={() => setCookies(cookies.filter((_, position) => position !== index))}>{c.cookies.remove}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cookies.length < 50 ? (
            <button type="button" className={`${smallButton} self-start`} onClick={() => setCookies([...cookies, { name: "", provider: "", purpose: "", duration: "", category: "necessary" }])} data-cookie-add>{c.cookies.add}</button>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <UiButton type="submit" variant="primary" disabled={pending} data-settings-save>{copy.settings.common.save}</UiButton>
            {status}
          </div>
        </SettingsSection>
      </form>
      <section className="rounded-card border border-light-2 bg-white p-5" data-settings-section="consent-version">
        <p className="text-sm" data-consent-version>{c.version.replace("{version}", String(initial.version))}</p>
        <p className="mt-1 text-xs text-mid-2">{c.bumpHint}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <UiButton
            variant="outline"
            disabled={bumping}
            data-consent-bump
            onClick={() => {
              if (!window.confirm(c.confirmBump)) return;
              setBumpMessage(null);
              startBump(async () => {
                try {
                  const result = await bumpConsentVersionAction();
                  setBumpMessage(result.ok ? c.bumped.replace("{version}", String(result.version)) : copy.common.error);
                  if (result.ok) router.refresh();
                } catch {
                  setBumpMessage(copy.common.error);
                }
              });
            }}
          >
            {c.bump}
          </UiButton>
          {bumpMessage ? <p role="status" className="text-sm text-success" data-consent-bump-message>{bumpMessage}</p> : null}
        </div>
      </section>
    </div>
  );
}
