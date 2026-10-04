/**
 * Table of contents for a legal page body (spec §12.5 "legal w/ TOC", QA
 * 2026-10-03 T1-04): every <h2> gets a stable id slugified from its own text,
 * and the anchors are returned for the page to render in its initial HTML.
 *
 * Runs on the OUTPUT of `sanitizeContentHtml`, never before it: the sanitizer
 * drops every operator id (AGENTS §8.24) and re-serialises the markup, so text
 * and attribute values are escaped and "<h2" can only open an h2 element — a
 * plain scan is exact. The ids are added here, after sanitizing, from the
 * heading text alone; nothing the operator typed becomes an attribute.
 * PURE, no imports.
 */

export interface TocEntry {
  /** The heading's id, also the `#fragment` of its anchor. */
  id: string;
  /** The heading's text, as the reader sees it. */
  text: string;
}

/** An h2 opening tag as the sanitizer writes it: `<h2>` or `<h2 dir=".." lang=".." title="..">`. */
const H2_OPEN = /<h2(\s[^>]*)?>/g;
const H2_CLOSE = "</h2>";

/** Longest slug kept; a long heading still gets a readable, bounded fragment. */
const MAX_SLUG_LENGTH = 64;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", shy: "",
  scaron: "š", Scaron: "Š", ccaron: "č", Ccaron: "Č", zcaron: "ž", Zcaron: "Ž", cacute: "ć", Cacute: "Ć",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”",
};

/** The text a heading's inner HTML shows: tags removed, entity references decoded, whitespace collapsed. */
export function headingText(innerHtml: string): string {
  return innerHtml
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (entity, body: string) => {
      if (body[0] === "#") {
        const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return NAMED_ENTITIES[body] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "7. Odstop od pogodbe in reklamacije" → "7-odstop-od-pogodbe-in-reklamacije":
 * diacritics folded (č → c, š → s, ž → z, đ → d), anything else that is not a
 * letter or digit becomes one hyphen. Empty when nothing is left.
 */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
}

/**
 * Adds an id to every <h2> of a sanitized body and lists them in order. Ids
 * are unique within the body ("-2", "-3" on a repeated heading) and stable:
 * the same heading text always yields the same fragment, so a link to a
 * section survives edits elsewhere in the text. A heading without text gets
 * neither an id nor an entry.
 */
export function withHeadingIds(sanitizedHtml: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const used = new Set<string>();
  let html = "";
  let copied = 0;
  for (const match of sanitizedHtml.matchAll(H2_OPEN)) {
    const start = match.index;
    const end = start + match[0].length;
    const close = sanitizedHtml.indexOf(H2_CLOSE, end);
    const text = headingText(sanitizedHtml.slice(end, close < 0 ? undefined : close));
    if (!text) continue;
    const base = slugifyHeading(text) || `section-${toc.length + 1}`;
    let id = base;
    for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
    used.add(id);
    toc.push({ id, text });
    html += `${sanitizedHtml.slice(copied, start)}<h2${match[1] ?? ""} id="${id}">`;
    copied = end;
  }
  return { html: html + sanitizedHtml.slice(copied), toc };
}
