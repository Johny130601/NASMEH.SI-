import Link from "next/link";

export interface UiMarqueeProps {
  /** The ONE config-driven message (from Setting marquee.text). */
  text: string;
  href?: string;
}

/**
 * Infinite CSS marquee (research 06 §13–14): brand-color bar, 10s loop,
 * duplicated track (second half aria-hidden), single accessible announcement,
 * honors prefers-reduced-motion (see globals.css). The text is dark on the
 * brand bar: white on brand measures 3:1 at 14 px, short of WCAG AA's 4.5:1
 * (Phase 9 step 2). The link carries the announcement as its name because
 * its visible track is hidden from assistive technology.
 */
export function UiMarquee({ text, href }: UiMarqueeProps) {
  const track = (
    <div className="ui-marquee__track" aria-hidden="true">
      {[0, 1].map((half) => (
        <span key={half} className="flex shrink-0 items-center py-2">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="mx-8 text-sm leading-6">
              {text}
            </span>
          ))}
        </span>
      ))}
    </div>
  );

  return (
    <div className="ui-marquee bg-brand text-dark-1" role="region" aria-label={text}>
      {href ? (
        <Link href={href} className="block" aria-label={text}>
          {track}
        </Link>
      ) : (
        track
      )}
    </div>
  );
}
