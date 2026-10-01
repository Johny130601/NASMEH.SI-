"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { clearKodaAction } from "@/app/(storefront)/actions/koda";
import { cart } from "@/lib/copy/cart";
import { promo } from "@/lib/copy/promo";
import type { CouponType } from "@/lib/promo/coupons";
import { UiIcon } from "../ui/UiIcon";

/** Active-code pill in the cart summary (with terms sentence, §9.1; a free-shipping code has its own, QA T6-10). */
export function ActiveCodePill({ code, rejected = false, couponType = null }: { code: string; rejected?: boolean; couponType?: CouponType | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div data-active-code-pill>
      <div className="flex items-center justify-between gap-3 rounded-card border border-light-2 bg-light-4 px-4 py-3">
        <p className="text-sm text-dark-1">
          {rejected ? cart.koda.rejectedLabel : cart.koda.activeLabel}:{" "}
          <span className="font-medium" data-active-code>
            {code}
          </span>
        </p>
        <button
          type="button"
          aria-label={cart.koda.remove}
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
      <p className="mt-1 text-xs text-mid-2">{promo.termsFor(couponType)}</p>
    </div>
  );
}
