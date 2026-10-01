"use client";

import { useConsent } from "./ConsentProvider";
import { footer as copy } from "@/lib/copy/footer";

/** Footer "Nastavitve piškotkov" — reopens the CMP (spec §3.4). */
export function CmpOpenButton() {
  const { openBanner } = useConsent();
  return (
    <button
      type="button"
      onClick={openBanner}
      className="text-xs text-mid-2 underline underline-offset-2 transition-colors hover:text-dark-1"
    >
      {copy.cookieSettings}
    </button>
  );
}
