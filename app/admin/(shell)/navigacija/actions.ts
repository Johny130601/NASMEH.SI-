"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { MENU_HANDLES, menuItemsSchema, normaliseMenuItems, type MenuItemInput } from "@/lib/admin/cms-schemas";

export type MenuActionResult = { ok: true } | { ok: false; error: "invalid" };

/** Replaces a menu's item tree; the header, drawer and footer read it on every request. */
export async function saveMenuAction(input: { handle: string; title: string; items: MenuItemInput[] }): Promise<MenuActionResult> {
  await requirePermission("content:manage");
  const parsed = z.object({ handle: z.enum(MENU_HANDLES), title: z.string().trim().max(80), items: menuItemsSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const items = normaliseMenuItems(parsed.data.items);
  await db.menu.upsert({
    where: { handle: parsed.data.handle },
    create: { handle: parsed.data.handle, title: parsed.data.title, items },
    update: { title: parsed.data.title, items },
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin/navigacija");
  revalidatePath(`/admin/navigacija/${parsed.data.handle}`);
  return { ok: true };
}
