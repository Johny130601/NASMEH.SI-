"use client";

import { useState } from "react";
import { pdp as copy } from "@/lib/copy/pdp";

/**
 * The PDP quantity stepper (§6.8, §6.15): 1…max, minus disabled at 1, plus
 * disabled at the max the page computed (the per-line cap, and no more than
 * the stock can fill). Shared by the buy box and the sticky bar; each keeps
 * its own count. The figure pops on a change only — both controls sit in the
 * first viewport, where nothing animates on load (AGENTS §8.23).
 */
export function QuantityStepper({
  value,
  max,
  onChange,
  compact = false,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  /** The sticky bar's smaller buttons (two controls share a phone-wide row). */
  compact?: boolean;
}) {
  const [changed, setChanged] = useState(false);
  const change = (next: number) => {
    setChanged(true);
    onChange(next);
  };
  const size = compact ? "h-10 w-9" : "h-11 w-11";
  const button = `flex ${size} items-center justify-center rounded-btn text-lg text-dark-1 transition-colors hover:bg-light-3 disabled:pointer-events-none disabled:opacity-40`;
  return (
    <div className="inline-flex shrink-0 items-center rounded-btn border border-light-1">
      <button
        type="button"
        aria-label={copy.buyBox.decrease}
        disabled={value <= 1}
        onClick={() => change(Math.max(1, value - 1))}
        className={button}
      >
        −
      </button>
      <span aria-live="polite" className={`${compact ? "w-6" : "w-8"} text-center text-base font-medium text-dark-1`}>
        {/* keyed so each change pops the figure */}
        <span key={value} className={`inline-block ${changed ? "animate-pop" : ""}`}>{value}</span>
      </span>
      <button
        type="button"
        aria-label={copy.buyBox.increase}
        disabled={value >= max}
        onClick={() => change(Math.min(max, value + 1))}
        className={button}
      >
        +
      </button>
    </div>
  );
}
