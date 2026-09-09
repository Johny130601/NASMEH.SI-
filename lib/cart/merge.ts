/**
 * Merge-on-login computation (AGENTS §5.4) — PURE.
 * maxCartQuantity is re-applied per variant: guest 5 + account 5 → still 5.
 */
export interface MergeLine {
  variantId: string;
  quantity: number;
}

export function mergeCartLines(
  dbLines: MergeLine[],
  guestLines: MergeLine[],
  maxByVariant: ReadonlyMap<string, number>,
): MergeLine[] {
  const merged = new Map<string, number>();
  for (const line of dbLines) {
    merged.set(line.variantId, line.quantity);
  }
  for (const line of guestLines) {
    const cap = maxByVariant.get(line.variantId) ?? 5;
    const combined = (merged.get(line.variantId) ?? 0) + line.quantity;
    merged.set(line.variantId, Math.min(combined, cap));
  }
  return [...merged.entries()].map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));
}
