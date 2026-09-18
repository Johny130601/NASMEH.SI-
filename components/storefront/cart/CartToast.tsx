"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CART_ADDED_EVENT, type CartAddedDetail } from "@/lib/cart/added-event";
import { formatEUR } from "@/lib/pricing";
import { cart as copy } from "@/lib/copy";
import { UiIcon } from "../ui/UiIcon";
import { uiButtonClasses } from "../ui/UiButton";

const VISIBLE_MS = 5000;

/**
 * Confirmation card after an add to cart (research 04 §5 "where upsells
 * render", scandiweb add-to-cart practice): the item, its line, and the way to
 * the cart — anchored under the header near the cart icon, one card for every
 * button on the page, auto-dismissed after five seconds (paused while hovered
 * or focused, Esc closes). No drawer cart at P1 (§15): this confirms, the cart
 * page merchandises. The wrapper lets clicks through; only the card itself is
 * interactive.
 */
export function CartToast() {
  const pathname = usePathname();
  const [item, setItem] = useState<CartAddedDetail | null>(null);
  const [top, setTop] = useState(96);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const arm = useCallback(() => {
    clear();
    timer.current = window.setTimeout(() => setItem(null), VISIBLE_MS);
  }, []);
  const dismiss = useCallback(() => {
    clear();
    setItem(null);
  }, []);

  useEffect(() => {
    const onAdded = (event: Event) => {
      const detail = (event as CustomEvent<CartAddedDetail>).detail;
      const header = document.querySelector("header");
      setTop(Math.round(header?.getBoundingClientRect().bottom ?? 80) + 12);
      setItem(detail);
      arm();
    };
    window.addEventListener(CART_ADDED_EVENT, onAdded);
    return () => {
      window.removeEventListener(CART_ADDED_EVENT, onAdded);
      clear();
    };
  }, [arm]);

  useEffect(() => {
    if (!item) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [item, dismiss]);

  // The layout that hosts the card survives client-side navigation; the card must not.
  useEffect(() => {
    dismiss();
  }, [pathname, dismiss]);

  return (
    // The live region is always in the DOM (empty until an add), so assistive
    // technology announces the card when it arrives. A <section>, so the PDP's
    // `div.fixed` (the sticky buy bar) stays unambiguous.
    <section
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-(--padding) md:justify-end"
      style={{ top }}
      role="status"
      aria-live="polite"
      data-cart-toast-region
    >
      {item ? (
      <div
        key={item.at}
        className="pointer-events-auto w-full max-w-sm animate-toast-in rounded-card border border-light-2 bg-white p-4 shadow-card-hover"
        onMouseEnter={clear}
        onMouseLeave={arm}
        onFocusCapture={clear}
        onBlurCapture={arm}
        data-cart-toast
      >
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-success/15 text-success">
            <UiIcon name="check" className="h-4 w-4 animate-pop" />
          </span>
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" aria-hidden="true" className="h-14 w-14 shrink-0 rounded-card bg-light-3 object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-dark-1">{copy.toast.added}</p>
            <p className="truncate text-sm text-mid-1" data-cart-toast-title>{item.title}</p>
            <p className="text-xs text-mid-2">{copy.toast.line(item.quantity, formatEUR(item.priceCents))}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={copy.toast.close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn text-mid-2 transition-colors hover:bg-light-3 hover:text-dark-1"
          >
            <UiIcon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3">
          <Link href="/cart" onClick={dismiss} className={uiButtonClasses("primary", true, "!h-10 px-4 text-sm")} data-cart-toast-view>
            {copy.toast.view}
            <UiIcon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
      </div>
      ) : null}
    </section>
  );
}
