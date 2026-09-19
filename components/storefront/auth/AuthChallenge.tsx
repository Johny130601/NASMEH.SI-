"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { common } from "@/lib/copy/common";
import { CHALLENGE_TIMEOUT_MS } from "../chrome/useLazyChallenge";
import { TurnstileWidget } from "../chrome/TurnstileWidget";

export interface AuthChallengeProps { testToken: string | null; siteKey: string | null }

/**
 * Turnstile tokens are single-use; remount after every submitted attempt.
 *
 * If the challenge never answers — the script blocked by an extension or a
 * network, the widget erroring, an expiry — the token stays empty. Waiting on
 * it for ever left the submit button disabled with nothing said, on pages a
 * person may have no other way to reach: confirming a subscription, activating
 * an account, sending an adverse-event report. After the same timeout the lazy
 * capture forms use, the wait ends, the reason is announced and the button is
 * live again. The server still fails closed without a valid token, so the
 * attempt gets the form's own error instead of a dead control.
 */
export function useAuthChallenge({ testToken, siteKey }: AuthChallengeProps) {
  const [token, setToken] = useState(testToken ?? "");
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needsWidget = !!siteKey && !testToken;

  useEffect(() => {
    if (!needsWidget || token) return;
    timer.current = setTimeout(() => setFailed(true), CHALLENGE_TIMEOUT_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [needsWidget, token, attempt]);

  const receive = useCallback((value: string) => {
    setToken(value);
    // An error or an expiry clears the token: keep waiting until the timer decides.
    if (value) setFailed(false);
  }, []);

  return {
    token,
    waiting: needsWidget && !token && !failed,
    failed,
    reset: () => {
      setToken(testToken ?? "");
      setFailed(false);
      setAttempt(value => value + 1);
    },
    field: <>
      <input type="hidden" name="turnstileToken" value={token} />
      {needsWidget ? <TurnstileWidget key={attempt} siteKey={siteKey} onToken={receive} /> : null}
      {failed ? (
        <p role="alert" className="text-sm text-error" data-challenge-failed>{common.challenge.unavailable}</p>
      ) : null}
    </>,
  };
}
