import { db } from "@/lib/db";
import {
  priceReduction,
  type PriceHistoryPoint,
  type PriceReduction,
} from "@/lib/pricing";

/**
 * Omnibus (ZVPot-1 / PID Art. 6a) lookup: the announced reduction for each
 * variant, computed from the PriceHistory compliance table (AGENTS §5.6) by
 * `priceReduction`. ONE batched query for every surface (cards, PDP, cart
 * lines). A variant missing from the map shows its plain price — no
 * strikethrough, no "Najnižja cena v 30 dneh pred znižanjem" line — and its
 * cart line stays eligible for coupons (lib/promo/reductions).
 */
export interface ReductionCandidate {
  variantId: string;
  priceCents: number;
  compareAtPriceCents: number | null;
}

export async function getPriceReductions(
  variants: ReductionCandidate[],
  now = new Date(),
): Promise<Map<string, PriceReduction>> {
  const reductions = new Map<string, PriceReduction>();
  // only an announced reduction needs its history
  const announced = variants.filter(
    (variant) =>
      variant.compareAtPriceCents !== null &&
      variant.compareAtPriceCents > variant.priceCents,
  );
  if (announced.length === 0) return reductions;

  const rows = await db.priceHistory.findMany({
    where: { variantId: { in: [...new Set(announced.map((variant) => variant.variantId))] } },
    select: { variantId: true, priceCents: true, compareAtPriceCents: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const historyByVariant = new Map<string, PriceHistoryPoint[]>();
  for (const row of rows) {
    const history = historyByVariant.get(row.variantId) ?? [];
    history.push(row);
    historyByVariant.set(row.variantId, history);
  }

  for (const variant of announced) {
    const reduction = priceReduction(variant, historyByVariant.get(variant.variantId) ?? [], now);
    if (reduction) reductions.set(variant.variantId, reduction);
  }
  return reductions;
}
