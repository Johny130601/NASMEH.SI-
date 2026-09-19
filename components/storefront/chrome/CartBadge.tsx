"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cart count badge (research 06 §10 cart dot). It pops when the count
 * CHANGES — an add, a removal, a merge on login — and never on first paint:
 * an on-load animation in the first viewport is what §8.20 forbids, and the
 * count is server-rendered on every full page load.
 */
export function CartBadge({ count }: { count: number }) {
  const previous = useRef(count);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    if (previous.current === count) return;
    previous.current = count;
    setChanges((n) => n + 1);
  }, [count]);

  if (count <= 0) return null;

  return (
    // keyed by the change, so each one replays the pop from the start
    <span
      key={changes}
      data-cart-badge
      className={`absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-btn bg-brand px-1 text-xs font-medium leading-none text-white ${
        changes > 0 ? "animate-pop" : ""
      }`}
    >
      {count}
    </span>
  );
}
