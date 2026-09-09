import { sumCents, vatBreakdown } from "@/lib/pricing";
import type {
  CartLineInput,
  PricedCart,
  PricedLine,
  PromoSettings,
} from "./types";

const EMPTY_FLOOR_PERCENT = 5; // bar always looks "started" (research 03 §4)

/**
 * Pricing core (AGENTS §5.3, §8.4): (lines, settings, now) → pricedCart.
 * PURE — no I/O, no clock (`now` injected, reserved for coupon windows in
 * Phase 4). Prices come from variant snapshots the SERVER resolved — never
 * from the client.
 */
export function priceCart(
  lines: CartLineInput[],
  settings: PromoSettings,
  now: Date,
): PricedCart {
  void now; // coupon validity windows land in Phase 4

  const pricedLines: PricedLine[] = lines.map((line) => ({
    variantId: line.variantId,
    sku: line.sku,
    title: line.title,
    quantity: line.quantity,
    unitPriceCents: line.priceCents,
    compareAtPriceCents: line.compareAtPriceCents,
    lineTotalCents: line.priceCents * line.quantity,
    isBundle: line.isBundle,
    bundleComponents: line.bundleComponents ?? [],
  }));

  const itemCount = pricedLines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCents = sumCents(
    pricedLines.map((line) => line.lineTotalCents),
  );

  const threshold = settings.freeShippingThresholdCents;
  const reached = subtotalCents > 0 && subtotalCents >= threshold;
  const shippingCents =
    subtotalCents === 0 || reached ? 0 : settings.shippingCostCents;

  const remainingCents = reached || subtotalCents === 0 ? 0 : threshold - subtotalCents;
  const progressPercent =
    subtotalCents === 0
      ? EMPTY_FLOOR_PERCENT
      : reached
        ? 100
        : Math.max(
            EMPTY_FLOOR_PERCENT,
            Math.min(100, Math.round((subtotalCents / threshold) * 100)),
          );

  const totalCents = subtotalCents + shippingCents;
  const { taxCents } = vatBreakdown(totalCents, settings.vatRatePercent);

  return {
    lines: pricedLines,
    itemCount,
    subtotalCents,
    shippingCents,
    totalCents,
    vatCents: taxCents,
    freeShipping: { reached, remainingCents, progressPercent },
  };
}
