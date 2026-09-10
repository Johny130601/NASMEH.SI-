"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { collectionSchema, slugSchema, type CollectionInput } from "@/lib/admin/catalog";
import { InvalidMediaFile, prepareMediaImage, removeMediaImage, saveMediaImage } from "@/lib/admin/media";

export type CollectionActionResult = { ok: true; id?: string } | { ok: false; error: "invalid" | "not_found" | "slugTaken" | "media" };

const idSchema = z.string().min(1).max(64);

function slugTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function refresh(collectionId?: string) {
  revalidatePath("/admin/kolekcije");
  if (collectionId) revalidatePath(`/admin/kolekcije/${collectionId}`);
  revalidatePath("/trgovina");
}

export async function createCollectionAction(input: { title: string; slug: string }): Promise<CollectionActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ title: z.string().trim().min(1).max(120), slug: slugSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const collection = await db.collection.create({ data: { title: parsed.data.title, slug: parsed.data.slug, type: "MANUAL" } });
    refresh(collection.id);
    return { ok: true, id: collection.id };
  } catch (error) {
    if (slugTaken(error)) return { ok: false, error: "slugTaken" };
    throw error;
  }
}

export async function saveCollectionAction(input: { collectionId: string; fields: CollectionInput }): Promise<CollectionActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ collectionId: idSchema, fields: collectionSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    await db.collection.update({ where: { id: parsed.data.collectionId }, data: parsed.data.fields });
  } catch (error) {
    if (slugTaken(error)) return { ok: false, error: "slugTaken" };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return { ok: false, error: "not_found" };
    throw error;
  }
  refresh(parsed.data.collectionId);
  return { ok: true };
}

export async function deleteCollectionAction(input: { collectionId: string }): Promise<CollectionActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ collectionId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const collection = await db.collection.findUnique({ where: { id: parsed.data.collectionId } });
  if (!collection) return { ok: false, error: "not_found" };
  await db.collection.delete({ where: { id: collection.id } });
  await Promise.all([removeMediaImage(collection.bannerImage), removeMediaImage(collection.bannerImageMobile)]);
  refresh();
  return { ok: true };
}

/** Desktop or mobile banner upload; the previous managed file is removed. */
export async function uploadCollectionBannerAction(formData: FormData): Promise<CollectionActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ collectionId: idSchema, target: z.enum(["desktop", "mobile"]) })
    .safeParse({ collectionId: formData.get("collectionId"), target: formData.get("target") });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "media" };
  const collection = await db.collection.findUnique({ where: { id: parsed.data.collectionId } });
  if (!collection) return { ok: false, error: "not_found" };
  let buffer: Buffer;
  try {
    buffer = await prepareMediaImage(file, parsed.data.target === "desktop" ? 2400 : 1200);
  } catch (error) {
    if (error instanceof InvalidMediaFile) return { ok: false, error: "media" };
    throw error;
  }
  const url = await saveMediaImage("collections", collection.id, buffer);
  const field = parsed.data.target === "desktop" ? "bannerImage" : "bannerImageMobile";
  await db.collection.update({ where: { id: collection.id }, data: { [field]: url } });
  await removeMediaImage(collection[field]);
  refresh(collection.id);
  return { ok: true };
}

export async function removeCollectionBannerAction(input: { collectionId: string; target: "desktop" | "mobile" }): Promise<CollectionActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ collectionId: idSchema, target: z.enum(["desktop", "mobile"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const collection = await db.collection.findUnique({ where: { id: parsed.data.collectionId } });
  if (!collection) return { ok: false, error: "not_found" };
  const field = parsed.data.target === "desktop" ? "bannerImage" : "bannerImageMobile";
  await db.collection.update({ where: { id: collection.id }, data: { [field]: null } });
  await removeMediaImage(collection[field]);
  refresh(collection.id);
  return { ok: true };
}

export async function addCollectionProductAction(input: { collectionId: string; productId: string }): Promise<CollectionActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ collectionId: idSchema, productId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const [collection, product] = await Promise.all([
    db.collection.findUnique({ where: { id: parsed.data.collectionId }, select: { id: true } }),
    db.product.findUnique({ where: { id: parsed.data.productId }, select: { id: true } }),
  ]);
  if (!collection || !product) return { ok: false, error: "not_found" };
  await db.$transaction(async (tx) => {
    const last = await tx.collectionProduct.findFirst({ where: { collectionId: collection.id }, orderBy: { position: "desc" }, select: { position: true } });
    await tx.collectionProduct.upsert({
      where: { collectionId_productId: { collectionId: collection.id, productId: product.id } },
      create: { collectionId: collection.id, productId: product.id, position: (last?.position ?? -1) + 1 },
      update: {},
    });
  });
  refresh(collection.id);
  return { ok: true };
}

export async function removeCollectionProductAction(input: { collectionId: string; productId: string }): Promise<CollectionActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ collectionId: idSchema, productId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await db.collectionProduct.deleteMany({ where: { collectionId: parsed.data.collectionId, productId: parsed.data.productId } });
  refresh(parsed.data.collectionId);
  return { ok: true };
}

/** Manual merchandising order: positions renumbered 0..n-1 after the move. */
export async function moveCollectionProductAction(input: { collectionId: string; productId: string; direction: "up" | "down" }): Promise<CollectionActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ collectionId: idSchema, productId: idSchema, direction: z.enum(["up", "down"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await db.$transaction(async (tx) => {
    const rows = await tx.collectionProduct.findMany({ where: { collectionId: parsed.data.collectionId }, orderBy: { position: "asc" }, select: { productId: true } });
    const index = rows.findIndex((row) => row.productId === parsed.data.productId);
    if (index === -1) return;
    const target = parsed.data.direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return;
    const order = rows.map((row) => row.productId);
    [order[index], order[target]] = [order[target], order[index]];
    for (const [position, productId] of order.entries()) {
      await tx.collectionProduct.update({ where: { collectionId_productId: { collectionId: parsed.data.collectionId, productId } }, data: { position } });
    }
  });
  refresh(parsed.data.collectionId);
  return { ok: true };
}
