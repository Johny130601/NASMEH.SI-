"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { MenuItem } from "@/lib/settings";
import { chrome as copy } from "@/lib/copy";
import { UiIcon } from "../ui/UiIcon";
import type { FeaturedCardData } from "./MegaMenu";

/**
 * Mobile drawer (<768px): hamburger → panel with accordion groups, featured
 * cards, colored sale link. Esc closes; focus stays inside until dismissed.
 */
export function MobileDrawer({
  items,
  featuredCards,
  utilityItems,
}: {
  items: MenuItem[];
  featuredCards: FeaturedCardData[];
  utilityItems: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), summary, [tabindex='0']") ?? []).filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label={copy.nav.openMenu}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-btn text-dark-1 transition-colors hover:bg-light-3"
      >
        <UiIcon name="menu" className="h-6 w-6" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="presentation" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label={copy.drawer.title}
            className="absolute inset-y-0 left-0 flex w-[25rem] max-w-[90vw] flex-col bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-light-2 px-5 py-4">
              <span className="text-lg font-medium text-dark-1">{copy.logo}</span>
              <button
                type="button"
                aria-label={copy.nav.closeMenu}
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-btn bg-light-3 text-dark-1 transition-colors hover:bg-light-2"
              >
                <UiIcon name="close" />
              </button>
            </div>

            <nav aria-label={copy.drawer.title} className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="flex flex-col">
                {items.map((item) =>
                  item.children?.length ? (
                    <li key={item.label} className="border-b border-light-3">
                      <details className="group py-4">
                        <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium uppercase tracking-[0.1em] text-dark-1 [&::-webkit-details-marker]:hidden">
                          {item.label}
                          <UiIcon
                            name="chevron-down"
                            className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                          />
                        </summary>
                        <ul className="flex flex-col gap-3 pb-2 pt-4">
                          {item.children.map((child) => (
                            <li key={child.href + child.label}>
                              <Link
                                href={child.href}
                                onClick={() => setOpen(false)}
                                className="text-sm text-mid-1 transition-colors hover:text-dark-1"
                              >
                                {child.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                        {item.featured?.length ? (
                          <div className="grid grid-cols-2 gap-3 pb-2 pt-3" aria-label={copy.drawer.featured}>
                            {item.featured.slice(0, 2).map((slug) => {
                              const card = featuredCards.find((c) => c.slug === slug);
                              if (!card) return null;
                              return (
                                <Link
                                  key={slug}
                                  href={card.href}
                                  onClick={() => setOpen(false)}
                                  className="min-w-0"
                                  data-featured-card={slug}
                                >
                                  <p className="mb-2 min-h-[2lh] text-xs leading-relaxed text-mid-1">{card.title}</p>
                                  <div className="aspect-[3/2] overflow-hidden bg-light-3">
                                    {card.imageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={card.imageUrl}
                                        alt={card.imageAlt}
                                        loading="lazy"
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        ) : null}
                      </details>
                    </li>
                  ) : (
                    <li key={item.label} className="border-b border-light-3">
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-1.5 py-4 text-base font-medium uppercase tracking-[0.1em] ${
                          item.color === "sale" ? "text-sale" : "text-dark-1"
                        }`}
                      >
                        {item.color === "sale" ? (
                          <UiIcon name="discount" className="h-5 w-5" />
                        ) : null}
                        {item.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>

            </nav>
            <nav aria-label={copy.utility.label} className="border-t border-light-2 bg-light-4 px-5 py-5">
              <ul className="flex flex-col gap-3">
                {utilityItems.map((item) => (
                  <li key={item.href + item.label}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="inline-flex min-h-10 items-center gap-2 text-sm text-mid-1 transition-colors hover:text-dark-1"
                    >
                      <UiIcon name="account" className="h-5 w-5" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
