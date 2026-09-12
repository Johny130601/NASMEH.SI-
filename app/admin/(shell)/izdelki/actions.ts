"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import {
  buildCustomFields, lowStockSchema, MEDIA_KINDS, productBasicsSchema, productContentSchema, skuSchema, slugSchema, variantSchema,
  type ProductBasics, type ProductContent, type VariantInput,
} from "@/lib/admin/catalog";
import { InvalidMediaFile, prepareMediaImage, removeMediaImage, saveMediaImage } from "@/lib/admin/media";
import { setVariantStockInTx } from "@/lib/inventory/stock";
import { sendPendingRestockAlerts } from "@/lib/jobs/restock-alerts";
import { changeVariantPriceInTx, recordInitialPriceInTx } from "@/lib/price-history";

export type CatalogActionResult =
  | { ok: true; id?: string; armed?: number; sent?: number; failed?: number }
  | { ok: false; error: "invalid" | "not_found" | "slugTaken" | "skuTaken" | "extraJson" | "lastVariant" | "inBundle" | "media" | "noStock" };

const idSchema = z.string().min(1).max(64);

function uniqueViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
}

function refreshProduct(slug: string, previousSlug?: string) {
  revalidatePath("/admin/izdelki");
  revalidatePath("/admin");
  revalidatePath(`/izdelek/${slug}`);
  if (previousSlug && previousSlug !== slug) revalidatePath(`/izdelek/${previousSlug}`);
  revalidatePath("/trgovina");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
}

/** New products start as drafts with one variant at zero stock (rule 13: stock through the helper later). */
export async function createProductAction(input: { title: string; slug: string; sku: string; priceCents: number }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({
    title: z.string().trim().min(1).max(200), slug: slugSchema, sku: skuSchema, priceCents: z.number().int().min(0).max(10_000_000),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({ data: { title: parsed.data.title, slug: parsed.data.slug, status: "DRAFT" } });
      const variant = await tx.variant.create({
        data: { productId: created.id, title: parsed.data.title, sku: parsed.data.sku, priceCents: parsed.data.priceCents, stock: 0 },
      });
      await recordInitialPriceInTx(tx, { variantId: variant.id, priceCents: parsed.data.priceCents });
      return created;
    });
    refreshProduct(product.slug);
    return { ok: true, id: product.id };
  } catch (error) {
    if (uniqueViolation(error, "slug")) return { ok: false, error: "slugTaken" };
    if (uniqueViolation(error, "sku")) return { ok: false, error: "skuTaken" };
    throw error;
  }
}

export async function saveProductAction(input: { productId: string; basics: ProductBasics; content: ProductContent }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ productId: idSchema, basics: productBasicsSchema, content: productContentSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { productId, basics, content } = parsed.data;
  const customFields = buildCustomFields(content.merchandising);
  if (!customFields.ok) return { ok: false, error: "extraJson" };
  const existing = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (!existing) return { ok: false, error: "not_found" };
  try {
    await db.product.update({
      where: { id: productId },
      data: {
        ...basics,
        badges: content.badges as unknown as Prisma.InputJsonValue,
        customFields: customFields.value,
        accordions: content.accordions as unknown as Prisma.InputJsonValue,
        faq: content.faq as unknown as Prisma.InputJsonValue,
        education: content.education as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (uniqueViolation(error, "slug")) return { ok: false, error: "slugTaken" };
    throw error;
  }
  refreshProduct(basics.slug, existing.slug);
  return { ok: true };
}

/** Prices go through the price-history helper, stock through the stock helper (AGENTS §8.9, §8.13). */
export async function saveVariantAction(input: { productId: string; variantId: string | null; variant: VariantInput }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ productId: idSchema, variantId: idSchema.nullable(), variant: variantSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { productId, variantId, variant } = parsed.data;
  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (!product) return { ok: false, error: "not_found" };
  const fields = {
    title: variant.title, sku: variant.sku, costCents: variant.costCents, barcode: variant.barcode, weightGrams: variant.weightGrams,
    maxCartQuantity: variant.maxCartQuantity, allowBackorder: variant.allowBackorder, backorderNote: variant.backorderNote,
  };
  try {
    const armed = await db.$transaction(async (tx) => {
      let id = variantId;
      if (id) {
        const owned = await tx.variant.findFirst({ where: { id, productId }, select: { id: true } });
        if (!owned) throw new Error("not_found");
        await tx.variant.update({ where: { id }, data: fields });
      } else {
        const created = await tx.variant.create({ data: { productId, ...fields, priceCents: variant.priceCents, compareAtPriceCents: variant.compareAtPriceCents, stock: 0 } });
        await recordInitialPriceInTx(tx, { variantId: created.id, priceCents: variant.priceCents, compareAtPriceCents: variant.compareAtPriceCents });
        id = created.id;
      }
      if (variantId) {
        await changeVariantPriceInTx(tx, { variantId: id, priceCents: variant.priceCents, compareAtPriceCents: variant.compareAtPriceCents });
      }
      return (await setVariantStockInTx(tx, id, variant.stock)).armedAlerts;
    }, { maxWait: 10_000, timeout: 20_000 });
    if (armed > 0) {
      try { await sendPendingRestockAlerts(); } catch (error) { console.error("Restock alerts remain queued", error instanceof Error ? error.name : "unknown"); }
    }
    refreshProduct(product.slug);
    return { ok: true, armed };
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") return { ok: false, error: "not_found" };
    if (uniqueViolation(error, "sku")) return { ok: false, error: "skuTaken" };
    throw error;
  }
}

/** Order lines keep their snapshots (variant link nulled); subscriptions fall back to the product. */
export async function deleteVariantAction(input: { productId: string; variantId: string }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ productId: idSchema, variantId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const product = await db.product.findUnique({
    where: { id: parsed.data.productId },
    select: { slug: true, variants: { select: { id: true, _count: { select: { bundleItems: true } } } } },
  });
  const target = product?.variants.find((variant) => variant.id === parsed.data.variantId);
  if (!product || !target) return { ok: false, error: "not_found" };
  if (product.variants.length <= 1) return { ok: false, error: "lastVariant" };
  if (target._count.bundleItems > 0) return { ok: false, error: "inBundle" };
  await db.$transaction([
    db.backInStockSubscription.updateMany({ where: { variantId: target.id }, data: { variantId: null } }),
    db.variant.delete({ where: { id: target.id } }),
  ]);
  refreshProduct(product.slug);
  return { ok: true };
}

/** Multipart upload of up to four images for one media kind. */
export async function uploadProductMediaAction(formData: FormData): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({
    productId: idSchema, kind: z.enum(MEDIA_KINDS), alt: z.string().trim().max(200),
  }).safeParse({ productId: formData.get("productId"), kind: formData.get("kind"), alt: formData.get("alt") ?? "" });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0).slice(0, 4);
  if (files.length === 0) return { ok: false, error: "media" };
  const product = await db.product.findUnique({ where: { id: parsed.data.productId }, select: { slug: true, title: true } });
  if (!product) return { ok: false, error: "not_found" };
  const buffers: Buffer[] = [];
  try {
    for (const file of files) buffers.push(await prepareMediaImage(file));
  } catch (error) {
    if (error instanceof InvalidMediaFile) return { ok: false, error: "media" };
    throw error;
  }
  const saved: string[] = [];
  try {
    for (const buffer of buffers) {
      const url = await saveMediaImage("products", parsed.data.productId, buffer);
      saved.push(url);
      await db.$transaction(async (tx) => {
        const last = await tx.mediaImage.findFirst({ where: { productId: parsed.data.productId, kind: parsed.data.kind }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
        await tx.mediaImage.create({
          data: { productId: parsed.data.productId, kind: parsed.data.kind, url, alt: parsed.data.alt || product.title, sortOrder: (last?.sortOrder ?? -1) + 1 },
        });
      });
    }
  } catch (error) {
    await Promise.all(saved.map((url) => removeMediaImage(url)));
    throw error;
  }
  refreshProduct(product.slug);
  return { ok: true };
}

export async function updateMediaAction(input: { mediaId: string; alt: string; kind: string }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ mediaId: idSchema, alt: z.string().trim().max(200), kind: z.enum(MEDIA_KINDS) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const media = await db.mediaImage.findUnique({ where: { id: parsed.data.mediaId }, include: { product: { select: { slug: true } } } });
  if (!media) return { ok: false, error: "not_found" };
  await db.$transaction(async (tx) => {
    if (media.kind !== parsed.data.kind) {
      const last = await tx.mediaImage.findFirst({ where: { productId: media.productId, kind: parsed.data.kind }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      await tx.mediaImage.update({ where: { id: media.id }, data: { kind: parsed.data.kind, sortOrder: (last?.sortOrder ?? -1) + 1, alt: parsed.data.alt } });
    } else {
      await tx.mediaImage.update({ where: { id: media.id }, data: { alt: parsed.data.alt } });
    }
  });
  refreshProduct(media.product.slug);
  return { ok: true };
}

/** Swaps sort orders with a neighbour through a temporary value (unique index per kind). */
export async function moveMediaAction(input: { mediaId: string; direction: "up" | "down" }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ mediaId: idSchema, direction: z.enum(["up", "down"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const media = await db.mediaImage.findUnique({ where: { id: parsed.data.mediaId }, include: { product: { select: { slug: true } } } });
  if (!media) return { ok: false, error: "not_found" };
  const neighbour = await db.mediaImage.findFirst({
    where: { productId: media.productId, kind: media.kind, sortOrder: parsed.data.direction === "up" ? { lt: media.sortOrder } : { gt: media.sortOrder } },
    orderBy: { sortOrder: parsed.data.direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return { ok: true };
  await db.$transaction([
    db.mediaImage.update({ where: { id: media.id }, data: { sortOrder: -1 } }),
    db.mediaImage.update({ where: { id: neighbour.id }, data: { sortOrder: media.sortOrder } }),
    db.mediaImage.update({ where: { id: media.id }, data: { sortOrder: neighbour.sortOrder } }),
  ]);
  refreshProduct(media.product.slug);
  return { ok: true };
}

export async function deleteMediaAction(input: { mediaId: string }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ mediaId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const media = await db.mediaImage.findUnique({ where: { id: parsed.data.mediaId }, include: { product: { select: { slug: true } } } });
  if (!media) return { ok: false, error: "not_found" };
  await db.mediaImage.delete({ where: { id: media.id } });
  await removeMediaImage(media.url);
  refreshProduct(media.product.slug);
  return { ok: true };
}

/** "Send alert" (§14.2): re-arms confirmed, un-notified subscriptions when stock exists and flushes the queue. */
export async function sendRestockAlertsAction(input: { productId: string }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ productId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const product = await db.product.findUnique({ where: { id: parsed.data.productId }, select: { slug: true, status: true, variants: { select: { id: true, stock: true } } } });
  if (!product) return { ok: false, error: "not_found" };
  const stocked = product.variants.filter((variant) => variant.stock > 0).map((variant) => variant.id);
  if (product.status !== "ACTIVE" || stocked.length === 0) return { ok: false, error: "noStock" };
  const armed = await db.backInStockSubscription.updateMany({
    where: {
      productId: parsed.data.productId, status: "CONFIRMED", notifiedAt: null, alertPendingSince: null,
      OR: [{ variantId: null }, { variantId: { in: stocked } }],
    },
    data: { alertPendingSince: new Date() },
  });
  const result = await sendPendingRestockAlerts();
  refreshProduct(product.slug);
  return { ok: true, armed: armed.count, sent: result.sent, failed: result.failed };
}

export async function saveLowStockAction(input: { lowStockThreshold: number }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = lowStockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await db.setting.upsert({
    where: { key: "inventory.lowStockThreshold" },
    create: { key: "inventory.lowStockThreshold", value: parsed.data.lowStockThreshold },
    update: { value: parsed.data.lowStockThreshold },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/izdelki");
  return { ok: true };
}

export async function toggleCollectionProductAction(input: { productId: string; collectionId: string; member: boolean }): Promise<CatalogActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ productId: idSchema, collectionId: idSchema, member: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const product = await db.product.findUnique({ where: { id: parsed.data.productId }, select: { slug: true } });
  if (!product) return { ok: false, error: "not_found" };
  if (parsed.data.member) {
    await db.$transaction(async (tx) => {
      const last = await tx.collectionProduct.findFirst({ where: { collectionId: parsed.data.collectionId }, orderBy: { position: "desc" }, select: { position: true } });
      await tx.collectionProduct.upsert({
        where: { collectionId_productId: { collectionId: parsed.data.collectionId, productId: parsed.data.productId } },
        create: { collectionId: parsed.data.collectionId, productId: parsed.data.productId, position: (last?.position ?? -1) + 1 },
        update: {},
      });
    });
  } else {
    await db.collectionProduct.deleteMany({ where: { collectionId: parsed.data.collectionId, productId: parsed.data.productId } });
  }
  refreshProduct(product.slug);
  revalidatePath(`/admin/kolekcije/${parsed.data.collectionId}`);
  return { ok: true };
}
