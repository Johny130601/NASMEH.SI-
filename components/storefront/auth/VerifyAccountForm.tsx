"use client";
import { useState, useTransition, type FormEvent } from "react";
import { verifyEmailAction } from "@/app/(storefront)/actions/auth";
import { auth as copy } from "@/lib/copy/auth";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { useAuthChallenge, type AuthChallengeProps } from "./AuthChallenge";

/**
 * Activation asks for the password chosen with the account (QA 2026-10-03
 * T3-02): the link proves the inbox, the password the person who chose it.
 * When the click also confirms the newsletter opt-in chosen with the account,
 * the page says so before the click and confirms it after.
 */
export function VerifyAccountForm({ token, newsletter, ...props }: AuthChallengeProps & { token: string; newsletter: boolean }) {
  const human = useAuthChallenge(props);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState<{ newsletter: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    startTransition(async () => {
      try {
        const result = await verifyEmailAction({ token, password, turnstileToken: human.token });
        if (result.ok) setDone({ newsletter: result.newsletter === true }); else setError(result.error ?? copy.verify.genericError);
      } catch { setError(copy.verify.genericError); }
      finally { human.reset(); }
    });
  }
  if (done) return <div data-verify-success>
    <h1 className="text-[2rem]">{copy.verify.titleOk}</h1>
    <p className="my-4 text-sm text-mid-1">{copy.verify.bodyOk}</p>
    {done.newsletter ? <p className="mb-4 text-sm text-mid-1" data-verify-newsletter-ok>{copy.verify.newsletterOk}</p> : null}
    <UiButton href="/prijava?verificirano=1" variant="primary">{copy.verify.cta}</UiButton>
  </div>;
  return <form onSubmit={submit} className="flex flex-col gap-5" data-verify-form>
    <h1 className="text-[2rem]">{copy.verify.title}</h1>
    <p className="text-sm text-mid-1">{copy.verify.body}</p>
    {newsletter ? <p className="text-sm text-mid-1" data-verify-newsletter>{copy.verify.newsletterNote}</p> : null}
    <UiInput label={copy.verify.passwordLabel} id="activation-password" name="password" type="password"
      autoComplete="current-password" required maxLength={72} className="text-left"
      value={password} onChange={(event) => setPassword(event.target.value)} />
    {human.field}
    {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
    <UiButton type="submit" variant="primary" disabled={pending || human.waiting}>{copy.verify.submit}</UiButton>
  </form>;
}
