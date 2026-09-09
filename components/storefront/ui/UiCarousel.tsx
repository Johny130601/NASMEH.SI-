"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { common } from "@/lib/copy";

export interface UiCarouselProps {
  /** Accessible name for the carousel region (from lib/copy). */
  label: string;
  children: ReactNode;
}

/**
 * Scroll-snap carousel (research 06 §13): prev/next buttons, ArrowLeft/Right
 * on the focused track, hidden scrollbar, smooth scrolling.
 */
export function UiCarousel({ label, children }: UiCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollByPage = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({
      left: direction * track.clientWidth * 0.8,
      behavior: "smooth",
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollByPage(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollByPage(1);
    }
  };

  const buttonClasses =
    "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-btn border border-light-1 bg-white text-xl text-dark-1 shadow-sm transition-colors hover:bg-light-3 md:flex";

  return (
    <div className="relative" role="region" aria-roledescription="carousel" aria-label={label}>
      <div
        ref={trackRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => scrollByPage(-1)}
        aria-label={common.actions.previous}
        className={`${buttonClasses} left-2`}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        type="button"
        onClick={() => scrollByPage(1)}
        aria-label={common.actions.next}
        className={`${buttonClasses} right-2`}
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
