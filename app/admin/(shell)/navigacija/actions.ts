"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { featuredSlugs, MENU_HANDLES, menuItemsSchema, normaliseMenuItems, type MenuItemInput } from "@/lib/admin/cms-schemas";
import { menuHrefs, unavailableMenuTargets, type UnavailableLink, type UnavailableReason } from "@/lib/content-links";

export type MenuActionResult =
  | { ok: true; unavailableLinks?: UnavailableLink[] }
  | { ok: false; error: "invalid" | "featuredCount" }
  | { ok: false; error: "featuredUnknown"; slugs: string[]; reasons: UnavailableReason[] };

/**
 * Replaces a menu's item tree; the header, drawer and footer read it on every request. A featured
 * card must name a product a shopper can buy (QA T7-F4, v-a): the header renders only those — the
 * same `where` fragment decides both — so an unknown, draft, archived, hidden-deal or withdrawn-bundle
 * slug is refused with its reason instead of leaving an empty card slot. A link to such a product page
 * is stored (it shows again once the product is back on sale) and named in the answer, because the
 * storefront leaves it out until then.
 */
export async function saveMenuAction(input: { handle: string; title: string; items: MenuItemInput[] }): Promise<MenuActionResult> {
  await requirePermission("content:manage");
  const parsed = z.object({ handle: z.enum(MENU_HANDLES), title: z.string().trim().max(80), items: menuItemsSchema }).safeParse(input);
  if (!parsed.success) {
    // Too many featured cards on one item gets its own message: the generic one points at labels and links.
    const tooManyFeatured = parsed.error.issues.some((issue) =>
      issue.path.includes("featured") && (issue.message === "featured" || issue.code === "too_big"));
    return { ok: false, error: tooManyFeatured ? "featuredCount" : "invalid" };
  }
  const items = normaliseMenuItems(parsed.data.items);
  // The same check the editor runs on load (lib/admin/cms unavailableMenuLinks), so its warning matches this answer.
  const dead = await unavailableMenuTargets(menuHrefs(items), featuredSlugs(items));
  if (dead.featured.length) {
    return { ok: false, error: "featuredUnknown", slugs: dead.featured.map((entry) => entry.slug), reasons: dead.featured.map((entry) => entry.reason) };
  }
  await db.menu.upsert({
    where: { handle: parsed.data.handle },
    create: { handle: parsed.data.handle, title: parsed.data.title, items },
    update: { title: parsed.data.title, items },
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin/navigacija");
  revalidatePath(`/admin/navigacija/${parsed.data.handle}`);
  return dead.links.length ? { ok: true, unavailableLinks: dead.links } : { ok: true };
}
