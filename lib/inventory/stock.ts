import { Prisma } from "@prisma/client";
import { isSoldOut, sellableStock, type StockedComponent } from "@/lib/bundle/availability";

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
 * not-yet-notified restock subscriptions in the same transaction — its own, and
 * those of every fixed bundle this variant's increase makes sellable again
 * (a bundle's stock is its components', lib/bundle/availability). Sending
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
  if (stock > locked.stock) armedAlerts += await armBundleAlerts(tx, variantId, locked.stock, stock);
  return { variantId, before: locked.stock, after: stock, armedAlerts };
}

/**
 * A component's increase can make the bundles it belongs to sellable again: a
 * fixed bundle that could fill nothing with this variant at `before` and can at
 * `after` arms its product's confirmed, not-yet-notified subscriptions, so the
 * "Obvestite me" a sold-out bundle offers is kept (QA 2026-09-29, M6). The
 * other components are read inside the same transaction; the job re-checks the
 * live availability before it mails (lib/jobs/restock-alerts.ts).
 */
async function armBundleAlerts(
  tx: Prisma.TransactionClient,
  variantId: string,
  before: number,
  after: number,
): Promise<number> {
  const bundles = await tx.bundle.findMany({
    where: { items: { some: { variantId } } },
    select: {
      productId: true,
      items: { select: { quantity: true, variant: { select: { id: true, stock: true, allowBackorder: true } } } },
      product: { select: { variants: { select: { stock: true, allowBackorder: true } } } },
    },
  });
  let armed = 0;
  for (const bundle of bundles) {
    const componentsAt = (stock: number): StockedComponent[] => bundle.items.map((item) => ({
      quantity: item.quantity,
      variant: item.variant.id === variantId ? { stock, allowBackorder: item.variant.allowBackorder } : item.variant,
    }));
    const sellableAt = (stock: number) =>
      bundle.product.variants.some((variant) => !isSoldOut(sellableStock(variant, { items: componentsAt(stock) })));
    if (sellableAt(before) || !sellableAt(after)) continue;
    const result = await tx.backInStockSubscription.updateMany({
      where: { status: "CONFIRMED", notifiedAt: null, alertPendingSince: null, productId: bundle.productId },
      data: { alertPendingSince: new Date() },
    });
    armed += result.count;
  }
  return armed;
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
