"use client";

import { useState, useTransition, type FormEvent } from "react";
import { subscribeNewsletterAction } from "@/app/(storefront)/actions/newsletter";
import { footer as copy } from "@/lib/copy/footer";
import { newsletter } from "@/lib/copy/newsletter";
import { markWelcomeSeen } from "@/lib/welcome-popup-flag";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { PrivacyNotice } from "../PrivacyNotice";
import { ChallengeStatus, useLazyChallenge } from "./useLazyChallenge";

/**
 * Footer double-opt-in capture form (§13.1) with Turnstile guard. The footer
 * is on every page, so the widget mounts only once the visitor interacts
 * with the form (focus, pointer down or the first submit, which then waits
 * for the token and sends itself, with the button disabled; if the widget
 * errors, expires or stays silent past the timeout the wait ends with a retry
 * message). Test mode uses the hidden e2e token; with no keys in development
 * the server allows and fails closed in production. A sign-up here also counts
 * as the session's welcome-popup interaction, so the popup does not ask for
 * the e-mail again in this tab (QA T7-F14).
 */
export function NewsletterForm({
  siteKey,
  testToken,
  privacyHref,
}: {
  siteKey: string | null;
  testToken: string | null;
  privacyHref: string;
}) {
  const human = useLazyChallenge({ siteKey, testToken });
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    // A submit made before the widget answered goes out as soon as it does.
    human.submit((turnstileToken) => {
      startTransition(async () => {
        try {
          const result = await subscribeNewsletterAction({ email, turnstileToken, source: "footer" });
          setMessage({ ok: result.ok, text: result.message });
          if (result.ok) {
            setEmail("");
            markWelcomeSeen();
          }
        } catch {
          setMessage({ ok: false, text: newsletter.genericError });
        } finally {
          human.reset();
        }
      });
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      onFocusCapture={human.arm}
      onPointerDownCapture={human.arm}
      data-newsletter-form
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex-1">
          <UiInput
            // Its own id: the footer is on every page, and a page form's "email" field
            // (sign-in, registration, /sledi) would otherwise take this label (QA 2026-09-30).
            id="newsletter-email"
            label={copy.newsletter.emailLabel}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <UiButton type="submit" variant="primary" disabled={pending || human.waiting}>
          {copy.newsletter.submit}
        </UiButton>
      </div>

      <div className={human.widgetShown ? "mt-3" : undefined}>{human.field}</div>
      <ChallengeStatus challenge={human} className="mt-3 text-sm" />

      <p className="mt-3 text-xs text-mid-2">{copy.newsletter.note}</p>
      <PrivacyNotice
        lead={copy.newsletter.privacyLead}
        link={copy.newsletter.privacyLink}
        href={privacyHref}
        className="mt-1 text-xs text-mid-2"
      />

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
