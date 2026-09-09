"use client";

import { useState, useTransition, type FormEvent } from "react";
import { subscribeNewsletterAction } from "@/app/(storefront)/actions/newsletter";
import { footer as copy } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { TurnstileWidget } from "./TurnstileWidget";

/**
 * Footer double-opt-in capture form (§13.1) with Turnstile guard.
 * tokenMode: "widget" (real keys), "test" (hidden e2e token), "dev-open"
 * (no keys in development — server allows, fails closed in prod).
 */
export function NewsletterForm({
  siteKey,
  testToken,
}: {
  siteKey: string | null;
  testToken: string | null;
}) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(testToken ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await subscribeNewsletterAction({
        email,
        turnstileToken: token,
      });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setEmail("");
    });
  };

  return (
    <form onSubmit={onSubmit} data-newsletter-form>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex-1">
          <UiInput
            label={copy.newsletter.emailLabel}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <UiButton type="submit" variant="primary" disabled={pending}>
          {copy.newsletter.submit}
        </UiButton>
      </div>

      {siteKey ? (
        <div className="mt-3">
          <TurnstileWidget siteKey={siteKey} onToken={setToken} />
        </div>
      ) : (
        <input type="hidden" name="turnstileToken" value={token} readOnly />
      )}

      <p className="mt-3 text-xs text-mid-2">{copy.newsletter.note}</p>

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mt-3 text-sm ${message.ok ? "text-success" : "text-error"}`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
