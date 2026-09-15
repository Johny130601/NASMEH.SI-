import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Review finding U3: the sold-out "Obvestite me" form sent only the e2e test
 * token, so every real sign-up failed the fail-closed Turnstile check. It now
 * runs the same lazy challenge as the footer newsletter form, with the public
 * site key read from the server at runtime.
 */

const env = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn() }));
vi.mock("@/lib/email/mailer", () => ({ sendBackInStockVerification: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => env.value }));

import { backInStockChallengeAction } from "@/app/(storefront)/actions/backInStock";
import { BackInStockForm } from "@/components/storefront/catalog/ObvestiteMeButton";
import { CHALLENGE_TIMEOUT_MS, LazyChallengeController } from "@/components/storefront/chrome/useLazyChallenge";

const KEY = "0x4AAAAAAArestock";
const root = join(__dirname, "..", "..");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sold-out capture challenge", () => {
  it("hands the form the runtime site key, or null when none is configured", async () => {
    env.value = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: KEY, TURNSTILE_SECRET_KEY: "secret-never-returned" };
    expect(await backInStockChallengeAction()).toEqual({ siteKey: KEY });
    env.value = {};
    expect(await backInStockChallengeAction()).toEqual({ siteKey: null });
  });

  it("holds a submit made while the key is still loading, then waits for the widget's token", () => {
    const challenge = new LazyChallengeController({ testToken: null, siteKey: undefined });
    const send = vi.fn();
    challenge.submit(send);
    expect(challenge.getSnapshot().queued).toBe(true);

    challenge.configure({ testToken: null, siteKey: KEY });
    expect(send).not.toHaveBeenCalled();
    challenge.onToken("cf-restock-token");
    expect(send).toHaveBeenCalledWith("cf-restock-token");
  });

  it("sends a held submit when the key turns out to be absent, so the server answers", () => {
    const challenge = new LazyChallengeController({ testToken: null, siteKey: undefined });
    const send = vi.fn();
    challenge.submit(send);
    challenge.configure({ testToken: null, siteKey: null });
    expect(send).toHaveBeenCalledWith("");
    vi.advanceTimersByTime(CHALLENGE_TIMEOUT_MS);
    expect(challenge.getSnapshot().failed).toBe(false);
  });

  it("keeps the e2e token path: the hidden field carries it and no key is needed", () => {
    const html = renderToStaticMarkup(React.createElement(BackInStockForm, { productSlug: "belilni-trakci", testToken: "e2e-turnstile-token" }));
    expect(html).toContain('name="turnstileToken" value="e2e-turnstile-token"');
    expect(html).toContain("data-backinstock-form");
    const bare = renderToStaticMarkup(React.createElement(BackInStockForm, { productSlug: "belilni-trakci", testToken: null, siteKey: KEY }));
    expect(bare).toContain('name="turnstileToken" value=""');
    // The widget mounts only once the visitor touches the form.
    expect(bare).not.toContain("data-turnstile-widget");
  });

  it("submits the challenge token, never the test-token prop directly", () => {
    const source = readFileSync(join(root, "components", "storefront", "catalog", "ObvestiteMeButton.tsx"), "utf8");
    expect(source).toContain("useLazyChallenge(");
    expect(source).toContain("human.submit(");
    expect(source).not.toMatch(/turnstileToken:\s*testToken/);
  });
});
