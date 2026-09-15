import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHALLENGE_TIMEOUT_MS,
  LazyChallengeController,
} from "@/components/storefront/chrome/useLazyChallenge";

/**
 * Review finding U5: the lazy Turnstile used by the footer newsletter form, the
 * welcome popup and the sold-out capture held a submit silently and forever
 * when the widget never produced a token. The controller behind
 * useLazyChallenge now ends the wait on a widget error or expiry and after a
 * timeout, and reports `failed` so the form shows a retry message.
 */

const KEY = "0x4AAAAAAAunit";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function controller(config: { testToken: string | null; siteKey: string | null | undefined }) {
  const challenge = new LazyChallengeController(config);
  const renders = vi.fn();
  challenge.subscribe(renders);
  return { challenge, renders, state: () => challenge.getSnapshot() };
}

describe("lazy challenge submit queue", () => {
  it("sends the e2e token at once and needs no widget in test mode", () => {
    const { challenge, state } = controller({ testToken: "e2e-turnstile-token", siteKey: KEY });
    const send = vi.fn();
    challenge.submit(send);
    expect(send).toHaveBeenCalledWith("e2e-turnstile-token");
    expect(state()).toMatchObject({ queued: false, failed: false, armed: true });
  });

  it("without a configured key sends at once and lets the server decide", () => {
    const { challenge } = controller({ testToken: null, siteKey: null });
    const send = vi.fn();
    challenge.submit(send);
    expect(send).toHaveBeenCalledWith("");
  });

  it("holds an early submit until the widget answers, then sends it once with that token", () => {
    const { challenge, state, renders } = controller({ testToken: null, siteKey: KEY });
    const send = vi.fn();
    challenge.submit(send);
    expect(send).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ queued: true, failed: false, armed: true });
    expect(renders).toHaveBeenCalled();

    // A double click while waiting is ignored instead of sending an empty token.
    const second = vi.fn();
    challenge.submit(second);
    expect(second).not.toHaveBeenCalled();

    challenge.onToken("cf-token");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("cf-token");
    expect(state()).toMatchObject({ token: "cf-token", queued: false, failed: false });
    vi.advanceTimersByTime(CHALLENGE_TIMEOUT_MS * 2);
    expect(state().failed).toBe(false);
  });

  it.each([
    ["the widget's error or expired callback", (challenge: LazyChallengeController) => challenge.onToken("")],
    ["no answer within the timeout (script blocked)", () => vi.advanceTimersByTime(CHALLENGE_TIMEOUT_MS)],
  ])("stops waiting on %s, reports the failure and lets the visitor retry", (_label, stall) => {
    const { challenge, state } = controller({ testToken: null, siteKey: KEY });
    const send = vi.fn();
    challenge.submit(send);
    vi.advanceTimersByTime(CHALLENGE_TIMEOUT_MS - 1);
    expect(state().queued).toBe(true);

    stall(challenge);
    expect(state()).toMatchObject({ queued: false, failed: true });
    expect(send).not.toHaveBeenCalled();
    // A late token does not fire the dropped submit, but it clears the message.
    challenge.onToken("late-token");
    expect(send).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ failed: false, token: "late-token" });

    // The retry sends at once with the token the widget now holds.
    const retry = vi.fn();
    challenge.submit(retry);
    expect(retry).toHaveBeenCalledWith("late-token");
  });

  it("a retry without a token waits again and fails again rather than hanging", () => {
    const { challenge, state } = controller({ testToken: null, siteKey: KEY });
    challenge.submit(vi.fn());
    vi.advanceTimersByTime(CHALLENGE_TIMEOUT_MS);
    expect(state().failed).toBe(true);
    const retry = vi.fn();
    challenge.submit(retry);
    expect(state()).toMatchObject({ queued: true, failed: false });
    vi.advanceTimersByTime(CHALLENGE_TIMEOUT_MS);
    expect(state()).toMatchObject({ queued: false, failed: true });
    expect(retry).not.toHaveBeenCalled();
  });

  it("reset drops the used token and remounts the widget; dispose cancels a pending wait", () => {
    const { challenge, state } = controller({ testToken: null, siteKey: KEY });
    challenge.onToken("used");
    challenge.reset();
    expect(state()).toMatchObject({ token: "", attempt: 1 });

    const send = vi.fn();
    challenge.submit(send);
    challenge.dispose();
    vi.advanceTimersByTime(CHALLENGE_TIMEOUT_MS);
    challenge.onToken("after-unmount");
    expect(send).not.toHaveBeenCalled();
  });
});
