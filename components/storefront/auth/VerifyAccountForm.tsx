"use client";
import { useState, useTransition, type FormEvent } from "react";
import { verifyEmailAction } from "@/app/(storefront)/actions/auth";
import { auth as copy } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { useAuthChallenge, type AuthChallengeProps } from "./AuthChallenge";

export function VerifyAccountForm({ token, ...props }: AuthChallengeProps & { token: string }) {
  const human = useAuthChallenge(props);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    startTransition(async () => {
      try {
        const result = await verifyEmailAction({ token, turnstileToken: human.token });
        if (result.ok) setDone(true); else setError(result.error ?? copy.verify.genericError);
      } catch { setError(copy.verify.genericError); }
      finally { human.reset(); }
    });
  }
  if (done) return <div data-verify-success>
    <h1 className="text-[2rem]">{copy.verify.titleOk}</h1>
    <p className="my-4 text-sm text-mid-1">{copy.verify.bodyOk}</p>
    <UiButton href="/prijava?verificirano=1" variant="primary">{copy.verify.cta}</UiButton>
  </div>;
  return <form onSubmit={submit} className="flex flex-col gap-5" data-verify-form>
    <h1 className="text-[2rem]">{copy.verify.title}</h1>
    <p className="text-sm text-mid-1">{copy.verify.body}</p>
    {human.field}
    {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
    <UiButton type="submit" variant="primary" disabled={pending || human.waiting}>{copy.verify.submit}</UiButton>
  </form>;
}
