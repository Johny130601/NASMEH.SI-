"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  applyKodaAction,
  clearKodaAction,
} from "@/app/(storefront)/actions/koda";
import { promo } from "@/lib/copy/promo";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { UiIcon } from "../ui/UiIcon";

/** Checkout discount field (§8.2): apply/remove with inline error states. */
export function DiscountField({
  activeCode,
  error,
}: {
  activeCode: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const apply = (event: FormEvent) => {
    event.preventDefault();
    setFailed(false);
    startTransition(async () => {
      const result = await applyKodaAction({ code });
      if (result.ok) {
        setCode("");
        router.refresh();
      } else {
        setFailed(true);
      }
    });
  };

  if (activeCode) {
    return (
      <div>
      <div className="flex items-center justify-between gap-3 rounded-card border border-light-2 bg-light-4 px-4 py-3">
        <p className="text-sm text-dark-1">
          {error ? promo.field.label : promo.applied}:{" "}
          <span className="font-medium" data-active-code>
            {activeCode}
          </span>
        </p>
        <button
          type="button"
          aria-label={promo.remove}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await clearKodaAction();
              router.refresh();
            })
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-light-3 text-dark-1 transition-colors hover:bg-light-2"
        >
          <UiIcon name="close" className="h-4 w-4" />
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-error" data-coupon-error>{error}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={apply} className="flex flex-col gap-2" data-discount-field>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <UiInput
            label={promo.field.label}
            name="koda"
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <UiButton type="submit" variant="outline" disabled={pending || !code.trim()}>
          {promo.field.apply}
        </UiButton>
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-error">
          {promo.errors.not_found}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-error" data-coupon-error>
          {error}
        </p>
      ) : null}
    </form>
  );
}
