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

/**
 * The shipping method quoted before checkout (PDP delivery copy): among the
 * methods that ship to `country`, the one charged at the cart's standard
 * shipping cost (Setting shipping.standardCostCents), else the cheapest one.
 * Null when no method ships there.
 */
export function standardShippingMethod<M extends { priceCents: number; countries: string[] }>(
  methods: M[],
  standardCostCents: number,
  country = "SI",
): M | null {
  const serving = methods.filter((method) => method.countries.includes(country));
  return (
    serving.find((method) => method.priceCents === standardCostCents) ??
    [...serving].sort((a, b) => a.priceCents - b.priceCents)[0] ??
    null
  );
}

export interface PriceHistoryPoint {
  priceCents: number;
  /** Compare-at recorded with the row; above the price = a reduction was announced. */
  compareAtPriceCents?: number | null;
  createdAt: Date;
}

export const OMNIBUS_WINDOW_DAYS = 30;
/**
 * A compare-at switched on at most this long after the price change counts as
 * announced together with it (price and compare-at saved in two steps). A
 * later announcement — or one switched on again after it was switched off —
 * starts at its own row: the 30-day window is anchored there, the current
 * price itself falls inside it and no reduction is shown. The admin priceHint
 * (lib/copy/admin.ts) states this value to the operator.
 */
export const OMNIBUS_ANNOUNCEMENT_GRACE_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ANNOUNCEMENT_GRACE_MS = OMNIBUS_ANNOUNCEMENT_GRACE_HOURS * HOUR_MS;

/** A stretch of time during which one price applied (from `start` until the next segment). */
interface PriceSegment {
  priceCents: number;
  start: number;
  /**
   * When the running announcement (compare-at above the price) was switched
   * on: the row of the latest off → on transition inside the segment. Null
   * while the segment's latest row carries no announcement, so a row that
   * switched it off is never swallowed by merging.
   */
  announcedSince: number | null;
}

function isAnnounced(point: PriceHistoryPoint): boolean {
  return (
    point.compareAtPriceCents !== undefined &&
    point.compareAtPriceCents !== null &&
    point.compareAtPriceCents > point.priceCents
  );
}

/**
 * History rows (in force by `now`) → consecutive price segments. A row that
 * repeats the price (a compare-at-only edit) is merged into the running
 * segment, so it can never pose as a prior price; the segment keeps when its
 * current announcement began, so switching the compare-at off and on again is
 * a new announcement.
 */
function priceSegments(history: PriceHistoryPoint[], now: Date): PriceSegment[] {
  const sorted = history
    .filter((point) => point.createdAt.getTime() <= now.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const segments: PriceSegment[] = [];
  for (const point of sorted) {
    const announced = isAnnounced(point);
    const at = point.createdAt.getTime();
    const last = segments[segments.length - 1];
    if (last && last.priceCents === point.priceCents) {
      if (!announced) last.announcedSince = null;
      else if (last.announcedSince === null) last.announcedSince = at;
      continue;
    }
    segments.push({ priceCents: point.priceCents, start: at, announcedSince: announced ? at : null });
  }
  return segments;
}

/**
 * When the segment's running announcement began for Omnibus purposes: the
 * price change itself when the compare-at came with it or within the grace
 * period (and was not switched off after that), otherwise the row that
 * switched it on. Null when the segment ends unannounced.
 */
function announcementStart(segment: PriceSegment): number | null {
  if (segment.announcedSince === null) return null;
  return segment.announcedSince - segment.start <= ANNOUNCEMENT_GRACE_MS
    ? segment.start
    : segment.announcedSince;
}

/** Announced from the price change on, without a break, up to the segment's latest row. */
function announcedThroughout(segment: PriceSegment): boolean {
  return announcementStart(segment) === segment.start;
}

function priorPriceFromSegments(segments: PriceSegment[], windowDays: number): number | null {
  if (segments.length === 0) return null;
  // Progressive reduction (PID Art. 6a(5); Slovenia's use of the option to be
  // confirmed by D4): while the step down was announced with the price change
  // and the higher price before it was announced throughout (never switched
  // off) up to the step, the run began there and the window is anchored at the
  // run's start.
  let first = segments.length - 1;
  while (
    first > 0 &&
    announcedThroughout(segments[first]) &&
    announcedThroughout(segments[first - 1]) &&
    segments[first - 1].priceCents > segments[first].priceCents
  ) {
    first -= 1;
  }

  // Anchor at the announcement: a compare-at switched on later than the grace
  // period after the price change moves the window forward, so the current
  // price (in force before the announcement) counts and cancels the reduction.
  // An unannounced segment keeps its price change as the anchor.
  const anchor = announcementStart(segments[first]) ?? segments[first].start;
  const windowStart = anchor - windowDays * DAY_MS;
  let lowest: number | null = null;
  for (let index = 0; index <= first; index += 1) {
    const segment = segments[index];
    const end = index === first ? anchor : segments[index + 1].start;
    // applied at some moment inside [windowStart, anchor): this keeps the price
    // already in force when the window opened
    if (end <= Math.max(windowStart, segment.start)) continue;
    lowest = lowest === null ? segment.priceCents : Math.min(lowest, segment.priceCents);
  }
  return lowest;
}

/**
 * Omnibus prior price (ZVPot-1 / PID Art. 6a, spec §9.2): the lowest price
 * applied during the 30 days BEFORE the current reduction started. The window
 * is anchored at the start of the announced reduction (or of an unbroken
 * progressive reduction), not at `now`, so the reference stays fixed while the
 * reduction runs; the price in force at the window start counts, and
 * compare-at-only rows that keep the announcement running do not move the
 * anchor. The reduction starts at the price change when the compare-at came
 * with it or within OMNIBUS_ANNOUNCEMENT_GRACE_HOURS; otherwise at the row
 * that switched the announcement on, and the current price then counts as a
 * price applied in the window. Rows created after `now` are ignored. Returns
 * null when no earlier price exists — never fabricate a reference price.
 */
export function omnibusPriorPriceCents(
  history: PriceHistoryPoint[],
  now: Date,
  windowDays = OMNIBUS_WINDOW_DAYS,
): number | null {
  return priorPriceFromSegments(priceSegments(history, now), windowDays);
}

export interface PriceReduction {
  /** Omnibus prior price: the struck-through figure and the 30-day line. */
  priorPriceCents: number;
  priceCents: number;
  /** Whole percent off the prior price, rounded down so it is never overstated. */
  percentOff: number;
}

/**
 * The ONE gate for announcing a reduction (strikethrough, "-X %", sale
 * styling) on every surface. The operator's compare-at only switches the
 * announcement on; the figures come from the price history. Returns null —
 * render the plain price — unless a reduction is announced, the history ends
 * at the variant's current price with the announcement on (anything else was
 * written outside lib/price-history and cannot vouch for the display), and
 * the prior price exists and is higher — which it never is when the
 * announcement began later than the grace period after the price change.
 */
export function priceReduction(
  variant: { priceCents: number; compareAtPriceCents: number | null },
  history: PriceHistoryPoint[],
  now: Date,
  windowDays = OMNIBUS_WINDOW_DAYS,
): PriceReduction | null {
  assertCents(variant.priceCents);
  if (variant.compareAtPriceCents === null || variant.compareAtPriceCents <= variant.priceCents) {
    return null;
  }
  const segments = priceSegments(history, now);
  const current = segments[segments.length - 1];
  // a history that does not end at the live price cannot vouch for it
  if (!current || current.priceCents !== variant.priceCents || current.announcedSince === null) return null;
  const priorPriceCents = priorPriceFromSegments(segments, windowDays);
  if (priorPriceCents === null || priorPriceCents <= variant.priceCents) return null;
  return {
    priorPriceCents,
    priceCents: variant.priceCents,
    percentOff: Math.floor(((priorPriceCents - variant.priceCents) * 100) / priorPriceCents),
  };
}

export interface BundleSavings {
  valueCents: number;
  savingsCents: number;
  savingsPercent: number;
}

/**
 * Fixed-bundle savings (§6.6): sum of genuine current component prices vs
 * bundle price. Percent rounded to whole points; 0 when there is no saving.
 * This compares the bundle with buying its components separately today; it
 * is not a price reduction measured against PriceHistory (no Omnibus prior
 * price applies), and its legal classification is a D4 question.
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
