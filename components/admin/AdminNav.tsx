"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminNavItem {
  href: string;
  label: string;
}

/** Permission-filtered sidebar; the current section is marked for assistive tech. */
export function AdminNav({ items, label }: { items: AdminNavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} data-admin-nav>
      <ul className="flex flex-wrap gap-1 px-3 pb-3 lg:flex-col">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "block rounded-btn px-3 py-2 text-sm transition-colors",
                  active ? "bg-dark-1 text-white" : "text-dark-1 hover:bg-light-3",
                ].join(" ")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
