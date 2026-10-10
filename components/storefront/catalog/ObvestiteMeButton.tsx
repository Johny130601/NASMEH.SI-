"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import {
  backInStockChallengeAction,
  subscribeBackInStockAction,
} from "@/app/(storefront)/actions/backInStock";
import { backInStock as copy } from "@/lib/copy/backInStock";
import { ChallengeStatus, useLazyChallenge } from "../chrome/useLazyChallenge";
import { UiButton } from "../ui/UiButton";
import { UiIcon } from "../ui/UiIcon";
import { UiInput } from "../ui/UiInput";
import { UiModal } from "../ui/UiModal";

/** "Obvestite me" button + capture modal (sold-out, spec §5/§6). */
export function ObvestiteMeButton({
  productSlug,
  testToken,
  siteKey,
  fullWidth = true,
  className = "",
}: {
  productSlug: string;
  testToken: string | null;
  /** Public Turnstile key when the page has it; omitted, the form fetches it when it opens. */
  siteKey?: string | null;
  fullWidth?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <UiButton
        variant="outline"
        fullWidth={fullWidth}
        className={className}
        onClick={() => setOpen(true)}
        data-notify-button={productSlug}
      >
        <UiIcon name="bell" className="h-4 w-4" />
        {copy.button}
      </UiButton>
      <UiModal open={open} onClose={() => setOpen(false)} title={copy.modalTitle}>
        <p className="mb-4 text-sm text-mid-1">{copy.body}</p>
        <BackInStockForm productSlug={productSlug} testToken={testToken} siteKey={siteKey} />
      </UiModal>
    </>
  );
}

/**
 * The site key the form's challenge uses: the prop when the page passed one,
 * otherwise fetched from the server once the form mounts (`undefined` while
 * loading, so a quick submit waits for it). Test mode needs no key.
 */
export function useBackInStockSiteKey(testToken: string | null, siteKey: string | null | undefined) {
  const [fetched, setFetched] = useState<string | null | undefined>(undefined);
  const needsFetch = !testToken && siteKey === undefined;
  useEffect(() => {
    if (!needsFetch) return;
    let active = true;
    backInStockChallengeAction()
      .then((result) => { if (active) setFetched(result.siteKey); })
      .catch(() => { if (active) setFetched(null); });
    return () => { active = false; };
  }, [needsFetch]);
  if (testToken) return null;
  return siteKey === undefined ? fetched : siteKey;
}

export function BackInStockForm({
  productSlug,
  testToken,
  siteKey,
}: {
  productSlug: string;
  testToken: string | null;
  siteKey?: string | null;
}) {
  const human = useLazyChallenge({ testToken, siteKey: useBackInStockSiteKey(testToken, siteKey) });
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    human.submit((turnstileToken) => {
      startTransition(async () => {
        try {
          const result = await subscribeBackInStockAction({ email, productSlug, turnstileToken });
          setMessage({ ok: result.ok, text: result.message });
          if (result.ok) setEmail("");
        } catch {
          setMessage({ ok: false, text: copy.genericError });
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
      className="flex flex-col gap-4"
      data-backinstock-form
    >
      <UiInput
        // own id: the modal is portaled after the footer, whose newsletter input is also named "email"
        id="back-in-stock-email"
        label={copy.emailLabel}
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {human.field}
      <UiButton type="submit" variant="primary" fullWidth disabled={pending || human.waiting}>
        {copy.submit}
      </UiButton>
      <ChallengeStatus challenge={human} className="text-sm" />
      <p className="text-xs text-mid-2">{copy.note}</p>
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-success" : "text-error"}`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
