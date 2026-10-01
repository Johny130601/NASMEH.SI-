import { db } from "@/lib/db";
import type { MenuItem } from "@/lib/settings";
import { DEFAULT_LEGAL_LINKS, LEGAL_LINK_KEYS } from "@/lib/settings-schemas";

/**
 * Storefront reads of the Menu rows beyond `getMenu` (lib/settings.ts): the footer needs a
 * menu's title as well as its items, and the chrome turns operator data into what the header
 * and footer show. The mapping helpers are pure and unit-tested (tests/unit/menus.test.ts).
 */

export async function getMenuWithTitle(handle: string): Promise<{ title: string; items: MenuItem[] }> {
  const row = await db.menu.findUnique({ where: { handle }, select: { title: true, items: true } });
  return { title: row?.title ?? "", items: Array.isArray(row?.items) ? (row.items as unknown as MenuItem[]) : [] };
}

/** A utility-bar entry; `account` marks the session-aware sign-in / account link. */
export interface UtilityMenuItem extends MenuItem {
  account?: boolean;
}

const ACCOUNT_PATHS = new Set(["/prijava", "/racun"]);

/**
 * The utility menu as the header and the drawer show it (QA M16): the operator's links in their
 * order, with the sign-in or account link — whatever the operator labelled it — replaced by the
 * session-aware account item ("Prijava" for a guest, "Moj račun" when signed in). The account
 * item is appended when the menu has none, so the account is always one click away.
 */
export function utilityMenuItems(items: MenuItem[], account: { label: string; href: string }): UtilityMenuItem[] {
  let placed = false;
  const result: UtilityMenuItem[] = [];
  for (const item of items) {
    if (typeof item?.label !== "string" || typeof item?.href !== "string") continue;
    if (ACCOUNT_PATHS.has(item.href.split(/[?#]/, 1)[0])) {
      if (!placed) result.push({ ...account, account: true });
      placed = true;
      continue;
    }
    result.push({ label: item.label, href: item.href, ...(item.color ? { color: item.color } : {}) });
  }
  return placed ? result : [...result, { ...account, account: true }];
}

/**
 * A footer column's heading (QA T7-F3): the menu's title as the operator named it. The seeded
 * title is the admin label of the handle ("Noga — Trgovina"), which is no storefront heading, so
 * it and an empty title keep the default heading from the copy.
 */
export function footerColumnTitle(storedTitle: string, adminLabel: string, fallback: string): string {
  const title = storedTitle.trim();
  return title && title !== adminLabel ? title : fallback;
}

/**
 * Footer links to the legal pages follow the `legal.links` mapping (QA T7-F21): an item that still
 * points at a default legal path is sent where the mapping now says, so a renamed terms page is
 * linked from the footer as it is from checkout. Other links are left as the operator set them.
 */
export function withLegalLinks(items: MenuItem[], links: Record<(typeof LEGAL_LINK_KEYS)[number], string>): MenuItem[] {
  const moved = new Map<string, string>();
  for (const key of LEGAL_LINK_KEYS) {
    if (links[key] && links[key] !== DEFAULT_LEGAL_LINKS[key]) moved.set(DEFAULT_LEGAL_LINKS[key], links[key]);
  }
  if (moved.size === 0) return items;
  return items.map((item) => {
    const target = typeof item?.href === "string" ? moved.get(item.href) : undefined;
    return target ? { ...item, href: target } : item;
  });
}
