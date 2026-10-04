import type { TocEntry } from "@/lib/content/toc";
import { common } from "@/lib/copy/common";

/**
 * Class for the element whose <h2>s the table of contents links to: the
 * header is sticky (marquee + utility bar + nav), so a jump keeps the heading
 * below it instead of underneath it.
 */
export const TOC_TARGET_CLASS = "[&_h2]:scroll-mt-30 md:[&_h2]:scroll-mt-44";

/**
 * Table of contents of a legal page (spec §12.5 "legal w/ TOC", QA 2026-10-03
 * T1-04): plain fragment links to the ids `withHeadingIds` (lib/content/toc)
 * gave the body's <h2>s, server-rendered so it is in the initial HTML and works
 * without JavaScript. A body with fewer than two sections needs no list.
 */
export function LegalToc({ entries }: { entries: TocEntry[] }) {
  if (entries.length < 2) return null;
  return (
    <nav
      aria-labelledby="legal-toc-title"
      className="mt-6 rounded-card border border-light-2 bg-white p-4"
      data-legal-toc
    >
      <h2 id="legal-toc-title" className="text-sm font-medium text-dark-1">
        {common.toc.title}
      </h2>
      <ol className="mt-2 space-y-1.5 text-sm">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className="text-mid-1 underline underline-offset-2 transition-colors hover:text-dark-1"
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
