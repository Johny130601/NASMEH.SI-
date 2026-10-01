"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { UiIcon } from "../ui/UiIcon";

/**
 * /trgovina sort menu: an SSR `<details>` of plain links (the sort lives in
 * the URL, so it works without JavaScript), upgraded after mount so the open
 * menu closes on a choice, on Escape and on a click outside — the way a menu
 * is expected to behave (QA T1-03). Nothing here changes what is rendered.
 */
export function SortMenu({
  label,
  current,
  children,
}: {
  label: string;
  /** The selected option's name, shown in the summary. */
  current: string;
  /** The `<ul>` of option links. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const close = () => {
      details.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.open) {
        close();
        details.querySelector("summary")?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (details.open && event.target instanceof Node && !details.contains(event.target)) close();
    };
    const onClick = (event: MouseEvent) => {
      // a choice is a link inside the list: the navigation carries the sort, the menu folds
      if (event.target instanceof Element && event.target.closest("a")) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    details.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      details.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <details ref={ref} className="group relative" data-sort-menu>
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-btn border border-light-1 bg-white px-4 text-sm text-dark-1 [&::-webkit-details-marker]:hidden">
        <span className="text-mid-2">{label}:</span>
        <span className="font-medium">{current}</span>
        <UiIcon
          name="chevron-down"
          className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      {children}
    </details>
  );
}
