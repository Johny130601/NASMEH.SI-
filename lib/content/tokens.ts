/**
 * Tokens an operator may type into merchandising text, so a figure in it is
 * computed from the live data instead of typed (AGENTS §8.23): the marquee's
 * free-shipping amount follows the shipping Setting and the welcome popup names
 * the code it really applies (QA 2026-10-03 T6-04, T6-05). The server fills
 * them before the text is rendered; a text without a token is shown as typed.
 * PURE, no imports — the admin forms name the tokens in their hints.
 */
export const CONTENT_TOKENS = {
  /** The welcome popup's coupon code. */
  code: "{koda}",
  /** The free-shipping threshold, formatted like every other price. */
  threshold: "{prag}",
} as const;

/** Every occurrence of `token` in `text` replaced by `value`. */
export function fillToken(text: string, token: string, value: string): string {
  return text.split(token).join(value);
}
