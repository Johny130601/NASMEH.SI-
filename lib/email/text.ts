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

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, decodeReference)
    .replace(/\s+/g, " ")
    .trim();
}
