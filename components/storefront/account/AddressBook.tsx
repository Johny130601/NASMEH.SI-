"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import {
  deleteAddressAction,
  saveAddressAction,
  setDefaultAddressAction,
  updateMarketingPreferenceAction,
} from "@/app/(storefront)/actions/address";
import { EU_COUNTRIES, isValidPostalCode, parseStreetLine, savedStreetLine } from "@/lib/orders/checkout-constants";
import { isValidPhone, PHONE_MAX_LENGTH } from "@/lib/phone";
import { account as copy } from "@/lib/copy/account";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { UiPill } from "../ui/UiPill";

interface AddressRow {
  id: string;
  label: string | null;
  fullName: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
}

/** Address book CRUD + marketing preference (§11.2). */
export function AddressBook({
  addresses,
  marketingOptIn,
}: {
  addresses: AddressRow[];
  marketingOptIn: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AddressRow | null>(null);
  const [marketing, setMarketing] = useState(marketingOptIn);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Deleting is irreversible: the row asks once before it goes (QA T3-A1).
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (operation: () => Promise<{ ok: boolean }>, success: string, onFailure?: () => void) => {
    setError(false); setMessage(null);
    startTransition(async () => {
      try {
        const result = await operation();
        if (!result.ok) { setError(true); onFailure?.(); return; }
        setMessage(success); router.refresh();
      } catch { setError(true); onFailure?.(); }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-light-2 bg-white p-5">
        <h2 className="text-lg">{copy.addresses.profileTitle}</h2>
        <label className="mt-3 flex items-start gap-2 text-sm text-mid-1">
          <input
            type="checkbox"
            checked={marketing}
            disabled={pending}
            onChange={(event) => {
              const marketingOptIn = event.currentTarget.checked;
              const previous = marketing;
              setMarketing(marketingOptIn);
              run(() => updateMarketingPreferenceAction({ marketingOptIn }), copy.addresses.marketingSaved, () => setMarketing(previous));
            }}
            className="mt-1"
            data-marketing-toggle
          />
          {copy.addresses.marketing}
        </label>
      </section>
      {error ? <p role="alert" className="text-sm text-error">{copy.addresses.failed}</p> : null}
      {message ? <p role="status" className="text-sm text-success">{message}</p> : null}

      <section className="rounded-card border border-light-2 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">{copy.addresses.book}</h2>
          <UiButton variant="outline" disabled={pending} onClick={() => { setEditing(null); setShowForm(true); }}>
            {copy.addresses.add}
          </UiButton>
        </div>

        {addresses.length === 0 && !showForm ? (
          <p className="mt-4 text-sm text-mid-2">{copy.addresses.empty}</p>
        ) : null}

        <ul className="mt-4 flex flex-col gap-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-light-2 p-4"
              data-address-row={address.id}
            >
              <div className="text-sm leading-6 text-mid-1">
                <span className="font-medium text-dark-1">
                  {address.label ?? address.fullName}
                </span>
                {address.isDefault ? (
                  <UiPill variant="brand" className="ml-2">
                    {copy.addresses.default}
                  </UiPill>
                ) : null}
                <br />
                {address.fullName}, {address.line1}
                {address.line2 ? `, ${address.line2}` : ""},{" "}
                {/* the country's name, as the order pages and the invoice print it (QA 2026-10-03 V3-02) */}
                {address.postalCode} {address.city}, {EU_COUNTRIES.find((country) => country.code === address.country)?.label ?? address.country}
              </div>
              <div className="flex gap-2">
                {!address.isDefault ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setDefaultAddressAction({ id: address.id }), copy.addresses.changed)}
                    className="text-xs text-mid-1 underline underline-offset-2"
                  >
                    {copy.addresses.setDefault}
                  </button>
                ) : null}
                <button type="button" disabled={pending}
                  onClick={() => { setEditing(address); setShowForm(true); }}
                  className="text-xs text-mid-1 underline underline-offset-2">
                  {copy.addresses.edit}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  aria-expanded={confirmDelete === address.id}
                  onClick={() => setConfirmDelete(confirmDelete === address.id ? null : address.id)}
                  className="text-xs text-error underline underline-offset-2"
                  data-address-delete
                >
                  {copy.addresses.delete}
                </button>
              </div>
              {confirmDelete === address.id ? (
                <div className="flex w-full flex-wrap items-center gap-3 border-t border-light-3 pt-3" role="group" aria-label={copy.addresses.deleteConfirm} data-address-delete-confirm>
                  <p className="text-sm text-dark-1">{copy.addresses.deleteConfirm}</p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => { setConfirmDelete(null); run(() => deleteAddressAction({ id: address.id }), copy.addresses.changed); }}
                    className="text-xs font-medium text-error underline underline-offset-2"
                    data-address-delete-yes
                  >
                    {copy.addresses.deleteConfirmYes}
                  </button>
                  <button type="button" disabled={pending} onClick={() => setConfirmDelete(null)} className="text-xs text-mid-1 underline underline-offset-2">
                    {copy.addresses.cancel}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {showForm ? <AddressForm key={editing?.id ?? "new"} initial={editing} onDone={() => setShowForm(false)} /> : null}
      </section>
    </div>
  );
}

type AddressFieldErrors = Partial<Record<"phone" | "postalCode" | "line1", string>>;

function AddressForm({ initial, onDone }: { initial: AddressRow | null; onDone: () => void }) {
  const router = useRouter();
  const countryId = useId();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AddressFieldErrors>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    // The server's rules, checked before sending: the phone rule (lib/phone.ts) and the postal format per country (QA T3-A1).
    const phone = String(form.get("phone") ?? "").trim();
    const postalCode = String(form.get("postalCode") ?? "").trim();
    const invalid: AddressFieldErrors = {};
    // the checkout reads the saved address through the same rule (QA 2026-10-03 T3-03)
    if (parseStreetLine(savedStreetLine(String(form.get("line1") ?? ""), String(form.get("line2") ?? ""))) === null) {
      invalid.line1 = copy.addresses.invalidLine1;
    }
    if (phone && !isValidPhone(phone)) invalid.phone = copy.addresses.invalidPhone;
    if (!isValidPostalCode(String(form.get("country") ?? ""), postalCode)) invalid.postalCode = copy.addresses.invalidPostalCode;
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) return;
    startTransition(async () => {
      const result = await saveAddressAction({
        ...(initial ? { id: initial.id } : {}),
        label: form.get("label"),
        fullName: form.get("fullName"),
        line1: form.get("line1"),
        line2: form.get("line2"),
        postalCode: form.get("postalCode"),
        city: form.get("city"),
        country: form.get("country"),
        phone: form.get("phone"),
        isDefault: form.get("isDefault") === "on",
      });
      if (result.ok) {
        router.refresh();
        onDone();
      } else if (result.error === "invalid_phone") {
        setFieldErrors({ phone: copy.addresses.invalidPhone });
      } else if (result.error === "invalid_line1") {
        setFieldErrors({ line1: copy.addresses.invalidLine1 });
      } else {
        setError(result.error === "invalid" ? copy.addresses.invalid : copy.addresses.failed);
      }
    });
  };

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-4 border-t border-light-3 pt-5" data-address-form>
      <UiInput label={copy.addresses.label} name="label" maxLength={40} defaultValue={initial?.label ?? ""} />
      <UiInput label={copy.addresses.fullName} name="fullName" required maxLength={120} defaultValue={initial?.fullName ?? ""} />
      <UiInput label={copy.addresses.line1} name="line1" autoComplete="address-line1" required maxLength={160} defaultValue={initial?.line1 ?? ""}
        error={fieldErrors.line1} onChange={() => setFieldErrors(prev => ({ ...prev, line1: undefined }))} />
      <UiInput label={copy.addresses.line2} name="line2" maxLength={160} defaultValue={initial?.line2 ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <UiInput label={copy.addresses.postalCode} name="postalCode" required maxLength={10} defaultValue={initial?.postalCode ?? ""}
          error={fieldErrors.postalCode} onChange={() => setFieldErrors(prev => ({ ...prev, postalCode: undefined }))} />
        <UiInput label={copy.addresses.city} name="city" required maxLength={80} defaultValue={initial?.city ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5 text-sm font-medium text-dark-1">
        <label htmlFor={countryId}>{copy.addresses.country}</label>
        <select
          id={countryId}
          name="country"
          defaultValue={initial?.country ?? "SI"}
          className="h-[3.25rem] rounded-input border border-light-1 bg-white px-4 text-base text-dark-1 outline-none focus:border-brand"
        >
          {EU_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.label}
            </option>
          ))}
        </select>
      </div>
      <UiInput label={copy.addresses.phone} name="phone" type="tel" autoComplete="tel" maxLength={PHONE_MAX_LENGTH} defaultValue={initial?.phone ?? ""}
        error={fieldErrors.phone} onChange={() => setFieldErrors(prev => ({ ...prev, phone: undefined }))} />
      <label className="flex items-center gap-2 text-sm text-mid-1">
        <input type="checkbox" name="isDefault" defaultChecked={initial?.isDefault ?? false} disabled={initial?.isDefault} />
        {copy.addresses.setDefault}
      </label>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      <UiButton type="submit" variant="primary" disabled={pending}>
        {copy.addresses.save}
      </UiButton>
      <UiButton type="button" variant="ghost" disabled={pending} onClick={onDone}>{copy.addresses.cancel}</UiButton>
    </form>
  );
}
