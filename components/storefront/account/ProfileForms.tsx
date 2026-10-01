"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { changePasswordAction, updateNameAction, type ProfileError } from "@/app/(storefront)/actions/profile";
import { account as copy } from "@/lib/copy/account";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

const errorMessage: Record<ProfileError, string> = {
  invalid_name: copy.profile.invalidName,
  wrong_password: copy.profile.wrongPassword,
  weak_password: copy.profile.weakPassword,
  same_password: copy.profile.samePassword,
  rate_limited: copy.profile.rateLimited,
  failed: copy.profile.failed,
};

/** The account name as registration stored it: the first word, then the rest. */
function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName = "", ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

/** Name and password on /racun/podatki (QA T3-A1). */
export function ProfileForms({ name }: { name: string }) {
  return (
    <section className="rounded-card border border-light-2 bg-white p-5" data-profile>
      <h2 className="text-lg">{copy.profile.title}</h2>
      <NameForm name={name} />
      <PasswordForm />
    </section>
  );
}

function NameForm({ name }: { name: string }) {
  const router = useRouter();
  const initial = splitName(name);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await updateNameAction({ firstName: form.get("firstName"), lastName: form.get("lastName") });
        if (result.ok) {
          setSaved(true);
          router.refresh();
        } else setError(errorMessage[result.error ?? "failed"]);
      } catch {
        setError(copy.profile.failed);
      }
    });
  };

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-4" data-profile-name>
      <div className="grid grid-cols-2 gap-3">
        <UiInput label={copy.profile.firstName} name="firstName" autoComplete="given-name" required maxLength={60} defaultValue={initial.firstName} />
        <UiInput label={copy.profile.lastName} name="lastName" autoComplete="family-name" required maxLength={60} defaultValue={initial.lastName} />
      </div>
      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-success">{copy.profile.nameSaved}</p> : null}
      <div>
        <UiButton type="submit" variant="outline" disabled={pending}>{copy.profile.saveName}</UiButton>
      </div>
    </form>
  );
}

function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await changePasswordAction({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") });
        // Every session ended with the change: a full load of the sign-in page drops the client caches too.
        if (result.ok) window.location.assign("/prijava?geslo=spremenjeno");
        else setError(errorMessage[result.error ?? "failed"]);
      } catch {
        setError(copy.profile.failed);
      }
    });
  };

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4 border-t border-light-3 pt-5" data-profile-password>
      <h3 className="text-base font-medium text-dark-1">{copy.profile.passwordTitle}</h3>
      <p className="text-xs text-mid-2">{copy.profile.passwordHint}</p>
      <UiInput label={copy.profile.currentPassword} name="currentPassword" type="password" autoComplete="current-password" required maxLength={72} />
      <UiInput label={copy.profile.newPassword} name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
      <div>
        <UiButton type="submit" variant="outline" disabled={pending}>{copy.profile.savePassword}</UiButton>
      </div>
    </form>
  );
}
