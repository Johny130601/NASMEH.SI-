import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Omnibus (ZVPot) price-history path (AGENTS §5.6, §8.9):
 * EVERY Variant.priceCents change must go through here so a PriceHistory
 * row is appended in the SAME transaction as the price update.
 * The table is append-only — the announced reduction (struck prior price and
 * the "Najnižja cena v 30 dneh pred znižanjem" line) is computed from it.
 */

export interface PriceChangeInput {
  variantId: string;
  priceCents: number;
  compareAtPriceCents?: number | null;
}

/**
 * Applies a price change inside an existing transaction: records the NEW
 * price in PriceHistory and updates the Variant in the same tx.
 * No-op (no history row) when neither the price nor the compare-at changes.
 * A compare-at-only change is recorded as well — it switches the reduction
 * announcement on or off, which the audit trail keeps — and `priceReduction`
 * (lib/pricing) merges rows that keep the price, so such a row never poses as
 * a prior price. Switching the announcement on later than
 * OMNIBUS_ANNOUNCEMENT_GRACE_HOURS after the price change (or on again after it
 * was off) starts a new announcement, and the 30-day window is anchored there.
 */
export async function changeVariantPriceInTx(
  tx: Prisma.TransactionClient,
  { variantId, priceCents, compareAtPriceCents }: PriceChangeInput,
) {
  const variant = await tx.variant.findUniqueOrThrow({
    where: { id: variantId },
    select: { priceCents: true, compareAtPriceCents: true },
  });

  const priceChanged =
    variant.priceCents !== priceCents ||
    (compareAtPriceCents !== undefined &&
      variant.compareAtPriceCents !== compareAtPriceCents);

  if (!priceChanged) {
    return { priceRecorded: false as const };
  }

  await tx.priceHistory.create({
    data: {
      variantId,
      priceCents,
      compareAtPriceCents:
        compareAtPriceCents === undefined
          ? variant.compareAtPriceCents
          : compareAtPriceCents,
    },
  });

  await tx.variant.update({
    where: { id: variantId },
    data: {
      priceCents,
      ...(compareAtPriceCents !== undefined
        ? { compareAtPriceCents }
        : {}),
    },
  });

  return { priceRecorded: true as const };
}

/** Convenience wrapper: runs the price change in its own $transaction. */
export async function changeVariantPrice(
  prisma: PrismaClient,
  input: PriceChangeInput,
) {
  return prisma.$transaction((tx) => changeVariantPriceInTx(tx, input));
}

/**
 * Records the INITIAL price of a freshly created variant (seed/admin create).
 * Call inside the same transaction that creates the variant.
 */
export async function recordInitialPriceInTx(
  tx: Prisma.TransactionClient,
  { variantId, priceCents, compareAtPriceCents }: PriceChangeInput,
) {
  await tx.priceHistory.create({
    data: {
      variantId,
      priceCents,
      compareAtPriceCents: compareAtPriceCents ?? null,
    },
  });
}
