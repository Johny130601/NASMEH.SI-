import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * QA 2026-10-03: the activation page asks for the password chosen with the
 * account and says when the click also confirms the newsletter opt-in (T3-02);
 * the sign-in and registration pages show no disabled "coming soon" social
 * buttons until a provider is configured (t3 N4).
 */

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn() }));
vi.mock("@/lib/email/mailer", () => ({ sendVerifyAccountEmail: vi.fn(), sendResetPasswordEmail: vi.fn() }));

import { AuthShell } from "@/components/storefront/auth/AuthShell";
import { VerifyAccountForm } from "@/components/storefront/auth/VerifyAccountForm";
import { auth as copy } from "@/lib/copy/auth";

const token = "a".repeat(64);
const challenge = { testToken: "e2e", siteKey: null };
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("activation form", () => {
  it("asks for the account's password", () => {
    const html = renderToStaticMarkup(React.createElement(VerifyAccountForm, { token, newsletter: false, ...challenge }));
    expect(html).toMatch(/<input[^>]*type="password"[^>]*>/);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toContain(escape(copy.verify.passwordLabel));
    expect(html).toContain(escape(copy.verify.body));
  });

  it("says before the click when it also confirms the newsletter opt-in, and only then", () => {
    const withNewsletter = renderToStaticMarkup(React.createElement(VerifyAccountForm, { token, newsletter: true, ...challenge }));
    expect(withNewsletter).toContain("data-verify-newsletter");
    expect(withNewsletter).toContain(escape(copy.verify.newsletterNote));
    const without = renderToStaticMarkup(React.createElement(VerifyAccountForm, { token, newsletter: false, ...challenge }));
    expect(without).not.toContain("data-verify-newsletter");
  });
});

describe("auth shell", () => {
  it("renders no social row or divider without configured providers", () => {
    const html = renderToStaticMarkup(React.createElement(AuthShell, { title: "Prijava" } as React.ComponentProps<typeof AuthShell>, React.createElement("form")));
    expect(html).not.toContain("<button");
    expect(html).not.toContain(`>${copy.social.divider}<`);
    expect(html).not.toMatch(/Google|Facebook|kmalu/);
  });

  it("puts configured provider buttons above an \"Ali\" divider", () => {
    const html = renderToStaticMarkup(React.createElement(AuthShell, {
      title: "Prijava", social: React.createElement("button", { type: "button" }, copy.social.google),
    } as React.ComponentProps<typeof AuthShell>, React.createElement("form")));
    expect(html).toContain(copy.social.google);
    expect(html).toContain(`>${copy.social.divider}<`);
    expect(html.indexOf(copy.social.google)).toBeLessThan(html.indexOf("<form"));
  });
});
