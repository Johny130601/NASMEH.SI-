"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

export interface DialogFocusOptions {
  /** Called on Escape. */
  onClose?: () => void;
  /** The element that receives focus on open; the container itself when absent or hidden. */
  initial?: () => HTMLElement | null | undefined;
  /** Where focus returns on close; the element focused at open time when absent. */
  returnTo?: RefObject<HTMLElement | null>;
}

/**
 * Focus behaviour of an `aria-modal` dialog (modal, search overlay, welcome
 * popup): focus moves into the container on open, Tab and Shift+Tab cycle
 * through the visible controls inside it, Escape closes it, and focus goes
 * back to the opener when it closes (WAI-ARIA dialog pattern, WCAG 2.4.3).
 * Callbacks are read through refs so the trap is installed once per opening.
 */
export function useDialogFocus(open: boolean, containerRef: RefObject<HTMLElement | null>, options: DialogFocusOptions = {}) {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (latest.current.onClose) {
          event.preventDefault();
          latest.current.onClose();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables();
      if (!list.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && container.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const initial = latest.current.initial?.();
    (initial && initial.getClientRects().length > 0 ? initial : container).focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const target = latest.current.returnTo?.current ?? opener;
      if (target?.isConnected) target.focus();
    };
  }, [open, containerRef]);
}
