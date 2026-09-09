"use client";

import { useState, useTransition, type FormEvent } from "react";
import { subscribeBackInStockAction } from "@/app/(storefront)/actions/backInStock";
import { backInStock as copy } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { UiModal } from "../ui/UiModal";

/** "Obvestite me" button + capture modal (sold-out, spec §5/§6). */
export function ObvestiteMeButton({
  productSlug,
  testToken,
  fullWidth = true,
}: {
  productSlug: string;
  testToken: string | null;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <UiButton
        variant="outline"
        fullWidth={fullWidth}
        onClick={() => setOpen(true)}
        data-notify-button={productSlug}
      >
        {copy.button}
      </UiButton>
      <UiModal open={open} onClose={() => setOpen(false)} title={copy.modalTitle}>
        <p className="mb-4 text-sm text-mid-1">{copy.body}</p>
        <BackInStockForm productSlug={productSlug} testToken={testToken} />
      </UiModal>
    </>
  );
}

export function BackInStockForm({
  productSlug,
  testToken,
}: {
  productSlug: string;
  testToken: string | null;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await subscribeBackInStockAction({
        email,
        productSlug,
        turnstileToken: testToken ?? "",
      });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setEmail("");
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" data-backinstock-form>
      <UiInput
        label={copy.emailLabel}
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <input type="hidden" name="turnstileToken" value={testToken ?? ""} readOnly />
      <UiButton type="submit" variant="primary" fullWidth disabled={pending}>
        {copy.submit}
      </UiButton>
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
