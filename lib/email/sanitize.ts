/**
 * Conservative allow-list sanitizer for operator-edited e-mail bodies (§14.10).
 *
 * The required blocks the mailer appends after an override (the order
 * confirmation's legal block, the newsletter withdrawal link) must stay
 * visible whatever the operator typed, so the body is re-serialised on save
 * and again on every render:
 * - comments, doctypes and processing instructions are removed; an unclosed
 *   `<!--` drops the rest of the body instead of swallowing what follows;
 * - `<style>`, `<script>`, `<title>`, `<head>` and other elements that carry
 *   no visible body text are removed with their content (unclosed: the rest);
 * - only formatting tags and attributes on the allow lists survive (no `class`,
 *   `id`, `hidden` or `data-*`), links only to http(s), mailto, tel or a
 *   placeholder, and inline styles keep only declarations that cannot hide,
 *   move or overlap content;
 * - stray closing tags are dropped and every open tag is closed at the end,
 *   so no operator element wraps what the mailer appends.
 * Text is re-escaped. No imports: the admin editor can run it in the browser.
 */

const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "b", "blockquote", "br", "caption", "center", "code", "col", "colgroup", "div", "em",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "s", "small", "span",
  "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);

const VOID_TAGS: ReadonlySet<string> = new Set(["br", "col", "hr", "img"]);

/** Removed together with their content: style, script, document metadata, embedded documents and form widgets. */
const DROPPED_WITH_CONTENT: ReadonlySet<string> = new Set([
  "applet", "audio", "canvas", "embed", "frameset", "head", "iframe", "math", "noembed", "noframes", "noscript",
  "object", "plaintext", "script", "select", "style", "svg", "template", "textarea", "title", "video", "xmp",
]);

const GLOBAL_ATTRIBUTES: ReadonlySet<string> = new Set(["align", "dir", "lang", "style", "title", "valign"]);
const TAG_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(["href", "name", "rel", "target"]),
  img: new Set(["alt", "height", "src", "width"]),
  table: new Set(["bgcolor", "border", "cellpadding", "cellspacing", "height", "role", "width"]),
  td: new Set(["bgcolor", "colspan", "height", "rowspan", "width"]),
  th: new Set(["bgcolor", "colspan", "height", "rowspan", "scope", "width"]),
  tr: new Set(["bgcolor", "height"]),
  col: new Set(["span", "width"]),
  colgroup: new Set(["span", "width"]),
  ol: new Set(["start", "type"]),
  ul: new Set(["type"]),
};

const URL_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src"]);
const SAFE_HREF = /^(https?:|mailto:|tel:|#|\{\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}\})/i;
const SAFE_SRC = /^(https?:|\{\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}\})/i;

/** Declarations that neither hide, move nor overlap content. `display` and `font-size` get value checks too. */
const CSS_PROPERTIES: ReadonlySet<string> = new Set([
  "background-color", "border", "border-bottom", "border-collapse", "border-color", "border-left", "border-radius",
  "border-right", "border-spacing", "border-style", "border-top", "border-width", "color", "display", "font-family",
  "font-size", "font-style", "font-weight", "line-height", "list-style-type", "margin", "margin-bottom", "margin-left",
  "margin-right", "margin-top", "max-width", "min-width", "overflow-wrap", "padding", "padding-bottom", "padding-left",
  "padding-right", "padding-top", "text-align", "text-decoration", "text-transform", "vertical-align", "white-space",
  "width", "word-break", "word-wrap",
]);
const DISPLAY_VALUES: ReadonlySet<string> = new Set(["block", "inline", "inline-block", "list-item", "table", "table-cell", "table-row"]);
const UNSAFE_CSS_VALUE = /url\s*\(|expression|javascript:|@import|var\s*\(|calc\s*\(|attr\s*\(|env\s*\(|\\|\/\*|[<>{}]/i;
/** A negative length (margins pulling the next block over this one). */
const NEGATIVE_NUMBER = /(^|[\s(,:])-\s*\.?\d/;
/** Spacing that could push what follows out of sight: bounded, in ordinary units only. */
const BOUNDED_PROPERTIES = /^(margin|padding|border|line-height|font-size)/;
const LENGTH_LIMITS: Readonly<Record<string, number>> = { px: 200, pt: 150, em: 12, rem: 12, "%": 400, "": 10 };

function withinLimits(value: string): boolean {
  const lengths = value.replace(/#[0-9a-f]+/gi, " ").replace(/(rgba?|hsla?)\s*\([^)]*\)/gi, " ");
  for (const token of lengths.split(/[\s,/]+/)) {
    const match = /^(\d*\.?\d+)([a-z%]*)$/i.exec(token);
    if (!match) continue;
    const limit = LENGTH_LIMITS[match[2].toLowerCase()];
    if (limit === undefined || Number(match[1]) > limit) return false;
  }
  return true;
}

function readableFontSize(value: string): boolean {
  const keyword = /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i;
  if (keyword.test(value)) return true;
  const match = /^(\d*\.?\d+)\s*(px|pt|em|rem|%)$/i.exec(value);
  if (!match) return false;
  const size = Number(match[1]);
  const minimum = { px: 8, pt: 6, em: 0.5, rem: 0.5, "%": 50 }[match[2].toLowerCase() as "px" | "pt" | "em" | "rem" | "%"];
  return size >= minimum;
}

/** Keeps only allow-listed declarations with safe values. */
export function sanitizeInlineStyle(style: string): string {
  const kept: string[] = [];
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim().replace(/\s*!important$/i, "");
    if (!value || !CSS_PROPERTIES.has(property) || UNSAFE_CSS_VALUE.test(value) || NEGATIVE_NUMBER.test(value)) continue;
    if (property === "display" && !DISPLAY_VALUES.has(value.toLowerCase())) continue;
    if (property === "font-size" && !readableFontSize(value)) continue;
    if (BOUNDED_PROPERTIES.test(property) && !withinLimits(value)) continue;
    kept.push(`${property}:${value}`);
  }
  return kept.length ? `${kept.join(";")};` : "";
}

const BASIC_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

function decodeAttribute(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return BASIC_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

/** Escapes `<`, `>`, quotes and a bare `&`; an existing entity reference is kept. */
function escapeKeepingEntities(value: string, attribute: boolean): string {
  const escaped = value
    .replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return attribute ? escaped.replace(/"/g, "&quot;") : escaped;
}

interface ParsedTag { name: string; attributes: Array<[string, string]>; end: number }

/** Matches at `index` only (sticky), without copying the rest of the input. */
function matchAt(pattern: RegExp, html: string, index: number): string {
  pattern.lastIndex = index;
  return pattern.exec(html)?.[0] ?? "";
}

const TAG_NAME = /<\/?([a-zA-Z][a-zA-Z0-9-]*)/y;
const ATTRIBUTE_NAME = /[^\s/>"'=]+|["'=]/y;
const UNQUOTED_VALUE = /[^\s>]*/y;

/** Parses `<name attr=value ...>` starting at `start` (the `<`); null when the input ends inside the tag. */
function parseTag(html: string, start: number): ParsedTag | null {
  TAG_NAME.lastIndex = start;
  const nameMatch = TAG_NAME.exec(html);
  if (!nameMatch) return null;
  const attributes: Array<[string, string]> = [];
  let index = start + nameMatch[0].length;
  while (index < html.length) {
    const char = html[index];
    if (char === ">") return { name: nameMatch[1].toLowerCase(), attributes, end: index + 1 };
    if (/[\s/]/.test(char)) { index += 1; continue; }
    const name = matchAt(ATTRIBUTE_NAME, html, index);
    index += name.length;
    while (index < html.length && /\s/.test(html[index])) index += 1;
    let value = "";
    if (html[index] === "=") {
      index += 1;
      while (index < html.length && /\s/.test(html[index])) index += 1;
      const quote = html[index];
      if (quote === "\"" || quote === "'") {
        const close = html.indexOf(quote, index + 1);
        if (close < 0) return null;
        value = html.slice(index + 1, close);
        index = close + 1;
      } else {
        value = matchAt(UNQUOTED_VALUE, html, index);
        index += value.length;
      }
    }
    attributes.push([name.toLowerCase(), value]);
  }
  return null;
}

function serializeAttributes(tag: string, attributes: Array<[string, string]>): string {
  const seen = new Set<string>();
  let output = "";
  for (const [name, raw] of attributes) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (!GLOBAL_ATTRIBUTES.has(name) && !TAG_ATTRIBUTES[tag]?.has(name)) continue;
    let value = decodeAttribute(raw).replace(/[\u0000-\u001F]/g, "").trim();
    if (URL_ATTRIBUTES.has(name) && !(name === "href" ? SAFE_HREF : SAFE_SRC).test(value)) continue;
    if (name === "style") {
      value = sanitizeInlineStyle(value);
      if (!value) continue;
    }
    output += ` ${name}="${escapeKeepingEntities(value, true)}"`;
  }
  return output;
}

/** Index just past the closing tag of a raw-content element, or the input length when it never closes. */
function skipElementContent(html: string, from: number, name: string): number {
  const closing = new RegExp(`</${name}(?=[\\s/>])`, "ig");
  closing.lastIndex = from;
  const match = closing.exec(html);
  if (!match) return html.length;
  const end = html.indexOf(">", match.index);
  return end < 0 ? html.length : end + 1;
}

export function sanitizeEmailHtml(input: string): string {
  const html = input.replace(/\u0000/g, "");
  const open: string[] = [];
  let output = "";
  let index = 0;
  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt < 0) {
      output += escapeKeepingEntities(html.slice(index), false);
      break;
    }
    output += escapeKeepingEntities(html.slice(index, lt), false);
    const next = html[lt + 1];
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end < 0) break;
      index = end + 3;
      continue;
    }
    if (next === "!" || next === "?") {
      const end = html.indexOf(">", lt);
      if (end < 0) break;
      index = end + 1;
      continue;
    }
    const closing = next === "/";
    if (!/[a-zA-Z]/.test(html[lt + (closing ? 2 : 1)] ?? "")) {
      if (closing) {
        // "</ >" and friends are bogus comments in HTML; drop them.
        const end = html.indexOf(">", lt);
        if (end < 0) break;
        index = end + 1;
      } else {
        output += "&lt;";
        index = lt + 1;
      }
      continue;
    }
    const tag = parseTag(html, lt);
    if (!tag) break;
    index = tag.end;
    if (closing) {
      const position = open.lastIndexOf(tag.name);
      if (position >= 0) {
        while (open.length > position) output += `</${open.pop()}>`;
      }
      continue;
    }
    if (DROPPED_WITH_CONTENT.has(tag.name)) {
      index = skipElementContent(html, index, tag.name);
      continue;
    }
    if (!ALLOWED_TAGS.has(tag.name)) continue;
    const attributes = serializeAttributes(tag.name, tag.attributes);
    if (VOID_TAGS.has(tag.name)) {
      output += `<${tag.name}${attributes} />`;
    } else {
      output += `<${tag.name}${attributes}>`;
      open.push(tag.name);
    }
  }
  while (open.length) output += `</${open.pop()}>`;
  return output;
}

/** Text of sanitized markup (tags removed, entities kept); only meaningful for sanitizer output. */
export function sanitizedText(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
