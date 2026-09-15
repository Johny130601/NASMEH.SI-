"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  saveAnalyticsAction, saveCompanyAction, saveContactSettingsAction, saveGoogleVerificationAction, saveInvoiceFooterAction, saveLegalLinksAction,
  saveMaintenanceAction, saveSeoDefaultsAction, saveVatRateAction, type SettingsActionResult,
} from "@/app/admin/(shell)/nastavitve/actions";
import { companyPlaceholderFields, LEGAL_LINK_KEYS, type AnalyticsInput, type CompanyInput, type LegalLinksInput, type MaintenanceInput, type SeoDefaultsInput } from "@/lib/settings-schemas";
import type { ContactSettingsInput } from "@/lib/support/settings-schema";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";

const c = copy.settings;
export const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";

/** Save helper shared by every settings form: one status line per form, refresh after success. */
export function useSettingsSave(invalidText: string = c.common.invalid) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (task: () => Promise<SettingsActionResult>, okText: string = c.common.saved) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        setMessage(result.ok ? { ok: true, text: okText } : { ok: false, text: invalidText });
        if (result.ok) router.refresh();
      } catch {
        setMessage({ ok: false, text: copy.common.error });
      }
    });
  };
  const status = message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-settings-message>{message.text}</p> : null;
  return { pending, run, status };
}

export function SettingsSection({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-light-2 bg-white p-5" data-settings-section={id}>
      <h2 className="text-base font-medium">{title}</h2>
      {hint ? <p className="mt-1 text-sm text-mid-1">{hint}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function SaveRow({ pending, status, label = c.common.save }: { pending: boolean; status: ReactNode; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <UiButton type="submit" variant="primary" disabled={pending} data-settings-save>{label}</UiButton>
      {status}
    </div>
  );
}

export function VatForm({ initial }: { initial: number }) {
  const [rate, setRate] = useState(String(initial));
  const { pending, run, status } = useSettingsSave();
  return (
    <form data-settings-form="vat" onSubmit={(event) => { event.preventDefault(); run(() => saveVatRateAction({ ratePercent: Number(rate) })); }}>
      <SettingsSection id="vat" title={c.tax.vat.title} hint={c.tax.vat.hint}>
        <UiInput label={c.tax.vat.rate} name="vatRate" type="number" min={0} max={100} step={1} required value={rate} onChange={(event) => setRate(event.target.value)} className="max-w-xs" />
        <SaveRow pending={pending} status={status} />
      </SettingsSection>
    </form>
  );
}

export function CompanyForm({ initial }: { initial: CompanyInput }) {
  const [company, setCompany] = useState(initial);
  const { pending, run, status } = useSettingsSave();
  const field = (key: keyof CompanyInput) => ({ value: company[key] ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => setCompany({ ...company, [key]: event.target.value }) });
  // Reflects the saved Setting, not keystrokes: the warning clears once real data is stored.
  const placeholders = companyPlaceholderFields(initial);
  return (
    <form data-settings-form="company" onSubmit={(event) => { event.preventDefault(); run(() => saveCompanyAction(company)); }}>
      <SettingsSection id="company" title={c.tax.company.title}>
        {placeholders.length > 0 ? (
          <p role="alert" className="rounded-card border border-warning bg-white p-4 text-sm text-dark-1" data-company-placeholders={placeholders.join(" ")}>
            {c.tax.company.placeholderWarning} ({placeholders.map((key) => c.tax.company.placeholderFields[key]).join(", ")})
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.tax.company.fields.name} name="companyName" required maxLength={120} {...field("name")} />
          <UiInput label={c.tax.company.fields.email} name="companyEmail" type="email" required maxLength={254} {...field("email")} />
          <UiInput label={c.tax.company.fields.address} name="companyAddress" required maxLength={300} className="md:col-span-2" {...field("address")} />
          <UiInput label={c.tax.company.fields.registrationNumber} name="companyRegistration" required maxLength={40} {...field("registrationNumber")} />
          <UiInput label={c.tax.company.fields.vatId} name="companyVatId" required maxLength={14} {...field("vatId")} />
          <UiInput label={c.tax.company.fields.phone} name="companyPhone" type="tel" maxLength={40} hint={c.tax.company.phoneHint} {...field("phone")} />
        </div>
        <SaveRow pending={pending} status={status} />
      </SettingsSection>
    </form>
  );
}

export function InvoiceFooterForm({ initial }: { initial: string }) {
  const [footer, setFooter] = useState(initial);
  const { pending, run, status } = useSettingsSave();
  return (
    <form data-settings-form="invoice" onSubmit={(event) => { event.preventDefault(); run(() => saveInvoiceFooterAction({ footer })); }}>
      <SettingsSection id="invoice" title={c.tax.invoice.title} hint={c.tax.invoice.numbering}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.tax.invoice.footer}
          <textarea value={footer} rows={2} maxLength={600} onChange={(event) => setFooter(event.target.value)} className={textareaClass} data-invoice-footer />
        </label>
        <SaveRow pending={pending} status={status} />
      </SettingsSection>
    </form>
  );
}

const ANALYTICS_KEYS = ["gtmId", "ga4Id", "metaPixelId", "tiktokPixelId"] as const;

export function AnalyticsForm({ initial }: { initial: AnalyticsInput }) {
  const [ids, setIds] = useState(initial);
  const { pending, run, status } = useSettingsSave(c.marketing.analytics.invalid);
  return (
    <form data-settings-form="analytics" onSubmit={(event) => { event.preventDefault(); run(() => saveAnalyticsAction(ids)); }}>
      <SettingsSection id="analytics" title={c.marketing.analytics.title} hint={c.marketing.analytics.hint}>
        <div className="grid gap-4 md:grid-cols-2">
          {ANALYTICS_KEYS.map((key) => (
            <UiInput key={key} label={c.marketing.analytics.fields[key]} name={key} maxLength={40} value={ids[key]} onChange={(event) => setIds({ ...ids, [key]: event.target.value })}
              hint={`${c.marketing.analytics.categoryLabel}: ${c.marketing.analytics.categories[key]}`} />
          ))}
        </div>
        <SaveRow pending={pending} status={status} />
      </SettingsSection>
    </form>
  );
}

export function GoogleVerificationForm({ initial }: { initial: string }) {
  const [token, setToken] = useState(initial);
  const { pending, run, status } = useSettingsSave();
  return (
    <form data-settings-form="verification" onSubmit={(event) => { event.preventDefault(); run(() => saveGoogleVerificationAction({ token })); }}>
      <SettingsSection id="verification" title={c.marketing.verification.title}>
        <UiInput label={c.marketing.verification.token} name="googleVerification" maxLength={200} value={token} onChange={(event) => setToken(event.target.value)} />
        <SaveRow pending={pending} status={status} />
      </SettingsSection>
    </form>
  );
}

export function SeoDefaultsForm({ initial }: { initial: SeoDefaultsInput }) {
  const [seo, setSeo] = useState(initial);
  const { pending, run, status } = useSettingsSave(c.marketing.seo.invalid);
  return (
    <form data-settings-form="seo" onSubmit={(event) => { event.preventDefault(); run(() => saveSeoDefaultsAction(seo)); }}>
      <SettingsSection id="seo" title={c.marketing.seo.title}>
        <UiInput label={c.marketing.seo.fields.titleTemplate} name="titleTemplate" required maxLength={120} value={seo.titleTemplate} onChange={(event) => setSeo({ ...seo, titleTemplate: event.target.value })} />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.marketing.seo.fields.description}
          <textarea value={seo.description} rows={2} maxLength={320} onChange={(event) => setSeo({ ...seo, description: event.target.value })} className={textareaClass} />
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={seo.indexable} onChange={(event) => setSeo({ ...seo, indexable: event.target.checked })} className="size-4 accent-brand" data-seo-indexable />
          {c.marketing.seo.fields.indexable}
        </label>
        <p className="text-xs text-mid-2">{c.marketing.seo.indexHint}</p>
        <SaveRow pending={pending} status={status} />
      </SettingsSection>
    </form>
  );
}

export function LegalLinksForm({ initial }: { initial: LegalLinksInput }) {
  const [links, setLinks] = useState(initial);
  const { pending, run, status } = useSettingsSave(c.marketing.legal.invalid);
  return (
    <form data-settings-form="legal" onSubmit={(event) => { event.preventDefault(); run(() => saveLegalLinksAction(links)); }}>
      <SettingsSection id="legal" title={c.marketing.legal.title} hint={c.marketing.legal.hint}>
        <div className="grid gap-4 md:grid-cols-2">
          {LEGAL_LINK_KEYS.map((key) => (
            <UiInput key={key} label={c.marketing.legal.fields[key]} name={`legal-${key}`} required maxLength={500} value={links[key]} onChange={(event) => setLinks({ ...links, [key]: event.target.value })} />
          ))}
        </div>
        <SaveRow pending={pending} status={status} />
      </SettingsSection>
    </form>
  );
}

export function MaintenanceForm({ initial, hasPassword }: { initial: MaintenanceInput; hasPassword: boolean }) {
  const [maintenance, setMaintenance] = useState(initial);
  const { pending, run, status } = useSettingsSave(c.marketing.maintenance.invalid);
  return (
    <form data-settings-form="maintenance" onSubmit={(event) => { event.preventDefault(); run(() => saveMaintenanceAction(maintenance)); }}>
      <SettingsSection id="maintenance" title={c.marketing.maintenance.title} hint={c.marketing.maintenance.hint}>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={maintenance.enabled} onChange={(event) => setMaintenance({ ...maintenance, enabled: event.target.checked })} className="size-4 accent-brand" data-maintenance-enabled />
          {c.marketing.maintenance.fields.enabled}
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.marketing.maintenance.fields.password} name="maintenancePassword" maxLength={80} autoComplete="off" value={maintenance.password} onChange={(event) => setMaintenance({ ...maintenance, password: event.target.value })} />
          <UiInput label={c.marketing.maintenance.fields.message} name="maintenanceMessage" maxLength={300} value={maintenance.message} onChange={(event) => setMaintenance({ ...maintenance, message: event.target.value })} />
        </div>
        <p className="text-xs text-mid-2" data-maintenance-password-state={hasPassword ? "set" : "none"}>{hasPassword ? c.marketing.maintenance.hasPassword : c.marketing.maintenance.noPassword}</p>
        <SaveRow pending={pending} status={status} />
      </SettingsSection>
    </form>
  );
}

export function SupportContactForm({ initial }: { initial: ContactSettingsInput }) {
  const [contact, setContact] = useState(initial);
  const { pending, run, status } = useSettingsSave(c.support.invalid);
  const field = (key: keyof ContactSettingsInput) => ({ value: contact[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setContact({ ...contact, [key]: event.target.value }) });
  return (
    <form data-settings-form="support" onSubmit={(event) => { event.preventDefault(); run(() => saveContactSettingsAction(contact)); }}>
      <SettingsSection id="support" title={c.support.title} hint={c.support.hint}>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.support.fields.supportEmail} name="supportEmail" type="email" required maxLength={254} {...field("supportEmail")} />
          <UiInput label={c.support.fields.complianceEmail} name="complianceEmail" type="email" required maxLength={254} {...field("complianceEmail")} />
          <UiInput label={c.support.fields.hours} name="hours" required maxLength={300} {...field("hours")} />
          <UiInput label={c.support.fields.responseTime} name="responseTime" required maxLength={300} {...field("responseTime")} />
        </div>
        <SaveRow pending={pending} status={status} />
      </SettingsSection>
    </form>
  );
}
