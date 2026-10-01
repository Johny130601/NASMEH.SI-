"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { common } from "@/lib/copy/common";
import { TurnstileWidget } from "./TurnstileWidget";

/** How long a submit waits for the widget before it gives up and asks for a retry. */
export const CHALLENGE_TIMEOUT_MS = 15_000;

export interface LazyChallengeConfig {
  testToken: string | null;
  /** `undefined` while the key is still being fetched; `null` when none is configured. */
  siteKey: string | null | undefined;
}

export interface LazyChallengeSnapshot {
  token: string;
  armed: boolean;
  /** Bumped on every reset so a fresh widget mounts (tokens are single-use). */
  attempt: number;
  /** A submit is waiting for the widget's token. */
  queued: boolean;
  /** The last queued submit gave up: widget error, expiry, blocked script or timeout. */
  failed: boolean;
}

type Send = (token: string) => void;

/**
 * The submit queue behind `useLazyChallenge`, free of React so the unit suite
 * can drive it with fake timers. A submit made before the widget answered is
 * held until the token arrives; a widget error or expiry (the widget reports
 * an empty token), or no answer within the timeout, drops the held submit and
 * flags `failed` so the form can say so and let the visitor try again.
 */
export class LazyChallengeController {
  private config: LazyChallengeConfig;
  private readonly timeoutMs: number;
  private snapshot: LazyChallengeSnapshot;
  private pending: Send | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(config: LazyChallengeConfig, timeoutMs = CHALLENGE_TIMEOUT_MS) {
    this.config = config;
    this.timeoutMs = timeoutMs;
    this.snapshot = { token: config.testToken ?? "", armed: false, attempt: 0, queued: false, failed: false };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snapshot;

  /** A real widget is required: no e2e token, and a site key is configured or still loading. */
  get needsWidget(): boolean {
    return !this.config.testToken && this.config.siteKey !== null;
  }

  configure(config: LazyChallengeConfig) {
    this.config = config;
    // The key turned out to be absent: nothing will ever answer, so the server decides.
    if (this.snapshot.queued && !this.needsWidget) this.flush(this.snapshot.token);
  }

  arm = () => {
    if (!this.snapshot.armed) this.update({ armed: true });
  };

  /** Sends at once when no widget is needed or a token is ready, otherwise waits for one. */
  submit(send: Send) {
    this.arm();
    if (this.snapshot.queued) return;
    if (!this.needsWidget || this.snapshot.token) {
      if (this.snapshot.failed) this.update({ failed: false });
      send(this.snapshot.token);
      return;
    }
    this.pending = send;
    this.clearTimer();
    this.timer = setTimeout(() => this.fail(), this.timeoutMs);
    this.update({ queued: true, failed: false });
  }

  /** Widget callback: a token, or "" on error, expiry or a script that failed to load. */
  onToken = (token: string) => {
    // A token that arrives after a give-up (an interactive challenge finished late) clears the retry message.
    this.update(token && this.snapshot.failed ? { token, failed: false } : { token });
    if (!this.snapshot.queued) return;
    if (token) this.flush(token);
    else this.fail();
  };

  reset() {
    this.update({ token: this.config.testToken ?? "", attempt: this.snapshot.attempt + 1 });
  }

  dispose() {
    this.clearTimer();
    this.pending = null;
  }

  private flush(token: string) {
    const send = this.pending;
    this.pending = null;
    this.clearTimer();
    this.update({ queued: false, failed: false });
    send?.(token);
  }

  private fail() {
    if (!this.snapshot.queued) return;
    this.pending = null;
    this.clearTimer();
    this.update({ queued: false, failed: true });
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private update(patch: Partial<LazyChallengeSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}

/**
 * Turnstile for capture forms that sit on many pages (footer newsletter,
 * welcome popup, sold-out "Obvestite me"): Cloudflare's script loads only once
 * the visitor interacts with the form (`arm` on focus / pointer down / first
 * submit), never on a plain page view. `submit` sends at once when a token is
 * ready and otherwise waits for the widget; `waiting` is true meanwhile (keep
 * the button disabled) and `failed` once the wait gave up (show
 * `common.challenge.unavailable`). The server still fails closed without a
 * valid token. Test mode keeps the hidden e2e token; tokens are single-use, so
 * `reset` remounts the widget after each attempt.
 */
export function useLazyChallenge(config: LazyChallengeConfig) {
  const [controller] = useState(() => new LazyChallengeController(config));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const { testToken, siteKey } = config;

  useEffect(() => {
    controller.configure({ testToken, siteKey });
  }, [controller, testToken, siteKey]);
  useEffect(() => () => controller.dispose(), [controller]);

  const widgetKey = !testToken && siteKey && state.armed ? siteKey : null;
  return {
    token: state.token,
    /** A submit is held until the widget answers. */
    waiting: state.queued,
    /** The held submit was dropped because the widget did not answer. */
    failed: state.failed,
    /** The Cloudflare widget is mounted (a site key is configured and the form was touched). */
    widgetShown: widgetKey !== null,
    arm: controller.arm,
    submit: (send: Send) => controller.submit(send),
    reset: () => controller.reset(),
    field: (
      <>
        <input type="hidden" name="turnstileToken" value={state.token} readOnly />
        {widgetKey ? <TurnstileWidget key={state.attempt} siteKey={widgetKey} onToken={controller.onToken} /> : null}
      </>
    ),
  };
}

/**
 * The live line under a capture form while a submit waits for the widget, and
 * the retry message once the wait gave up. Renders nothing otherwise.
 */
export function ChallengeStatus({
  challenge,
  className,
}: {
  challenge: { waiting: boolean; failed: boolean };
  className?: string;
}) {
  if (challenge.waiting) {
    return <p role="status" className={`${className ?? ""} text-mid-2`} data-challenge-waiting>{common.challenge.waiting}</p>;
  }
  if (challenge.failed) {
    return <p role="alert" className={`${className ?? ""} text-error`} data-challenge-failed>{common.challenge.unavailable}</p>;
  }
  return null;
}
