import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/admin/access";
import { loadTaxScreen } from "@/lib/admin/settings";
import { admin as copy } from "@/lib/copy";
import { CompanyForm, InvoiceFooterForm, VatForm } from "@/components/admin/SettingsForms";

export const metadata: Metadata = { title: copy.settings.tax.title, robots: { index: false, follow: false } };

/** /admin/nastavitve/davki-racuni — VAT, company block, invoice footer, provider status (§14.13). */
export default async function AdminTaxSettingsPage() {
  await requirePagePermission("settings:manage");
  const { vatRatePercent, company, invoiceFooter, providers } = await loadTaxScreen();
  const c = copy.settings.tax;
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-settings-tax>
      <Link href="/admin/nastavitve" className="text-sm text-mid-1 underline underline-offset-4">{copy.common.back}</Link>
      <h1 className="mt-3 text-[2rem]">{c.title}</h1>
      <div className="mt-6 flex flex-col gap-4">
        <VatForm initial={vatRatePercent} />
        <CompanyForm initial={company} />
        <InvoiceFooterForm initial={invoiceFooter} />
        <section className="rounded-card border border-light-2 bg-white p-5" data-settings-section="providers">
          <h2 className="text-base font-medium">{c.providers.title}</h2>
          <p className="mt-1 text-sm text-mid-1">{c.providers.hint}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {providers.map((provider) => (
              <li key={provider.id} className="rounded-card border border-light-2 p-4" data-provider-status={provider.id} data-provider-configured={provider.configured ? "yes" : "no"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{c.providers.names[provider.id]}</span>
                  <span className={`rounded-btn px-3 py-1 text-xs ${provider.configured ? "bg-success/10 text-success" : "bg-light-3 text-mid-1"}`}>{provider.configured ? c.providers.configured : c.providers.missing}</span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mid-1">
                  {provider.details.map((detail) => (
                    <li key={detail.key}><code>{detail.key}</code>: {detail.present ? c.providers.present : c.providers.absent}{detail.note ? ` (${detail.note})` : ""}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
