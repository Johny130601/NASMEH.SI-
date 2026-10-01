/**
 * Allow-list HTML sanitizer shared by every operator-authored HTML surface.
 *
 * One parser, two policies: `lib/email/sanitize.ts` (e-mail overrides, which
 * need tables and a vetted inline-style subset) and `sanitizeContentHtml`
 * below (CMS page bodies and product content rendered on the storefront and
 * in the admin preview, same origin as /admin — so nothing that runs script,
 * embeds a document, or can restyle the page survives).
 *
 * The parser re-serialises the input:
 * - comments, doctypes and processing instructions are removed; an unclosed
 *   `<!--` drops the rest of the input instead of swallowing what follows;
 * - elements in `droppedWithContent` are removed together with their content
 *   (unclosed: the rest of the input);
 * - any other element that is not allow-listed is removed but its text kept;
 * - only allow-listed attributes survive, URLs only when the policy's pattern
 *   accepts them (after entity decoding and control-character stripping);
 * - stray closing tags are dropped and every open tag is closed at the end.
 * Text is re-escaped. No imports: the admin editors can run it in the browser.
 */

export interface HtmlSanitizerPolicy {
  allowedTags: ReadonlySet<string>;
  voidTags: ReadonlySet<string>;
  droppedWithContent: ReadonlySet<string>;
  globalAttributes: ReadonlySet<string>;
  tagAttributes: Readonly<Record<string, ReadonlySet<string>>>;
  safeHref: RegExp;
  safeSrc: RegExp;
  /** Returns the kept declarations, or "" to drop the attribute. Absent: `style` is never kept. */
  sanitizeStyle?: (style: string) => string;
  /** Rewrites the kept attributes of one element (e.g. forcing rel on target=_blank links). */
  finishAttributes?: (tag: string, attributes: Array<[string, string]>) => Array<[string, string]>;
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

const URL_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src"]);

function serializeAttributes(tag: string, raw: Array<[string, string]>, policy: HtmlSanitizerPolicy): string {
  const seen = new Set<string>();
  let kept: Array<[string, string]> = [];
  for (const [name, rawValue] of raw) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (!policy.globalAttributes.has(name) && !policy.tagAttributes[tag]?.has(name)) continue;
    let value = decodeAttribute(rawValue).replace(/[\u0000-\u001F\u007F]/g, "").trim();
    if (URL_ATTRIBUTES.has(name) && !(name === "href" ? policy.safeHref : policy.safeSrc).test(value)) continue;
    if (name === "style") {
      if (!policy.sanitizeStyle) continue;
      value = policy.sanitizeStyle(value);
      if (!value) continue;
    }
    kept.push([name, value]);
  }
  if (policy.finishAttributes) kept = policy.finishAttributes(tag, kept);
  return kept.map(([name, value]) => ` ${name}="${escapeKeepingEntities(value, true)}"`).join("");
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

export function sanitizeHtml(input: string, policy: HtmlSanitizerPolicy): string {
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
    if (policy.droppedWithContent.has(tag.name)) {
      index = skipElementContent(html, index, tag.name);
      continue;
    }
    if (!policy.allowedTags.has(tag.name)) continue;
    const attributes = serializeAttributes(tag.name, tag.attributes, policy);
    if (policy.voidTags.has(tag.name)) {
      output += `<${tag.name}${attributes} />`;
    } else {
      output += `<${tag.name}${attributes}>`;
      open.push(tag.name);
    }
  }
  while (open.length) output += `</${open.pop()}>`;
  return output;
}

// ---------------------------------------------------------------------------
// Storefront content policy (CMS page bodies, product accordions/description)

const CONTENT_POLICY: HtmlSanitizerPolicy = {
  // No h1: every page renders its own <h1>; a body heading of that level is kept as text.
  allowedTags: new Set([
    "a", "abbr", "b", "blockquote", "br", "caption", "code", "div", "em", "figcaption", "figure", "h2", "h3", "h4",
    "h5", "h6", "hr", "i", "img", "li", "mark", "ol", "p", "pre", "s", "small", "span", "strong", "sub", "sup",
    "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
  ]),
  voidTags: new Set(["br", "hr", "img"]),
  droppedWithContent: new Set([
    "applet", "audio", "base", "button", "canvas", "embed", "form", "frame", "frameset", "head", "iframe", "input",
    "link", "math", "meta", "noembed", "noframes", "noscript", "object", "option", "plaintext", "script", "select",
    "style", "svg", "template", "textarea", "title", "video", "xmp",
  ]),
  // No class, id, style or data-*: content is styled by `.content-prose` (design tokens, AGENTS §8.6),
  // so operator markup can neither restyle, overlay nor hide the page around it.
  globalAttributes: new Set(["dir", "lang", "title"]),
  tagAttributes: {
    a: new Set(["href", "target"]),
    img: new Set(["alt", "height", "src", "width"]),
    td: new Set(["colspan", "rowspan"]),
    th: new Set(["colspan", "rowspan", "scope"]),
    ol: new Set(["start", "type"]),
  },
  // Absolute http(s), mail and phone links, fragments, and same-site paths ("/kontakt" but not "//evil").
  safeHref: /^(https?:|mailto:|tel:|#|\/(?![/\\]))/i,
  // Images from this site or https only.
  safeSrc: /^(https:|\/(?![/\\]))/i,
  finishAttributes(tag, attributes) {
    if (tag === "a") {
      const target = attributes.find(([name]) => name === "target")?.[1];
      const rest = attributes.filter(([name]) => name !== "target");
      // Only a new tab is a meaningful target; it always gets an opener-safe rel.
      return target === "_blank" ? [...rest, ["target", "_blank"], ["rel", "noopener noreferrer"]] : rest;
    }
    if (tag === "img") {
      const rest = attributes.filter(([name]) => name !== "loading");
      return [...rest, ["loading", "lazy"]];
    }
    return attributes;
  },
};

/**
 * Sanitizes operator HTML for the storefront (CMS page bodies, product HTML fields).
 * Applied when the admin saves AND when a page renders it, so rows stored before
 * the rule existed are safe too (AGENTS §8.24).
 */
export function sanitizeContentHtml(input: string): string {
  return sanitizeHtml(input, CONTENT_POLICY);
}
