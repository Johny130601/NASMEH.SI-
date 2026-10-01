"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { CONTENT_TEMPLATES, contentPageSchema, isReservedSlug, pageSlugSchema, protectedPageSlugs, type ContentPageInput } from "@/lib/admin/cms-schemas";
import { getLegalLinks } from "@/lib/settings";
import { sanitizeContentHtml } from "@/lib/security/html-sanitizer";

/** `reviewCleared`: the save changed the text, so the legal-review mark it asked for was not stored. */
export type PageActionResult =
  | { ok: true; id?: string; reviewCleared?: true }
  | { ok: false; error: "invalid" | "not_found" | "slugTaken" | "slugReserved" | "protected" };

const idSchema = z.string().min(1).max(64);

/** Read at action time: `legal.links` can point a legal link at another page without a deploy. */
async function isProtectedSlug(slug: string): Promise<boolean> {
  return protectedPageSlugs(Object.values(await getLegalLinks())).has(slug);
}

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
  // Stored exactly as the storefront renders it: the body is operator HTML on the same origin as /admin (AGENTS §8.24).
  const page = { ...parsed.data.page, body: sanitizeContentHtml(parsed.data.page.body) };
  const existing = await db.contentPage.findUnique({ where: { id: parsed.data.pageId }, select: { slug: true, title: true, body: true, template: true } });
  if (!existing) return { ok: false, error: "not_found" };
  // A protected page keeps the slug it has now (checking only the new slug let a rename escape the guard) and,
  // once LEGAL, the template whose draft notice stands until the legal review.
  const leavesGuard = page.slug !== existing.slug || (existing.template === "LEGAL" && page.template !== "LEGAL");
  if (leavesGuard && await isProtectedSlug(existing.slug)) return { ok: false, error: "protected" };
  if (page.slug !== existing.slug && isReservedSlug(page.slug)) return { ok: false, error: "slugReserved" };
  // The legal-review mark belongs to the text that was reviewed: a save that changes the title, body or template
  // stores it unset, even when the same save ticks it; re-marking takes a later save of the unchanged text.
  const textChanged = page.title !== existing.title || page.body !== existing.body || page.template !== existing.template;
  const reviewCleared = textChanged && page.reviewed;
  try {
    await db.contentPage.update({ where: { id: parsed.data.pageId }, data: { ...page, reviewed: page.reviewed && !textChanged } });
  } catch (error) {
    if (slugTaken(error)) return { ok: false, error: "slugTaken" };
    throw error;
  }
  refresh([existing.slug, page.slug], parsed.data.pageId);
  return reviewCleared ? { ok: true, reviewCleared: true } : { ok: true };
}

/** Legal pages (static-route, fixed and `legal.links` slugs) stay; unpublish one instead. */
export async function deletePageAction(input: { pageId: string }): Promise<PageActionResult> {
  await requirePermission("content:manage");
  const parsed = z.object({ pageId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const page = await db.contentPage.findUnique({ where: { id: parsed.data.pageId }, select: { slug: true } });
  if (!page) return { ok: false, error: "not_found" };
  if (await isProtectedSlug(page.slug)) return { ok: false, error: "protected" };
  await db.contentPage.delete({ where: { id: parsed.data.pageId } });
  refresh([page.slug]);
  return { ok: true };
}
