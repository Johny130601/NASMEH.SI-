"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  forgotPasswordAction,
  resetPasswordAction,
} from "@/app/(storefront)/actions/auth";
import { auth as copy } from "@/lib/copy/auth";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { useAuthChallenge, type AuthChallengeProps } from "./AuthChallenge";

/** Forgot-password form (uniform response). */
export function ForgotPasswordForm(props: AuthChallengeProps) {
  const human = useAuthChallenge(props);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await forgotPasswordAction({ email, turnstileToken: human.token });
        if (result.ok) setDone(true); else setError(result.error ?? copy.forgot.genericError);
      } catch { setError(copy.forgot.genericError); }
      finally { human.reset(); }
    });
  };

  if (done) {
    return (
      <div data-forgot-success className="rounded-card border border-success bg-white p-6 text-center">
        <h2 className="text-2xl">{copy.forgot.successTitle}</h2>
        <p className="mt-2 text-sm text-mid-1">{copy.forgot.successBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-forgot-form>
      <UiInput
        label={copy.login.emailLabel}
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {human.field}
      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
      <UiButton type="submit" variant="primary" fullWidth disabled={pending || human.waiting}>
        {copy.forgot.submit}
      </UiButton>
    </form>
  );
}

/** Reset-password form (single-use token). */
export function ResetPasswordForm({ token, ...props }: { token: string } & AuthChallengeProps) {
  const human = useAuthChallenge(props);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
      const result = await resetPasswordAction({ token, password, turnstileToken: human.token });
      if (result.ok) setDone(true);
      else setError(result.error ?? copy.reset.genericError);
      } catch { setError(copy.reset.genericError); }
      finally { human.reset(); }
    });
  };

  if (done) {
    return (
      <div data-reset-success className="rounded-card border border-success bg-white p-6 text-center">
        <h2 className="text-2xl">{copy.login.resetOk}</h2>
        <div className="mt-4">
          <UiButton href="/prijava?reset=1" variant="primary">
            {copy.verify.cta}
          </UiButton>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-reset-form>
      <UiInput
        label={copy.reset.passwordLabel}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      {human.field}
      <UiButton type="submit" variant="primary" fullWidth disabled={pending || human.waiting}>
        {copy.reset.submit}
      </UiButton>
    </form>
  );
}
