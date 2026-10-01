"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { common } from "@/lib/copy/common";

export interface UiCarouselProps {
  /** Accessible name for the carousel region (from lib/copy). */
  label: string;
  children: ReactNode;
}

/**
 * Scroll-snap carousel (research 06 §13): prev/next buttons, ArrowLeft/Right
 * on the focused track, hidden scrollbar, smooth scrolling. The buttons exist
 * only while the track overflows, each is disabled at its end, and they sit
 * above the track's right edge — never over a card (QA T1-17). Positioned
 * absolutely, so their appearance after mount shifts nothing.
 */
export function UiCarousel({ label, children }: UiCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      setEdges({ prev: track.scrollLeft > 1, next: track.scrollLeft < max - 1 });
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(track);
    return () => {
      track.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

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

  const overflowing = edges.prev || edges.next;
  const buttonClasses =
    "flex h-11 w-11 items-center justify-center rounded-btn border border-light-1 bg-white text-xl text-dark-1 transition-colors hover:bg-light-3 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white";

  return (
    <div className="relative" role="region" aria-roledescription="carousel" aria-label={label}>
      {overflowing ? (
        <div className="absolute bottom-full right-0 mb-3 hidden gap-2 md:flex" data-carousel-controls>
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={!edges.prev}
            aria-label={common.actions.previous}
            className={buttonClasses}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={!edges.next}
            aria-label={common.actions.next}
            className={buttonClasses}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      ) : null}
      <div
        ref={trackRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        // overflow-x-auto clips vertically too: the padding gives the cards'
        // hover lift and shadow room, the negative margin keeps the layout
        className="-my-6 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}
