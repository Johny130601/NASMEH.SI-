"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

export interface RevealOptions {
  /**
   * "start" puts the element at the top of the view, under the sticky header;
   * "nearest" scrolls only as far as needed, so the form above it stays in view
   * for a correction.
   */
  block?: "start" | "nearest";
  /** Move focus to the element (it needs `tabIndex={-1}`); off for a transient line. */
  focus?: boolean;
}

/**
 * Brings an element that just appeared into view on mount — clear of the
 * sticky header, which is measured because it is taller from md up (marquee +
 * utility bar + nav) — and focuses it, so what changed is what the person sees
 * and what a screen reader reads next (WCAG 2.4.3, 3.3.1). Reduced motion
 * scrolls without animation. It runs once per mount: a caller that shows a new
 * answer in the same place remounts the element (a `key` per attempt).
 */
export function useRevealOnMount(ref: RefObject<HTMLElement | null>, { block = "start", focus = true }: RevealOptions = {}) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const header = document.querySelector<HTMLElement>("header.ui-header");
    if (header) element.style.scrollMarginTop = `${Math.ceil(header.getBoundingClientRect().height) + 16}px`;
    // "nearest" aligns a line below the fold with the bottom edge: leave it some air.
    element.style.scrollMarginBottom = "16px";
    element.scrollIntoView({ block, behavior: reduced ? "auto" : "smooth" });
    if (focus) element.focus({ preventScroll: true });
  }, [ref, block, focus]);
}

/**
 * Heading of a result that replaces (or lands under) a submitted form: on
 * mount it scrolls into view — under the sticky header — and takes focus, so
 * the confirmation with its reference, or the lookup's answer, is what the
 * person sees and what a screen reader announces next (WCAG 2.4.3, 3.3.1)
 * instead of whatever the page had scrolled to. Reduced motion scrolls
 * without animation.
 */
export function ResultHeading({ as: Tag = "h2", children, className = "", id }: {
  as?: "h2" | "h3" | "p";
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useRevealOnMount(ref);
  return (
    <Tag ref={ref as never} id={id} tabIndex={-1} className={`scroll-mt-28 outline-none ${className}`.trim()}>
      {children}
    </Tag>
  );
}
