"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeEnrolmentAction } from "@/app/admin/2fa/actions";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";

/** Scan → confirm one code → save the recovery codes once. */
export function TotpEnrolment({ secret, otpauth, qrSvg }: { secret: string; otpauth: string; qrSvg: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const grouped = secret.match(/.{1,4}/g)?.join(" ") ?? secret;

  if (recoveryCodes) {
    return (
      <div className="mt-8 rounded-card border border-light-2 bg-white p-6" data-recovery-codes>
        <h2 className="text-xl">{copy.mfa.doneTitle}</h2>
        <h3 className="mt-4 text-base font-medium">{copy.mfa.recoveryTitle}</h3>
        <p className="mt-1 text-sm text-mid-1">{copy.mfa.recoveryIntro}</p>
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
          {recoveryCodes.map((code) => <li key={code} className="rounded-input border border-light-2 px-3 py-2" data-recovery-code>{code}</li>)}
        </ul>
        <div className="mt-6">
          <UiButton variant="primary" onClick={() => { router.push("/admin"); router.refresh(); }} data-recovery-ack>{copy.mfa.recoveryAck}</UiButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-card border border-light-2 bg-white p-6" data-totp-enrolment>
      <p className="text-sm text-dark-1">{copy.mfa.step1}</p>
      <div className="mt-4 flex flex-wrap items-start gap-6">
        <div
          className="h-48 w-48 shrink-0 rounded-card border border-light-2 p-1"
          role="img"
          aria-label={copy.mfa.qrAlt}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-mid-1">{copy.mfa.secretLabel}</p>
          <code className="mt-1 block break-all rounded-input bg-light-3 px-3 py-2 font-mono text-sm" data-totp-secret={secret}>{grouped}</code>
          <a href={otpauth} className="mt-2 inline-block text-sm text-mid-1 underline underline-offset-4">otpauth://</a>
        </div>
      </div>
      <p className="mt-6 text-sm text-dark-1">{copy.mfa.step2}</p>
      <form
        className="mt-3 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const code = String(new FormData(event.currentTarget).get("code") ?? "");
          setError(null);
          startTransition(async () => {
            try {
              const result = await completeEnrolmentAction({ code });
              if (result.ok) setRecoveryCodes(result.recoveryCodes);
              else setError(result.reason === "rate_limited" ? copy.mfa.rateLimited : result.reason === "invalid_code" ? copy.mfa.invalid : copy.mfa.genericError);
            } catch {
              setError(copy.mfa.genericError);
            }
          });
        }}
      >
        <UiInput label={copy.mfa.codeLabel} name="code" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={7} />
        {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
        <UiButton type="submit" variant="primary" disabled={pending}>{copy.mfa.submit}</UiButton>
      </form>
    </div>
  );
}
