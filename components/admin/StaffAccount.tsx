"use client";

import { useState, useTransition } from "react";
import { regenerateRecoveryCodesAction } from "@/app/admin/(shell)/racun/actions";
import { admin as copy } from "@/lib/copy/admin";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";

export function StaffAccount() {
  const [pending, startTransition] = useTransition();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-6 rounded-card border border-light-2 bg-white p-5"
      data-regenerate-codes
      onSubmit={(event) => {
        event.preventDefault();
        const code = String(new FormData(event.currentTarget).get("code") ?? "");
        setError(null);
        startTransition(async () => {
          try {
            const result = await regenerateRecoveryCodesAction({ code });
            if (result.ok) setCodes(result.recoveryCodes);
            else setError(copy.mfa.invalid);
          } catch {
            setError(copy.common.error);
          }
        });
      }}
    >
      <h2 className="text-base font-medium">{copy.account.regenerateTitle}</h2>
      <p className="mt-1 text-sm text-mid-1">{copy.account.regenerateIntro}</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <UiInput label={copy.mfa.codeLabel} name="code" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={7} className="w-48" />
        <UiButton type="submit" variant="outline" disabled={pending}>{copy.account.regenerate}</UiButton>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-error">{error}</p> : null}
      {codes ? (
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm" data-recovery-codes>
          {codes.map((code) => <li key={code} className="rounded-input border border-light-2 px-3 py-2">{code}</li>)}
        </ul>
      ) : null}
    </form>
  );
}
