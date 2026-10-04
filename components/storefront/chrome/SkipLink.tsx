import { common } from "@/lib/copy/common";

/** The storefront layout's <main> id: where the skip link lands. */
export const MAIN_CONTENT_ID = "content";

/**
 * The skip link's id. The consent banner hands focus here after a choice made
 * on the banner that opened with the page, when nothing else had focus to go
 * back to (QA 2026-10-03 T1-05).
 */
export const SKIP_LINK_ID = "skip-link";

/**
 * "Preskoči na vsebino" (WCAG 2.4.1, QA 2026-10-03): the first stop of the Tab
 * order, a plain fragment link to <main>, so it works before hydration and
 * without JavaScript. It sits above the viewport until it has keyboard focus
 * (`focus-visible`, so a script moving focus here after a mouse click does not
 * flash it) and then shows at once — no transition (AGENTS §8.23).
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      id={SKIP_LINK_ID}
      className="fixed left-(--padding) top-3 z-[60] -translate-y-[200%] rounded-btn bg-dark-1 px-6 py-3 text-sm font-medium text-white focus-visible:translate-y-0"
      data-skip-link
    >
      {common.skipToContent}
    </a>
  );
}
