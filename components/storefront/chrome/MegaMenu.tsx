"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { MenuItem } from "@/lib/settings";
import { chrome as copy } from "@/lib/copy";
import { UiIcon } from "../ui/UiIcon";

export interface FeaturedCardData {
  slug: string;
  title: string;
  href: string;
  imageUrl: string | null;
  imageAlt: string;
}

/** Shopping navigation with a full-width disclosure panel. Keyboard activation
 * uses Enter/Space; Escape closes the panel and restores its trigger. */
export function MegaMenu({ items, featuredCards }: { items: MenuItem[]; featuredCards: FeaturedCardData[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <nav
      ref={navRef}
      aria-label={copy.nav.menuLabel}
      className="hidden h-full min-w-0 md:ml-5 md:block lg:ml-12"
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          triggerRefs.current[open]?.focus();
          setOpen(null);
        }
      }}
      onBlur={event => { if (!navRef.current?.contains(event.relatedTarget as Node)) setOpen(null); }}
    >
      <ul className="flex h-full items-center gap-5 lg:gap-10">
        {items.map((item, index) => item.children?.length ? (
          <li key={item.label} className="flex h-full items-center">
            <button
              ref={element => { triggerRefs.current[item.label] = element; }}
              id={`${menuId}-trigger-${index}`}
              type="button"
              aria-expanded={open === item.label}
              aria-controls={`${menuId}-panel-${index}`}
              onClick={() => setOpen(open === item.label ? null : item.label)}
              className="flex h-full items-center gap-2 whitespace-nowrap text-sm font-medium uppercase tracking-[0.1em] text-dark-1 transition-colors hover:text-brand lg:text-base"
            >
              {item.label}
              <UiIcon name="chevron-down" className={`h-5 w-5 transition-transform duration-200 ${open === item.label ? "rotate-180" : ""}`} />
            </button>
            {open === item.label ? (
              <div
                id={`${menuId}-panel-${index}`}
                role="region"
                aria-labelledby={`${menuId}-trigger-${index}`}
                data-mega-panel
                className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-10rem)] overflow-y-auto border-b border-light-2 bg-light-4 shadow-xl"
              >
                <div className="mx-auto grid max-w-(--container-narrow) grid-cols-[minmax(9rem,0.7fr)_minmax(0,2fr)] gap-7 px-(--padding) py-10 lg:gap-12 lg:py-12">
                  <div>
                    <p className="mb-4 text-base font-semibold text-dark-1">{copy.nav.shopTitle}</p>
                    <ul className="flex flex-col gap-3.5">
                      {item.children.map(child => (
                        <li key={child.href + child.label}>
                          <Link href={child.href} onClick={() => setOpen(null)} className="text-sm leading-relaxed text-mid-1 transition-colors hover:text-dark-1 lg:text-base">
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {item.featured?.length ? (
                    <div className="grid grid-cols-2 items-start gap-5 lg:gap-8" aria-label={copy.nav.featuredLabel}>
                      {item.featured.slice(0, 2).map(slug => {
                        const card = featuredCards.find(candidate => candidate.slug === slug);
                        if (!card) return null;
                        return (
                          <Link key={slug} href={card.href} onClick={() => setOpen(null)} className="group min-w-0" data-featured-card={slug}>
                            <p className="mb-4 text-sm leading-relaxed text-mid-1 transition-colors group-hover:text-dark-1 lg:text-base">{card.title}</p>
                            <div className="aspect-[3/2] overflow-hidden bg-light-3">
                              {card.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={card.imageUrl} alt={card.imageAlt} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                              ) : null}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </li>
        ) : (
          <li key={item.label} className="flex h-full items-center">
            <Link
              href={item.href}
              onClick={() => setOpen(null)}
              className={`flex h-full items-center gap-2 whitespace-nowrap text-sm font-medium uppercase tracking-[0.1em] transition-colors lg:text-base ${item.color === "sale" ? "text-sale hover:opacity-80" : "text-dark-1 hover:text-brand"}`}
            >
              {item.color === "sale" ? <UiIcon name="discount" className="h-5 w-5" /> : null}
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
