import type { CSSProperties, ReactNode } from "react";

/**
 * The horizontal scroller of a wide admin table, with a visible cue that more
 * columns lie beyond the card's edge (QA 2026-10-03 T4-10: at 768 px whole
 * columns of the orders, customers, tickets and team tables sat off screen
 * with nothing showing it).
 *
 * CSS only, so the cue is right in the server-rendered HTML and needs no
 * measuring: two soft shadows fixed to the card's edges (`scroll` attachment)
 * show wherever the table continues past that edge, and two white covers that
 * travel with the table (`local` attachment) hide each shadow once that end of
 * the table is in view — a table that fits shows none. Static gradients from
 * the colour tokens; nothing animates. The region is focusable and named, so a
 * keyboard user can scroll it too (a column without a link is otherwise out of
 * reach); the shared focus ring in app/globals.css marks it.
 *
 * Shared by server pages and client components alike (no hooks, no copy import).
 */
const SCROLL_CUE: CSSProperties = {
  backgroundColor: "rgb(var(--white))",
  backgroundImage: [
    "linear-gradient(to right, rgb(var(--white)) 30%, rgba(var(--white), 0))",
    "linear-gradient(to left, rgb(var(--white)) 30%, rgba(var(--white), 0))",
    "linear-gradient(to right, rgba(var(--dark-1), 0.16), rgba(var(--dark-1), 0))",
    "linear-gradient(to left, rgba(var(--dark-1), 0.16), rgba(var(--dark-1), 0))",
  ].join(", "),
  backgroundPosition: "left center, right center, left center, right center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "2.5rem 100%, 2.5rem 100%, 1rem 100%, 1rem 100%",
  backgroundAttachment: "local, local, scroll, scroll",
};

export function AdminTableScroll({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={["overflow-x-auto rounded-card border border-light-2", className].filter(Boolean).join(" ")}
      style={SCROLL_CUE}
      data-table-scroll
    >
      {children}
    </div>
  );
}
