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
 * Text is re-escaped. The parser is the shared one in `lib/security/html-sanitizer.ts`
 * (pure, so the admin editor can still run this in the browser); this file is the
 * e-mail policy.
 */

import { sanitizeHtml, type HtmlSanitizerPolicy } from "@/lib/security/html-sanitizer";

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

const EMAIL_POLICY: HtmlSanitizerPolicy = {
  allowedTags: ALLOWED_TAGS,
  voidTags: VOID_TAGS,
  droppedWithContent: DROPPED_WITH_CONTENT,
  globalAttributes: GLOBAL_ATTRIBUTES,
  tagAttributes: TAG_ATTRIBUTES,
  safeHref: SAFE_HREF,
  safeSrc: SAFE_SRC,
  // an image whose source was refused is removed, not kept as an empty <img> (QA 2026-10-03 T6-11)
  requiredAttributes: { img: "src" },
  sanitizeStyle: sanitizeInlineStyle,
};

export function sanitizeEmailHtml(input: string): string {
  return sanitizeHtml(input, EMAIL_POLICY);
}

/** Text of sanitized markup (tags removed, entities kept); only meaningful for sanitizer output. */
export function sanitizedText(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
