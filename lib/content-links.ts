import { db } from "@/lib/db";
import { PURCHASABLE_PRODUCT_WHERE, variantIsPurchasable, type PurchasableProduct } from "@/lib/cart/visibility";
import { siteUrl } from "@/lib/seo";
import type { HeroSlotSetting, MenuItem } from "@/lib/settings";

/**
 * Operator links to product pages (QA 2026-09-30, v-a). Menus, featured cards and the home and
 * marquee settings hold free-form hrefs, while a product page answers 404 for anything a shopper
 * cannot buy: a draft, an archived product, a hidden deal SKU or a withdrawn bundle
 * (lib/cart/visibility). The storefront drops or replaces such a link when it renders, so it never
 * links to a 404, and the admin names the links when they are saved.
 *
 * The pure helpers take the set of purchasable slugs; `purchasableSlugs` builds it with the same
 * `where` fragment the product page, the lists and the featured cards use.
 */

const PRODUCT_PATH = /^\/izdelek\/([^/?#]+)\/?(?:[?#]|$)/;

/** A same-site path, or the path of an absolute link on the store's own origin; null for anything else. */
function sitePath(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    return url.origin === new URL(siteUrl()).origin ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

/** The product slug a link names (`/izdelek/<slug>` with an optional trailing slash, query or hash); null for any other link. */
export function linkedProductSlug(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const path = sitePath(href.trim());
  const match = path ? PRODUCT_PATH.exec(path) : null;
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** The product slugs a list of links names, once each; other links and non-strings are skipped. */
export function productSlugsIn(hrefs: Iterable<unknown>): string[] {
  const slugs = new Set<string>();
  for (const href of hrefs) {
    const slug = linkedProductSlug(href);
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

/** True unless the link leads to a product page that answers 404. Links that are not product pages always pass. */
export function linkIsAvailable(href: unknown, purchasable: ReadonlySet<string>): boolean {
  const slug = linkedProductSlug(href);
  return slug === null || purchasable.has(slug);
}

/** Every link of a menu tree: the items and their dropdown children (featured slugs are not links). */
export function menuHrefs(items: ReadonlyArray<unknown>): string[] {
  const hrefs: string[] = [];
  for (const raw of items) {
    const item = raw as { href?: unknown; children?: unknown } | null;
    if (typeof item?.href === "string") hrefs.push(item.href);
    if (Array.isArray(item?.children)) {
      for (const child of item.children as Array<{ href?: unknown } | null>) if (typeof child?.href === "string") hrefs.push(child.href);
    }
  }
  return hrefs;
}

/**
 * A menu as the storefront shows it: dropdown children and featured slugs that name a product nobody
 * can buy are dropped, and so is an item that is itself such a link. With `dropdowns` (the header and
 * the mobile drawer) an item that keeps a dropdown keeps its label, since it renders as a button rather
 * than a link. The footer and the utility bar render every item as its own link and ignore children, so
 * they pass `dropdowns: false`: there an item that is itself a dead link is dropped whatever its
 * children. `purchasable` must cover the featured slugs as well as the linked ones.
 */
export function menuWithAvailableLinks(items: MenuItem[], purchasable: ReadonlySet<string>, { dropdowns = true }: { dropdowns?: boolean } = {}): MenuItem[] {
  const result: MenuItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      result.push(item);
      continue;
    }
    const children = Array.isArray(item.children) ? item.children.filter((child) => linkIsAvailable(child?.href, purchasable)) : undefined;
    const featured = Array.isArray(item.featured) ? item.featured.filter((slug) => typeof slug === "string" && purchasable.has(slug)) : undefined;
    const rendersAsDropdown = dropdowns && Boolean(children?.length);
    if (!rendersAsDropdown && !linkIsAvailable(item.href, purchasable)) continue;
    result.push({ ...item, ...(children ? { children } : {}), ...(featured ? { featured } : {}) });
  }
  return result;
}

/**
 * The hero as the home page renders it: a call to action that names an unavailable product leads to
 * the shop instead (the hero keeps its heading and button), and a promo line for one is not shown —
 * it would advertise what cannot be bought (AGENTS §8.23).
 */
export function heroWithAvailableLinks(hero: HeroSlotSetting, purchasable: ReadonlySet<string>): HeroSlotSetting {
  const next: HeroSlotSetting = { ...hero };
  if (!linkIsAvailable(hero.ctaHref, purchasable)) next.ctaHref = "/trgovina";
  if (hero.promoOverlayHref && !linkIsAvailable(hero.promoOverlayHref, purchasable)) {
    delete next.promoOverlayText;
    delete next.promoOverlayHref;
  }
  return next;
}

/** Of these slugs, the ones whose product page answers: one query, none for an empty list. */
export async function purchasableSlugs(slugs: Iterable<string>): Promise<Set<string>> {
  const list = [...new Set(slugs)];
  if (list.length === 0) return new Set();
  const rows = await db.product.findMany({ where: { slug: { in: list }, ...PURCHASABLE_PRODUCT_WHERE }, select: { slug: true } });
  return new Set(rows.map((row) => row.slug));
}

/** Why a product page answers 404, in the order the admin can fix it; null when the product can be bought. */
export type UnavailableReason = "unknown" | "draft" | "archived" | "hiddenDeal" | "bundleInactive";

export function unavailableReason(product: PurchasableProduct | null): UnavailableReason | null {
  if (!product) return "unknown";
  if (variantIsPurchasable(product)) return null;
  if (product.status === "DRAFT") return "draft";
  if (product.status === "ARCHIVED") return "archived";
  return product.hiddenDeal ? "hiddenDeal" : "bundleInactive";
}

/** The reason each of these slugs cannot be bought; a slug that can (a race with an edit) is left out. */
export async function unavailableReasons(slugs: Iterable<string>): Promise<Map<string, UnavailableReason>> {
  const list = [...new Set(slugs)];
  const reasons = new Map<string, UnavailableReason>();
  if (list.length === 0) return reasons;
  const rows = await db.product.findMany({
    where: { slug: { in: list } },
    select: { slug: true, status: true, hiddenDeal: true, bundle: { select: { active: true } } },
  });
  for (const slug of list) {
    const reason = unavailableReason(rows.find((row) => row.slug === slug) ?? null);
    if (reason) reasons.set(slug, reason);
  }
  return reasons;
}

export interface UnavailableLink {
  href: string;
  reason: UnavailableReason;
}

/**
 * The links among `hrefs` that lead to a product page answering 404, once each and in order, with
 * the reason. Validation uses the purchasable fragment; the reasons are read only when a link fails.
 */
export async function unavailableProductLinks(hrefs: Iterable<unknown>): Promise<UnavailableLink[]> {
  const links = [...new Set([...hrefs].filter((href): href is string => linkedProductSlug(href) !== null))];
  if (links.length === 0) return [];
  const purchasable = await purchasableSlugs(links.map((href) => linkedProductSlug(href)!));
  const dead = links.filter((href) => !linkIsAvailable(href, purchasable));
  if (dead.length === 0) return [];
  const reasons = await unavailableReasons(dead.map((href) => linkedProductSlug(href)!));
  return dead.flatMap((href) => {
    const reason = reasons.get(linkedProductSlug(href)!);
    return reason ? [{ href, reason }] : [];
  });
}

export interface UnavailableFeatured {
  slug: string;
  reason: UnavailableReason;
}

/**
 * A menu's product links and featured cards that lead to a product page answering 404, each with its
 * reason: one purchasable query for both, the reasons read only when something fails. The menu save
 * refuses such a featured card and stores such a link, and the menu editor names both on load from
 * this same check, so what it announces is what the next save does.
 */
export async function unavailableMenuTargets(
  hrefs: Iterable<unknown>,
  featuredSlugs: Iterable<string>,
): Promise<{ links: UnavailableLink[]; featured: UnavailableFeatured[] }> {
  const links = [...new Set([...hrefs].filter((href): href is string => linkedProductSlug(href) !== null))];
  const featured = [...new Set(featuredSlugs)];
  const purchasable = await purchasableSlugs([...featured, ...productSlugsIn(links)]);
  const deadFeatured = featured.filter((slug) => !purchasable.has(slug));
  const deadLinks = links.filter((href) => !linkIsAvailable(href, purchasable));
  const reasons = await unavailableReasons([...deadFeatured, ...productSlugsIn(deadLinks)]);
  return {
    links: deadLinks.flatMap((href) => {
      const reason = reasons.get(linkedProductSlug(href)!);
      return reason ? [{ href, reason }] : [];
    }),
    featured: deadFeatured.flatMap((slug) => {
      const reason = reasons.get(slug);
      return reason ? [{ slug, reason }] : [];
    }),
  };
}
