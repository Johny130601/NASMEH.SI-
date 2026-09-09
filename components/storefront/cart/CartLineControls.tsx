"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  removeCartLineAction,
  updateCartLineAction,
} from "@/app/(storefront)/actions/cart";
import { cart } from "@/lib/copy";

/** Cart line qty stepper (capped) + trash remove — client island. */
export function CartLineControls({
  variantId,
  quantity,
  maxQuantity,
}: {
  variantId: string;
  quantity: number;
  maxQuantity: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCapNote, setShowCapNote] = useState(false);

  const update = (next: number) => {
    if (next > maxQuantity) {
      setShowCapNote(true);
      return;
    }
    setShowCapNote(false);
    startTransition(async () => {
      await updateCartLineAction({ variantId, quantity: next });
      router.refresh();
    });
  };

  const remove = () => {
    startTransition(async () => {
      await removeCartLineAction({ variantId });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div
          className={`inline-flex items-center rounded-btn border border-light-1 ${pending ? "opacity-60" : ""}`}
        >
          <button
            type="button"
            aria-label={cart.line.decrease}
            disabled={quantity <= 1 || pending}
            onClick={() => update(quantity - 1)}
            className="flex h-10 w-10 items-center justify-center rounded-btn text-lg text-dark-1 transition-colors hover:bg-light-3 disabled:pointer-events-none disabled:opacity-40"
          >
            −
          </button>
          <span
            aria-live="polite"
            className="w-7 text-center text-sm font-medium text-dark-1"
          >
            {quantity}
          </span>
          <button
            type="button"
            aria-label={cart.line.increase}
            disabled={pending || quantity >= maxQuantity}
            onClick={() => update(quantity + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-btn text-lg text-dark-1 transition-colors hover:bg-light-3 disabled:pointer-events-none disabled:opacity-40"
          >
            +
          </button>
        </div>
        <button
          type="button"
          aria-label={cart.line.remove}
          onClick={remove}
          disabled={pending}
          className="flex h-10 w-10 items-center justify-center rounded-btn text-mid-2 transition-colors hover:bg-light-3 hover:text-error"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4.5 w-4.5">
            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7" />
          </svg>
        </button>
      </div>
      {showCapNote || quantity >= maxQuantity ? (
        <p className="text-xs text-warning" role="status">
          {cart.line.maxQuantity}
        </p>
      ) : null}
    </div>
  );
}
