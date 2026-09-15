import { getPriceReductions, type ReductionCandidate } from "@/lib/omnibus";

/**
 * I/O boundary for the pure coupon engine (AGENTS §8.4): marks each line the
 * storefront shows as reduced — the same history-backed Omnibus gate cards,
 * PDP and cart render (`getPriceReductions`, ONE batched query) — so the
 * coupon terms exclude exactly the products customers see as reduced, not
 * every compare-at. The server-side line hydration calls this before any
 * pricing, so the cart, the checkout quote and order creation share the flags.
 */
export async function withReducedFlags<Line extends ReductionCandidate>(
  lines: Line[],
  now = new Date(),
): Promise<Array<Line & { reduced: boolean }>> {
  const reductions = await getPriceReductions(lines, now);
  return lines.map((line) => ({ ...line, reduced: reductions.has(line.variantId) }));
}
