"use client";

import { useLayoutEffect } from "react";

/**
 * Keeps the document title while mounted. The storefront 404 is rendered inside a
 * dynamic segment, and after hydration the router re-applied the layout's default
 * title over the not-found one ("Nasmeh.si" instead of "Strani ni mogoče najti |
 * Nasmeh.si", QA T1-15). The server title stays in the initial HTML; this only
 * restores it in the browser for as long as the page is shown.
 *
 * The observer never outlives the page: it is torn down in a layout effect (whose
 * cleanup runs inside the commit that removes the page, discarding queued records)
 * and it stops writing as soon as the URL is no longer the one it was mounted on,
 * so leaving the 404 (the CTA or the countdown's redirect) never puts this title
 * on the next page.
 */
export function DocumentTitle({ title }: { title: string }) {
  useLayoutEffect(() => {
    const path = window.location.pathname;
    const observer = new MutationObserver(() => apply());
    function apply() {
      if (window.location.pathname !== path) {
        observer.disconnect();
        return;
      }
      if (document.title !== title) document.title = title;
    }
    apply();
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
  return null;
}
