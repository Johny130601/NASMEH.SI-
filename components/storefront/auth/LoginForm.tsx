"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/app/(storefront)/prijava/actions";
import { auth as copy } from "@/lib/copy/auth";
import { UiInput } from "../ui/UiInput";
import { UiButton } from "../ui/UiButton";
import { useAuthChallenge, type AuthChallengeProps } from "./AuthChallenge";

/**
 * The Server Action is the form's action, so the browser can submit it
 * without JavaScript (backlog B14): every outcome is a redirect and the page
 * renders the error from its search params. With JavaScript, React submits
 * the same action and shows the pending state; Turnstile still needs a
 * script to mint its token, which is inherent to the challenge.
 */
export function LoginForm({ callbackUrl = null, defaultEmail = "", ...props }: AuthChallengeProps & {
  /** The validated page to return to after sign-in (QA T3-F1); a failed attempt keeps it. */
  callbackUrl?: string | null;
  /** The address of the previous failed attempt (QA T3-F2). */
  defaultEmail?: string;
}) {
  const human = useAuthChallenge(props);
  // Controlled, so the address also survives the form reset after a failed attempt with JavaScript.
  const [email, setEmail] = useState(defaultEmail);
  return <form action={loginAction} className="flex flex-col gap-5" data-login-form>
    {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
    <UiInput label={copy.login.emailLabel} name="email" type="email" autoComplete="email" required maxLength={254}
      value={email} onChange={(event) => setEmail(event.target.value)} />
    <UiInput label={copy.login.passwordLabel} name="password" type="password" autoComplete="current-password" required maxLength={72} />
    {human.field}
    <SubmitButton waiting={human.waiting} />
  </form>;
}

function SubmitButton({ waiting }: { waiting: boolean }) {
  const { pending } = useFormStatus();
  return <UiButton type="submit" variant="primary" fullWidth disabled={pending || waiting}>{copy.login.submit}</UiButton>;
}
