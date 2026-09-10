import { Prisma } from "@prisma/client";

export interface StockChange {
  variantId: string;
  before: number;
  after: number;
  /** Confirmed, not-yet-notified restock subscriptions armed by this write. */
  armedAlerts: number;
}

function assertStock(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
}

async function lockVariant(tx: Prisma.TransactionClient, variantId: string) {
  const [locked] = await tx.$queryRaw<Array<{ id: string; stock: number; productId: string }>>(Prisma.sql`
    SELECT "id", "stock", "productId" FROM "Variant" WHERE "id" = ${variantId} FOR UPDATE
  `);
  if (!locked) throw new Error("variant_not_found");
  return locked;
}

/**
 * The single write path for stock INCREASES (general plan rule 13): locks the
 * variant, writes the quantity and, on a 0 → N transition, arms the confirmed,
 * not-yet-notified restock subscriptions in the same transaction. Sending
 * happens post-commit (lib/inventory/restock.ts) and the daily job retries.
 * `deductOrderInventory` remains the only decrement path for paid orders.
 */
export async function setVariantStockInTx(
  tx: Prisma.TransactionClient,
  variantId: string,
  stock: number,
): Promise<StockChange> {
  assertStock(stock, "stock");
  const locked = await lockVariant(tx, variantId);
  if (locked.stock !== stock) {
    await tx.variant.update({ where: { id: variantId }, data: { stock } });
  }
  let armedAlerts = 0;
  if (locked.stock <= 0 && stock > 0) {
    const armed = await tx.backInStockSubscription.updateMany({
      where: {
        status: "CONFIRMED",
        notifiedAt: null,
        alertPendingSince: null,
        OR: [{ variantId }, { variantId: null, productId: locked.productId }],
      },
      data: { alertPendingSince: new Date() },
    });
    armedAlerts = armed.count;
  }
  return { variantId, before: locked.stock, after: stock, armedAlerts };
}

/** Relative change through the same path; a negative result is refused. */
export async function adjustVariantStockInTx(
  tx: Prisma.TransactionClient,
  variantId: string,
  delta: number,
): Promise<StockChange> {
  if (!Number.isSafeInteger(delta)) throw new RangeError("delta must be an integer");
  const locked = await lockVariant(tx, variantId);
  return setVariantStockInTx(tx, variantId, locked.stock + delta);
}
