"use client";

import { useState, useTransition, type FormEvent } from "react";
import { registerAction } from "@/app/(storefront)/actions/auth";
import { auth as copy } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { PrivacyNotice } from "../PrivacyNotice";
import { useAuthChallenge, type AuthChallengeProps } from "./AuthChallenge";

/**
 * Register form (§11.1) — marketing checkbox unchecked by default, with the
 * privacy-policy notice (`legal.links.privacy`) next to it.
 */
export function RegisterForm({ privacyHref, ...challenge }: AuthChallengeProps & { privacyHref: string }) {
  const human = useAuthChallenge(challenge);
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    marketingOptIn: false,
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof values, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
      const result = await registerAction({
        ...values,
        turnstileToken: human.token,
      });
      if (result.ok) setDone(true);
      else setError(result.error ?? copy.register.genericError);
      } catch { setError(copy.register.genericError); }
      finally { human.reset(); }
    });
  };

  if (done) {
    return (
      <div data-register-success className="rounded-card border border-success bg-white p-6 text-center">
        <h2 className="text-2xl">{copy.register.successTitle}</h2>
        <p className="mt-2 text-sm text-mid-1">{copy.register.successBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-register-form>
      <div className="grid grid-cols-2 gap-3">
        <UiInput
          label={copy.register.firstName}
          name="firstName"
          autoComplete="given-name"
          required
          value={values.firstName}
          onChange={(e) => set("firstName", e.target.value)}
        />
        <UiInput
          label={copy.register.lastName}
          name="lastName"
          autoComplete="family-name"
          required
          value={values.lastName}
          onChange={(e) => set("lastName", e.target.value)}
        />
      </div>
      <UiInput
        label={copy.login.emailLabel}
        name="email"
        type="email"
        autoComplete="email"
        required
        value={values.email}
        onChange={(e) => set("email", e.target.value)}
      />
      <UiInput
        label={copy.register.passwordLabel}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={values.password}
        onChange={(e) => set("password", e.target.value)}
      />
      <label className="flex items-start gap-2 text-sm text-mid-1">
        <input
          type="checkbox"
          checked={values.marketingOptIn}
          onChange={(e) => set("marketingOptIn", e.target.checked)}
          className="mt-1"
          data-marketing-optin
        />
        {copy.register.marketing}
      </label>
      <PrivacyNotice
        lead={copy.register.privacyLead}
        link={copy.register.privacyLink}
        href={privacyHref}
        className="-mt-3 text-xs text-mid-2"
      />
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      {human.field}
      <UiButton type="submit" variant="primary" fullWidth disabled={pending || human.waiting}>
        {copy.register.submit}
      </UiButton>
    </form>
  );
}
