"use client";
import { useState } from "react";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { loginAction } from "@/app/(storefront)/prijava/actions";
import { auth as copy } from "@/lib/copy";
import { UiInput } from "../ui/UiInput";
import { UiButton } from "../ui/UiButton";
import { useAuthChallenge, type AuthChallengeProps } from "./AuthChallenge";

export function LoginForm(props: AuthChallengeProps) {
  const human = useAuthChallenge(props);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <form action={async formData => {
    setPending(true); setError(null);
    try { await loginAction(formData); }
    catch (error) {
      if (isRedirectError(error)) throw error;
      setError(copy.login.genericError);
    }
    finally { human.reset(); setPending(false); }
  }} className="flex flex-col gap-5" data-login-form>
    <UiInput label={copy.login.emailLabel} name="email" type="email" autoComplete="email" required maxLength={254} />
    <UiInput label={copy.login.passwordLabel} name="password" type="password" autoComplete="current-password" required maxLength={72} />
    {human.field}
    {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
    <UiButton type="submit" variant="primary" fullWidth disabled={pending || human.waiting}>{copy.login.submit}</UiButton>
  </form>;
}
