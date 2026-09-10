import { Prisma } from "@prisma/client";
import { z } from "zod";

const componentSchema = z.object({
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().positive(),
});
const componentsSchema = z.array(componentSchema).min(1);

export interface InventoryItem {
  variantId: string | null;
  quantity: number;
  properties?: unknown;
}

/** One SKU may occur both directly and through several bundle snapshots. */
export function collectInventoryRequirements(items: InventoryItem[]) {
  const required = new Map<string, number>();
  let invalidSnapshot = items.length === 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      invalidSnapshot = true;
      continue;
    }
    const properties = item.properties;
    let components: z.infer<typeof componentSchema>[];
    if (properties && typeof properties === "object" && "bundleComponents" in properties) {
      const parsed = componentsSchema.safeParse(properties.bundleComponents);
      if (!parsed.success) {
        invalidSnapshot = true;
        continue;
      }
      components = parsed.data;
    } else if (item.variantId) {
      components = [{ variantId: item.variantId, quantity: 1 }];
    } else {
      invalidSnapshot = true;
      continue;
    }
    for (const component of components) {
      const quantity = (required.get(component.variantId) ?? 0) + component.quantity * item.quantity;
      if (!Number.isSafeInteger(quantity) || quantity > 2_147_483_647) {
        invalidSnapshot = true;
      } else {
        required.set(component.variantId, quantity);
      }
    }
  }
  return {
    deductions: [...required].map(([variantId, quantity]) => ({ variantId, quantity }))
      .sort((left, right) => left.variantId.localeCompare(right.variantId)),
    invalidSnapshot,
  };
}

/** Caller holds the order lock; sorted stock locks serialize competing carts. */
export async function deductOrderInventory(tx: Prisma.TransactionClient, items: InventoryItem[]) {
  const { deductions, invalidSnapshot } = collectInventoryRequirements(items);
  if (invalidSnapshot || deductions.length === 0) {
    return { ok: false as const, reason: "invalid_inventory_snapshot" };
  }
  const variants = await tx.$queryRaw<Array<{ id: string; stock: number; allowBackorder: boolean }>>(Prisma.sql`
    SELECT "id", "stock", "allowBackorder" FROM "Variant"
    WHERE "id" IN (${Prisma.join(deductions.map((line) => line.variantId))})
    ORDER BY "id" FOR UPDATE
  `);
  const stock = new Map(variants.map((variant) => [variant.id, variant.stock]));
  const backorder = new Set(variants.filter((variant) => variant.allowBackorder).map((variant) => variant.id));
  // Backorderable variants (§14.2) may go below zero; every other line must be covered.
  const insufficient = deductions.find((line) => !backorder.has(line.variantId) && (stock.get(line.variantId) ?? -1) < line.quantity);
  if (insufficient) return { ok: false as const, reason: `stockout:${insufficient.variantId}` };

  for (const line of deductions) {
    await tx.variant.update({
      where: { id: line.variantId },
      data: { stock: { decrement: line.quantity } },
    });
  }
  return { ok: true as const };
}
