"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { UiButton } from "./ui/UiButton";
import { useAuthChallenge, type AuthChallengeProps } from "./auth/AuthChallenge";

const NO_CHALLENGE: AuthChallengeProps = { testToken: null, siteKey: null };

/**
 * Read-only token links (/potrdi, /potrdi-zalogo, /odjava-*) render this form:
 * the state change happens only in the server action a person submits, so
 * mail scanners and link previews that fetch the GET never confirm or
 * withdraw anything. `challenge` adds Turnstile (consent-giving routes);
 * withdrawals pass none. `success` is the server-rendered done state.
 */
export function TokenActionForm({
  action,
  token,
  challenge,
  title,
  body,
  submit,
  genericError,
  success,
}: {
  action: (input: { token: string; turnstileToken: string }) => Promise<{ ok: boolean; error?: string }>;
  token: string;
  challenge?: AuthChallengeProps;
  title: string;
  body: ReactNode;
  submit: string;
  genericError: string;
  success: ReactNode;
}) {
  const human = useAuthChallenge(challenge ?? NO_CHALLENGE);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await action({ token, turnstileToken: human.token });
        if (result.ok) setDone(true);
        else setError(result.error ?? genericError);
      } catch {
        setError(genericError);
      } finally {
        human.reset();
      }
    });
  }

  if (done) return <div data-token-success>{success}</div>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-center gap-5" data-token-form>
      <h1 className="text-[2rem]">{title}</h1>
      <div className="text-sm text-mid-1">{body}</div>
      {human.field}
      {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
      <UiButton type="submit" variant="primary" disabled={pending || human.waiting}>
        {submit}
      </UiButton>
    </form>
  );
}
