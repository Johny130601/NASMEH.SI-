import { db } from "@/lib/db";
import { lowestPriceInLast30Days } from "@/lib/pricing";

/**
 * Omnibus (ZVPot) lookup: lowest price in the previous ≥30 days before the
 * current price, computed from the PriceHistory compliance table (AGENTS §5.6).
 * Render the "Najnižja cena v zadnjih 30 dneh" line only when a reduction is
 * announced (compareAt > price) AND this returns a value.
 */
export async function getOmnibusLowestCents(
  variantId: string,
  now = new Date(),
): Promise<number | null> {
  const history = await db.priceHistory.findMany({
    where: { variantId },
    select: { priceCents: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return lowestPriceInLast30Days(history, now);
}
