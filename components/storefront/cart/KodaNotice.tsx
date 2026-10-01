"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cart } from "@/lib/copy/cart";

/** A /koda/{CODE} refusal: the code tried, when it was code-shaped enough to echo. */
export interface KodaRefusal {
  code: string | null;
}

/** The refusal names the code tried and, with another code active, says that one stays (QA C2-F2). */
export function kodaNoticeText(refusal: KodaRefusal, activeCode: string | null): string {
  return [
    refusal.code ? cart.koda.invalidCode(refusal.code) : cart.koda.invalid,
    activeCode && activeCode !== refusal.code ? cart.koda.keptActive(activeCode) : null,
  ].filter(Boolean).join(" ");
}

/** The address without the refusal's parameters, or null when it carries none. */
export function withoutKodaParams(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has("koda") && !url.searchParams.has("vnos")) return null;
  url.searchParams.delete("koda");
  url.searchParams.delete("vnos");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The one-time answer of /koda/{CODE} (QA C2-F2). The refusal arrives as query
 * parameters; once shown, the address is replaced through the App Router, so
 * the router's own URL, a reload, a later refresh and the back button all read
 * the cart without them. The replace re-renders the page without the refusal
 * and the notice keeps the one it showed (the page renders this component at
 * the same place either way, and search parameters never reset client state),
 * so the shopper still reads it until they leave the cart. The "stays active"
 * sentence follows the live code: removing that code drops the sentence.
 */
export function KodaNotice({ refusal, activeCode }: { refusal: KodaRefusal | null; activeCode: string | null }) {
  const router = useRouter();
  const [shown, setShown] = useState(refusal);
  // A new refusal (another /koda link while on the cart) replaces the one on screen.
  if (refusal && refusal.code !== shown?.code) setShown(refusal);

  const arrived = refusal !== null;
  useEffect(() => {
    if (!arrived) return;
    let target: string | null = null;
    try {
      target = withoutKodaParams(window.location.href);
    } catch {
      return;
    }
    if (target) router.replace(target, { scroll: false });
  }, [arrived, router]);

  if (!shown) return null;
  return (
    <p role="alert" className="mt-2 text-xs text-error" data-koda-notice>
      {kodaNoticeText(shown, activeCode)}
    </p>
  );
}
