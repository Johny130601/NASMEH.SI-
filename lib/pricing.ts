/**
 * Money helpers (AGENTS §8.10): all money is integer cents, VAT-inclusive.
 * Never format currency inline in components — use these helpers.
 */

export const DEFAULT_VAT_RATE_PERCENT = 22; // SI standard rate (spec §2.2)

const eurFormatter = new Intl.NumberFormat("sl-SI", {
  style: "currency",
  currency: "EUR",
});

/** 3499 -> "34,99 €" */
export function formatEUR(cents: number): string {
  assertCents(cents);
  return eurFormatter.format(cents / 100);
}

export interface VatBreakdown {
  grossCents: number;
  netCents: number;
  taxCents: number;
  ratePercent: number;
}

/**
 * Exact VAT-included breakdown: gross = net + tax, in integer cents.
 * Net is derived by division and rounded half-up to the nearest cent;
 * tax is the remainder so net + tax always equals gross.
 */
export function vatBreakdown(
  grossCents: number,
  ratePercent: number = DEFAULT_VAT_RATE_PERCENT,
): VatBreakdown {
  assertCents(grossCents);
  if (!Number.isInteger(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new RangeError(`Invalid VAT rate: ${ratePercent}`);
  }
  const netCents = Math.round((grossCents * 100) / (100 + ratePercent));
  return {
    grossCents,
    netCents,
    taxCents: grossCents - netCents,
    ratePercent,
  };
}

/** "vključen DDV 22 %: 5,72 €" — checkout/invoice VAT line (spec §8.5). */
export function formatDdvLine(
  grossCents: number,
  ratePercent: number = DEFAULT_VAT_RATE_PERCENT,
): string {
  const { taxCents } = vatBreakdown(grossCents, ratePercent);
  return `vključen DDV ${ratePercent} %: ${formatEUR(taxCents)}`;
}

/** Sum helper for cart/order lines, still integer cents. */
export function sumCents(amounts: number[]): number {
  return amounts.reduce((total, cents) => {
    assertCents(cents);
    return total + cents;
  }, 0);
}

/** Unit-price anchor: round(price / quantity) in cents. */
export function unitPriceCents(priceCents: number, quantity: number): number {
  assertCents(priceCents);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError(`Invalid quantity for unit price: ${quantity}`);
  }
  return Math.round(priceCents / quantity);
}

/** "2,50 € na uporabo" — unit-price anchor label (spec §5/§6). */
export function formatUnitPrice(
  priceCents: number,
  quantity: number,
  unitLabel: string,
): string {
  return `${formatEUR(unitPriceCents(priceCents, quantity))} ${unitLabel}`;
}

/** Klarna/BNPL line: round(total / 3) in cents → "ali 3 obroka po 11,66 € s Klarna". */
export function klarnaInstallmentCents(totalCents: number): number {
  assertCents(totalCents);
  return Math.round(totalCents / 3);
}

export interface PriceHistoryPoint {
  priceCents: number;
  createdAt: Date;
}

/**
 * Omnibus (ZVPot, spec §9.2): lowest price in the previous ≥30 days BEFORE
 * the current price. Uses price history rows; the LATEST row (current price)
 * is excluded, rows older than the window don't count.
 * Returns null when there is nothing to compare → render no line (never
 * fabricate a reference price).
 */
export function lowestPriceInLast30Days(
  history: PriceHistoryPoint[],
  now: Date,
  windowDays = 30,
): number | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const [, ...prior] = sorted; // exclude the latest (current price)
  const windowStart = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = prior.filter(
    (point) => point.createdAt.getTime() >= windowStart,
  );
  if (inWindow.length === 0) return null;
  return Math.min(...inWindow.map((point) => point.priceCents));
}

export interface BundleSavings {
  valueCents: number;
  savingsCents: number;
  savingsPercent: number;
}

/**
 * Fixed-bundle savings (§6.6): sum of genuine current component prices vs
 * bundle price. Percent rounded to whole points; 0 when there is no saving.
 */
export function bundleSavings(
  componentPriceCents: number[],
  bundlePriceCents: number,
): BundleSavings {
  const valueCents = sumCents(componentPriceCents);
  assertCents(bundlePriceCents);
  const savingsCents = Math.max(0, valueCents - bundlePriceCents);
  const savingsPercent =
    valueCents > 0 ? Math.round((savingsCents / valueCents) * 100) : 0;
  return { valueCents, savingsCents, savingsPercent };
}

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Money must be integer cents, got: ${cents}`);
  }
}
