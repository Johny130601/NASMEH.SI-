"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createAccountAfterPurchaseAction } from "@/app/(storefront)/actions/checkout";
import { orders } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

/** Post-purchase account creation (§8.1). */
export function CreateAccountForm({ orderNumber }: { orderNumber: string }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAccountAfterPurchaseAction({
        orderNumber,
        password,
      });
      if (result.ok) {
        setDone(true);
      } else {
        const key = result.error as keyof typeof orders.confirmation.accountErrors | undefined;
        setError((key && orders.confirmation.accountErrors[key]) || orders.confirmation.accountErrors.account_failed);
      }
    });
  };

  if (done) {
    return (
      <p role="status" className="mt-3 text-sm text-success">
        {orders.confirmation.accountCreated}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3" data-create-account>
      <UiInput
        label={orders.confirmation.passwordLabel}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={error ?? undefined}
      />
      <UiButton type="submit" variant="outline" disabled={pending}>
        {orders.confirmation.createAccountCta}
      </UiButton>
    </form>
  );
}
