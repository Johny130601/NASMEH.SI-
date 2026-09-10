import { db } from "@/lib/db";
import { sendPendingRestockAlerts } from "@/lib/jobs/restock-alerts";
import { setVariantStockInTx, type StockChange } from "./stock";

/**
 * Operator entry point (Phase 7 product form, maintenance scripts, tests):
 * one transaction, then a best-effort alert flush. A flush failure never
 * loses the armed alerts; `POST /api/jobs/daily` retries them.
 */
export async function setVariantStock(variantId: string, stock: number): Promise<StockChange> {
  const change = await db.$transaction(
    (tx) => setVariantStockInTx(tx, variantId, stock),
    { maxWait: 10_000, timeout: 20_000 },
  );
  if (change.armedAlerts > 0) {
    try {
      await sendPendingRestockAlerts();
    } catch (error) {
      console.error("Restock alerts remain queued", error);
    }
  }
  return change;
}
