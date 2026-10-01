"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { common } from "@/lib/copy/common";
import { useDialogFocus } from "./useDialogFocus";

export interface UiModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Bottom-sheet modal (research 06 §12): sheet on mobile, centered ≥768px,
 * rising in on open. Esc closes, overlay click closes, focus moves into the
 * dialog on open, stays inside it (Tab cycles) and returns to the trigger on
 * close. Rendered through a portal on <body>: a trigger may sit inside a
 * transformed ancestor (a hovered product card lifts), which would otherwise
 * turn the fixed overlay into a box inside that ancestor.
 */
export function UiModal({ open, onClose, title, children }: UiModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, { onClose });

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-5"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative z-10 max-h-[85vh] w-full max-w-lg animate-sheet-in overflow-y-auto rounded-t-card bg-white p-6 shadow-xl outline-none md:rounded-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-2xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={common.actions.close}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-light-3 text-xl leading-none text-dark-1 transition-colors hover:bg-light-2"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
