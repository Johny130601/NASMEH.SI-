import type { ReactNode } from "react";

export interface UiAccordionItem {
  title: string;
  content: ReactNode;
}

export interface UiAccordionProps {
  items: UiAccordionItem[];
}

/**
 * Accordion on native <details>/<summary> — SSR-safe, zero JS,
 * natively keyboard-navigable (Tab + Enter/Space).
 */
export function UiAccordion({ items }: UiAccordionProps) {
  return (
    <div className="divide-y divide-light-2 rounded-card border border-light-2 bg-white">
      {items.map((item, index) => (
        <details key={index} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-dark-1 [&::-webkit-details-marker]:hidden">
            {item.title}
            <span
              aria-hidden="true"
              className="text-xl font-light leading-none text-mid-2 transition-transform duration-200 group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="pt-3 text-sm leading-6 text-mid-1">{item.content}</div>
        </details>
      ))}
    </div>
  );
}
