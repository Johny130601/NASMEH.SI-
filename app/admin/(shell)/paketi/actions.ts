"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { bundleSchema, type BundleInput } from "@/lib/admin/catalog";
import { changeVariantPriceInTx } from "@/lib/price-history";

export type BundleActionResult = { ok: true; id?: string } | { ok: false; error: "invalid" | "not_found" | "exists" | "self" | "nested" };

const idSchema = z.string().min(1).max(64);

function refresh(slug: string) {
  revalidatePath("/admin/paketi");
  revalidatePath(`/izdelek/${slug}`);
  revalidatePath("/trgovina");
  revalidatePath("/");
}

/** Turns an existing product into a bundle shell (price = its first variant); components come next. */
export async function createBundleAction(input: { productId: string }): Promise<BundleActionResult> {
  await requirePermission("catalog:manage");
  const parsed = z.object({ productId: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const product = await db.product.findUnique({ where: { id: parsed.data.productId }, include: { bundle: true, variants: { orderBy: { createdAt: "asc" }, take: 1 } } });
  if (!product || product.variants.length === 0) return { ok: false, error: "not_found" };
  if (product.bundle) return { ok: false, error: "exists" };
  await db.$transaction([
    db.bundle.create({ data: { productId: product.id, priceCents: product.variants[0].priceCents, active: false } }),
    db.variant.updateMany({ where: { productId: product.id }, data: { maxCartQuantity: 1 } }),
  ]);
  refresh(product.slug);
  return { ok: true, id: product.id };
}

/**
 * Components and price (§14.6): the bundle variant's price follows the bundle
 * price through the price-history helper; components may not be bundles
 * themselves and never the bundle product.
 */
export async function saveBundleAction(input: BundleInput): Promise<BundleActionResult> {
  await requirePermission("catalog:manage");
  const parsed = bundleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { productId, priceCents, active, items } = parsed.data;
  const product = await db.product.findUnique({ where: { id: productId }, include: { bundle: true, variants: { orderBy: { createdAt: "asc" } } } });
  if (!product?.bundle) return { ok: false, error: "not_found" };
  const variantIds = [...new Set(items.map((item) => item.variantId))];
  if (variantIds.length !== items.length) return { ok: false, error: "invalid" };
  const components = await db.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, productId: true, product: { select: { bundle: { select: { id: true } } } } } });
  if (components.length !== variantIds.length) return { ok: false, error: "invalid" };
  if (components.some((component) => component.productId === productId)) return { ok: false, error: "self" };
  if (components.some((component) => component.product.bundle)) return { ok: false, error: "nested" };
  await db.$transaction(async (tx) => {
    await tx.bundle.update({ where: { id: product.bundle!.id }, data: { priceCents, active } });
    await tx.bundleItem.deleteMany({ where: { bundleId: product.bundle!.id } });
    await tx.bundleItem.createMany({ data: items.map((item) => ({ bundleId: product.bundle!.id, variantId: item.variantId, quantity: item.quantity })) });
    for (const variant of product.variants) {
      await changeVariantPriceInTx(tx, { variantId: variant.id, priceCents });
      await tx.variant.update({ where: { id: variant.id }, data: { maxCartQuantity: 1 } });
    }
  });
  refresh(product.slug);
  return { ok: true };
}
