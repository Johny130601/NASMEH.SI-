/**
 * Plain-text alternative of an HTML mail body: style and script blocks
 * dropped, tags stripped, character references decoded, whitespace
 * collapsed. Decoding happens after the tags are gone, so a reference that
 * spells a tag ("&lt;b&gt;") becomes literal text, never markup.
 */

const NAMED_REFERENCES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  euro: "€", copy: "©", reg: "®", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
};

function decodeReference(match: string, body: string): string {
  if (body[0] === "#") {
    const hex = body[1] === "x" || body[1] === "X";
    const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
    // Surrogates and NUL are not text; leave the reference as written.
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match;
    return String.fromCodePoint(code);
  }
  return NAMED_REFERENCES[body.toLowerCase()] ?? match;
}

const ANCHOR = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi;

/**
 * A link keeps its target in the text part — "Sledi naročilu: https://…" —
 * because a text reader cannot follow a label (QA 2026-09-30: tracking and
 * unsubscribe links became bare words). A label that already shows the target
 * (a printed URL, an e-mail address) is left alone; fragments and script URLs
 * keep only the label.
 */
function anchorToText(_match: string, doubleQuoted: string | undefined, singleQuoted: string | undefined, inner: string): string {
  const href = (doubleQuoted ?? singleQuoted ?? "").trim();
  const label = inner.replace(/<[^>]+>/g, "").trim();
  if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return label;
  const target = href.replace(/^mailto:/i, "");
  if (!label || label === href || label === target) return target;
  return `${label}: ${target}`;
}

/** Elements whose boundaries are line breaks in the rendered mail. */
const BLOCK_TAG = /<\/?(?:p|div|h[1-6]|li|ul|ol|tr|table|tbody|thead|tfoot|blockquote|section|article|header|footer|hr)\b[^>]*>/gi;

/**
 * Keeps the mail's structure: paragraphs, headings, list items and table rows
 * become lines, cells in a row stay on one line (QA 2026-09-30: the order
 * confirmation's text part was one 2 500-character line).
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    // source formatting is not structure
    .replace(/\s+/g, " ")
    .replace(ANCHOR, anchorToText)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(BLOCK_TAG, "\n")
    .replace(/<\/t[dh]\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, decodeReference)
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
