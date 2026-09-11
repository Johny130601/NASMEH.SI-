"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { CONTENT_TEMPLATES, SHADOWED_SLUGS, contentPageSchema, isReservedSlug, pageSlugSchema, type ContentPageInput } from "@/lib/admin/cms-schemas";

export type PageActionResult = { ok: true; id?: string } | { ok: false; error: "invalid" | "not_found" | "slugTaken" | "slugReserved" | "protected" };

const idSchema = z.string().min(1).max(64);

function slugTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function refresh(slugs: string[], id?: string) {
  revalidatePath("/admin/strani");
  if (id) revalidatePath(`/admin/strani/${id}`);
  for (const slug of slugs) revalidatePath(`/${slug}`);
  revalidatePath("/sitemap.xml");
}

/** New pages start unpublished; a slug owned by a code route is refused. */
export async function createPageAction(input: { title: string; slug: string; template: string }): Promise<PageActionResult> {
  await requirePermission("content:manage");
  const parsed = z.object({ title: z.string().trim().min(1).max(160), slug: pageSlugSchema, template: z.enum(CONTENT_TEMPLATES) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (isReservedSlug(parsed.data.slug)) return { ok: false, error: "slugReserved" };
  try {
    const page = await db.contentPage.create({ data: { ...parsed.data, published: false, reviewed: false } });
    refresh([page.slug], page.id);
    return { ok: true, id: page.id };
  } catch (error) {
    if (slugTaken(error)) return { ok: false, error: "slugTaken" };
    throw error;
  }
}

export async function savePageAction(input: { pageId: string; page: ContentPageInput }): Promise<PageActionResult> {
  await requirePermission("content:manage");
  const parsed = z.object({ pageId: idSchema, page: contentPageSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const existing = await db.contentPage.findUnique({ where: { id: parsed.data.pageId }, select: { slug: true } });
  if (!existing) return { ok: false, error: "not_found" };
  if (parsed.data.page.slug !== existing.slug && isReservedSlug(parsed.data.page.slug)) return { ok: false, error: "slugReserved" };
  try {
    await db.contentPage.update({ where: { id: parsed.data.pageId }, data: parsed.data.page });
  } catch (error) {
    if (slugTaken(error)) return { ok: false, error: "slugTaken" };
    throw error;
  }
  refresh([existing.slug, parsed.data.page.slug], parsed.data.pageId);
  return { ok: true };
}

/** A page a static route renders (cookie policy, withdrawal, complaints) stays; unpublish it instead. */
export async function deletePageAction(input: { pageId: string }): Promise<PageActionResult> {
  await requirePermission("content:manage");
  const parsed = z.object({ pageId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const page = await db.contentPage.findUnique({ where: { id: parsed.data.pageId }, select: { slug: true } });
  if (!page) return { ok: false, error: "not_found" };
  if (SHADOWED_SLUGS.has(page.slug)) return { ok: false, error: "protected" };
  await db.contentPage.delete({ where: { id: parsed.data.pageId } });
  refresh([page.slug]);
  return { ok: true };
}
