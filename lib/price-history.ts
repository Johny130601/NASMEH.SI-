import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Omnibus (ZVPot) price-history path (AGENTS §5.6, §8.9):
 * EVERY Variant.priceCents change must go through here so a PriceHistory
 * row is appended in the SAME transaction as the price update.
 * The table is append-only — the "Najnižja cena v zadnjih 30 dneh" line is
 * computed from it.
 */

export interface PriceChangeInput {
  variantId: string;
  priceCents: number;
  compareAtPriceCents?: number | null;
}

/**
 * Applies a price change inside an existing transaction: records the NEW
 * price in PriceHistory and updates the Variant in the same tx.
 * No-op (no history row) when the price is unchanged.
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
