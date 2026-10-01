/**
 * Cart lines that sold out while they sat in the cart (QA 2026-09-30).
 *
 * The cart keeps such a line at its stored quantity (lib/cart/hydrate), so the
 * checkout has to say so before the shopper fills in every step: the quote
 * refuses a cart holding one, naming the lines, and the wizard stops at the
 * start with a way back to the cart. Order creation answers the same refusal
 * the way its own stock check does (`stock:<titles>`); that check stays the
 * authoritative guard against a race between the quote and the order.
 *
 * PURE: no I/O, so the quote, order creation and the pages share it.
 */

export class SoldOutLinesError extends Error {
  readonly titles: string[];

  constructor(titles: string[]) {
    super("sold_out");
    this.name = "SoldOutLinesError";
    this.titles = titles;
  }
}

/** The titles of the lines nothing can be sold of, in cart order. */
export function soldOutLineTitles(lines: ReadonlyArray<{ title: string; soldOut: boolean }>): string[] {
  return lines.filter((line) => line.soldOut).map((line) => line.title);
}

/** Throws the refusal when any line is sold out; a cart without one passes untouched. */
export function assertNoSoldOutLines(lines: ReadonlyArray<{ title: string; soldOut: boolean }>): void {
  const titles = soldOutLineTitles(lines);
  if (titles.length > 0) throw new SoldOutLinesError(titles);
}
