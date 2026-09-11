import Link from "next/link";
import type { ReactNode } from "react";
import { admin as copy } from "@/lib/copy";
import type { Permission, StaffRole } from "@/lib/admin/permissions";
import { logoutAction } from "@/app/(storefront)/prijava/actions";
import { AdminNav } from "./AdminNav";

type NavLabel = keyof typeof copy.shell.nav;

/** Sidebar entries with the permission that reveals them; null = every staff member. */
export const ADMIN_NAV: ReadonlyArray<{ href: string; label: NavLabel; permission: Permission | null }> = [
  { href: "/admin", label: "dashboard", permission: "dashboard:view" },
  { href: "/admin/narocila", label: "orders", permission: "orders:view" },
  { href: "/admin/stranke", label: "customers", permission: "customers:view" },
  { href: "/admin/podpora", label: "tickets", permission: "tickets:view" },
  { href: "/admin/izdelki", label: "products", permission: "catalog:manage" },
  { href: "/admin/kolekcije", label: "collections", permission: "catalog:manage" },
  { href: "/admin/paketi", label: "bundles", permission: "catalog:manage" },
  { href: "/admin/kuponi", label: "coupons", permission: "promos:manage" },
  { href: "/admin/ocene", label: "reviews", permission: "reviews:moderate" },
  { href: "/admin/vsebina", label: "content", permission: "content:manage" },
  { href: "/admin/strani", label: "pages", permission: "content:manage" },
  { href: "/admin/navigacija", label: "menus", permission: "content:manage" },
  { href: "/admin/mediji", label: "media", permission: "content:manage" },
  { href: "/admin/e-posta", label: "email", permission: "content:manage" },
  { href: "/admin/nastavitve", label: "settings", permission: "settings:manage" },
  { href: "/admin/ekipa", label: "team", permission: "staff:manage" },
  { href: "/admin/racun", label: "account", permission: null },
];

export function AdminShell({
  user,
  permissions,
  children,
}: {
  user: { name: string | null; email: string; role: StaffRole };
  permissions: Permission[];
  children: ReactNode;
}) {
  const items = ADMIN_NAV
    .filter((item) => item.permission === null || permissions.includes(item.permission))
    .map((item) => ({ href: item.href, label: copy.shell.nav[item.label] }));

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-light-2 bg-white lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="px-5 py-5">
          <Link href="/admin" className="text-base font-medium text-dark-1">{copy.shell.brand}</Link>
        </div>
        <AdminNav items={items} label={copy.shell.navLabel} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-light-2 bg-white px-5 py-3">
          <p className="text-sm text-mid-1">
            {copy.shell.signedInAs}{" "}
            <span className="font-medium text-dark-1">{user.name ?? user.email}</span>
            {" · "}
            <span className="rounded-btn bg-light-3 px-2.5 py-1 text-xs font-medium text-dark-1" data-role-pill>
              {copy.roles[user.role]}
            </span>
          </p>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-mid-1 underline underline-offset-4">{copy.shell.toStore}</Link>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-mid-1 underline underline-offset-4" data-admin-logout>
                {copy.shell.logout}
              </button>
            </form>
          </div>
        </header>
        <main id="content" className="flex-1 px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
