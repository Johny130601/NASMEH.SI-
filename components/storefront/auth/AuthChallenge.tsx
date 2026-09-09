"use client";
import { useState } from "react";
import { TurnstileWidget } from "../chrome/TurnstileWidget";

export interface AuthChallengeProps { testToken: string | null; siteKey: string | null }

/** Turnstile tokens are single-use; remount after every submitted attempt. */
export function useAuthChallenge({ testToken, siteKey }: AuthChallengeProps) {
  const [token, setToken] = useState(testToken ?? "");
  const [attempt, setAttempt] = useState(0);
  return {
    token,
    waiting: !!siteKey && !testToken && !token,
    reset: () => { setToken(testToken ?? ""); setAttempt(value => value + 1); },
    field: <>
      <input type="hidden" name="turnstileToken" value={token} />
      {siteKey && !testToken ? <TurnstileWidget key={attempt} siteKey={siteKey} onToken={setToken} /> : null}
    </>,
  };
}
