import PDFDocument from "pdfkit";
import { z } from "zod";
import { legalTexts as copy } from "@/lib/copy/invoice";
import { sha256Hex } from "@/lib/orders/legal-acceptance";
import { PDF_FONT_PATH } from "./pdf";

/**
 * The terms and withdrawal texts as a PDF attached to the order confirmation
 * (CRD Art. 8(7): the confirmation on a durable medium; a web link is not one).
 * CMS bodies are reduced to headings, paragraphs and list items. The text is
 * the body stored with the order at placement (`Order.legalAcceptance`), so the
 * buyer receives what they confirmed even when the page was edited before the
 * mail went out; orders placed before bodies were stored print the live page
 * with the accepted hash and a marker when the text has changed since.
 */

// ---------- Order.legalAcceptance (written at order placement) ----------

/** Read leniently: lib/orders/legal-acceptance.ts writes nulls for pages that were missing at placement. */
const acceptedPageSchema = z.object({
  key: z.string(),
  path: z.string().nullish(),
  slug: z.string().nullish(),
  updatedAt: z.string().nullish(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullish(),
  // Absent on orders placed before the body was stored.
  title: z.string().nullish(),
  body: z.string().nullish(),
});
const legalAcceptanceSchema = z.object({
  acceptedAt: z.string().optional(),
  pages: z.array(z.unknown()).default([]),
});

export type AcceptedLegalPage = z.output<typeof acceptedPageSchema>;

/** Accepted pages by key; an absent or malformed value (older orders) yields none. */
export function readLegalAcceptance(value: unknown): Map<string, AcceptedLegalPage> {
  const pages = new Map<string, AcceptedLegalPage>();
  const parsed = legalAcceptanceSchema.safeParse(value ?? {});
  if (!parsed.success) return pages;
  for (const entry of parsed.data.pages) {
    const page = acceptedPageSchema.safeParse(entry);
    if (page.success && !pages.has(page.data.key)) pages.set(page.data.key, page.data);
  }
  return pages;
}

// ---------- HTML → text blocks ----------

export interface TextBlock { kind: "heading" | "paragraph" | "item"; text: string }

/**
 * Named character references as a browser decodes them (names are
 * case-sensitive): all of HTML 4 (Latin-1, symbols, Greek, special), the HTML5
 * names of Latin Extended-A and the common HTML5 punctuation aliases. Runs are
 * listed in code-point order; "-" marks a code point without a name.
 */
const NAMED_ENTITIES = new Map<string, string>();
function nameRun(start: number, names: string): void {
  names.split(" ").forEach((name, offset) => {
    if (name !== "-") NAMED_ENTITIES.set(name, String.fromCodePoint(start + offset));
  });
}
// U+00A0–U+00FF Latin-1 Supplement.
nameRun(0xa0, "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest"
  + " Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig"
  + " agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml");
// U+0100–U+017E Latin Extended-A.
nameRun(0x100, "Amacr amacr Abreve abreve Aogon aogon Cacute cacute Ccirc ccirc Cdot cdot Ccaron ccaron Dcaron dcaron Dstrok dstrok Emacr emacr - - Edot edot Eogon eogon Ecaron ecaron"
  + " Gcirc gcirc Gbreve gbreve Gdot gdot Gcedil - Hcirc hcirc Hstrok hstrok Itilde itilde Imacr imacr - - Iogon iogon Idot imath IJlig ijlig Jcirc jcirc Kcedil kcedil kgreen"
  + " Lacute lacute Lcedil lcedil Lcaron lcaron Lmidot lmidot Lstrok lstrok Nacute nacute Ncedil ncedil Ncaron ncaron napos ENG eng Omacr omacr - - Odblac odblac OElig oelig"
  + " Racute racute Rcedil rcedil Rcaron rcaron Sacute sacute Scirc scirc Scedil scedil Scaron scaron Tcedil tcedil Tcaron tcaron Tstrok tstrok Utilde utilde Umacr umacr Ubreve ubreve"
  + " Uring uring Udblac udblac Uogon uogon Wcirc wcirc Ycirc ycirc Yuml Zacute zacute Zdot zdot Zcaron zcaron");
// U+0391–U+03A9 and U+03B1–U+03C9 Greek.
nameRun(0x391, "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho - Sigma Tau Upsilon Phi Chi Psi Omega");
nameRun(0x3b1, "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf sigma tau upsilon phi chi psi omega");
for (const [name, code] of Object.entries({
  // ASCII (HTML 4 plus HTML5 aliases).
  quot: 0x22, QUOT: 0x22, amp: 0x26, AMP: 0x26, apos: 0x27, lt: 0x3c, LT: 0x3c, gt: 0x3e, GT: 0x3e,
  excl: 0x21, num: 0x23, dollar: 0x24, percnt: 0x25, lpar: 0x28, rpar: 0x29, ast: 0x2a, plus: 0x2b, comma: 0x2c, period: 0x2e, sol: 0x2f,
  colon: 0x3a, semi: 0x3b, equals: 0x3d, quest: 0x3f, commat: 0x40, lsqb: 0x5b, lbrack: 0x5b, bsol: 0x5c, rsqb: 0x5d, rbrack: 0x5d, Hat: 0x5e,
  lowbar: 0x5f, grave: 0x60, lcub: 0x7b, lbrace: 0x7b, verbar: 0x7c, vert: 0x7c, rcub: 0x7d, rbrace: 0x7d,
  // Latin-1 aliases.
  NonBreakingSpace: 0xa0, COPY: 0xa9, REG: 0xae, half: 0xbd, centerdot: 0xb7, die: 0xa8, Dot: 0xa8, angst: 0xc5,
  // Spacing modifiers and Latin Extended-B.
  fnof: 0x192, circ: 0x2c6, caron: 0x2c7, breve: 0x2d8, dot: 0x2d9, ring: 0x2da, ogon: 0x2db, tilde: 0x2dc, dblac: 0x2dd,
  thetasym: 0x3d1, upsih: 0x3d2, piv: 0x3d6, ohm: 0x3a9,
  // General punctuation.
  ensp: 0x2002, emsp: 0x2003, emsp13: 0x2004, emsp14: 0x2005, numsp: 0x2007, puncsp: 0x2008, thinsp: 0x2009, hairsp: 0x200a,
  hyphen: 0x2010, dash: 0x2010, ndash: 0x2013, mdash: 0x2014, horbar: 0x2015, Vert: 0x2016,
  lsquo: 0x2018, rsquo: 0x2019, rsquor: 0x2019, sbquo: 0x201a, lsquor: 0x201a, ldquo: 0x201c, rdquo: 0x201d, rdquor: 0x201d, bdquo: 0x201e, ldquor: 0x201e,
  dagger: 0x2020, Dagger: 0x2021, bull: 0x2022, bullet: 0x2022, nldr: 0x2025, hellip: 0x2026, mldr: 0x2026, permil: 0x2030,
  prime: 0x2032, Prime: 0x2033, lsaquo: 0x2039, rsaquo: 0x203a, oline: 0x203e, frasl: 0x2044,
  // Letterlike symbols, currency, arrows, mathematical operators and shapes.
  euro: 0x20ac, image: 0x2111, weierp: 0x2118, real: 0x211c, trade: 0x2122, TRADE: 0x2122, numero: 0x2116, copysr: 0x2117, alefsym: 0x2135,
  larr: 0x2190, uarr: 0x2191, rarr: 0x2192, darr: 0x2193, harr: 0x2194, crarr: 0x21b5, lArr: 0x21d0, uArr: 0x21d1, rArr: 0x21d2, dArr: 0x21d3, hArr: 0x21d4,
  forall: 0x2200, part: 0x2202, exist: 0x2203, empty: 0x2205, nabla: 0x2207, isin: 0x2208, notin: 0x2209, ni: 0x220b, prod: 0x220f, sum: 0x2211,
  minus: 0x2212, lowast: 0x2217, radic: 0x221a, prop: 0x221d, infin: 0x221e, ang: 0x2220, and: 0x2227, or: 0x2228, cap: 0x2229, cup: 0x222a, int: 0x222b,
  there4: 0x2234, sim: 0x223c, cong: 0x2245, asymp: 0x2248, ne: 0x2260, equiv: 0x2261, le: 0x2264, ge: 0x2265, sub: 0x2282, sup: 0x2283, nsub: 0x2284,
  sube: 0x2286, supe: 0x2287, oplus: 0x2295, otimes: 0x2297, perp: 0x22a5, sdot: 0x22c5, lceil: 0x2308, rceil: 0x2309, lfloor: 0x230a, rfloor: 0x230b,
  lang: 0x27e8, rang: 0x27e9, loz: 0x25ca, spades: 0x2660, clubs: 0x2663, hearts: 0x2665, diams: 0x2666,
  starf: 0x2605, star: 0x2606, phone: 0x260e, female: 0x2640, male: 0x2642, check: 0x2713, cross: 0x2717,
})) NAMED_ENTITIES.set(name, String.fromCodePoint(code));
// The PDF gets plain spaces for the typographic ones and nothing for invisible format characters.
for (const name of ["nbsp", "NonBreakingSpace", "ensp", "emsp", "emsp13", "emsp14", "numsp", "puncsp", "thinsp", "hairsp"]) NAMED_ENTITIES.set(name, " ");
for (const name of ["shy", "zwnj", "zwj", "lrm", "rlm", "ZeroWidthSpace", "NoBreak"]) NAMED_ENTITIES.set(name, "");

/** Numeric references 0x80–0x9F name Windows-1252 characters, as HTML parsers read them (text pasted from Word). */
const WINDOWS_1252 = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

function decodeNumericReference(code: number): string {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
  if (code >= 0x80 && code <= 0x9f) {
    const mapped = WINDOWS_1252[code - 0x80];
    return mapped.charCodeAt(0) >= 0x80 && mapped.charCodeAt(0) <= 0x9f ? "" : mapped;
  }
  return String.fromCodePoint(code);
}

/** Decodes named and numeric character references; an unknown name stays literal, as in a browser. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1] === "x" || entity[1] === "X";
      return decodeNumericReference(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return NAMED_ENTITIES.get(entity) ?? match;
  });
}

const HEADING = /^h[1-6]$/;
const BLOCK = new Set(["p", "div", "section", "article", "blockquote", "ul", "ol", "table", "tr", "dl", "dt", "dd", "header", "footer", "figure", "figcaption", "pre", "hr"]);

/** Headings, paragraphs and list items of a CMS body; scripts, styles and markup are dropped. */
export function htmlToTextBlocks(html: string): TextBlock[] {
  const source = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, "");
  const blocks: TextBlock[] = [];
  let kind: TextBlock["kind"] = "paragraph";
  let buffer = "";
  const flush = (next: TextBlock["kind"] = "paragraph") => {
    const text = buffer.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    if (text) blocks.push({ kind, text });
    buffer = "";
    kind = next;
  };
  const tag = /<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>/gi;
  let last = 0;
  for (let match = tag.exec(source); match; match = tag.exec(source)) {
    buffer += decodeEntities(source.slice(last, match.index).replace(/</g, ""));
    last = tag.lastIndex;
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    if (name === "br") buffer += "\n";
    else if (HEADING.test(name)) flush(closing ? "paragraph" : "heading");
    else if (name === "li") flush(closing ? "paragraph" : "item");
    else if (BLOCK.has(name)) flush("paragraph");
    else if (name === "td" || name === "th") buffer += " ";
  }
  buffer += decodeEntities(source.slice(last).replace(/</g, ""));
  flush();
  return blocks;
}

// ---------- PDF ----------

export interface LegalTextDocument {
  /** legal.links key ("terms", "withdrawal"): matches the accepted page entry. */
  key: string;
  title: string;
  /** Absolute URL of the published page. */
  url: string;
  page: { title: string; body: string; updatedAt: Date } | null;
  accepted: AcceptedLegalPage | null;
}

export interface LegalTextSource {
  title: string;
  /** HTML to print; null when neither a stored nor a live text exists. */
  body: string | null;
  updatedAt: Date | null;
  /** "accepted": the body stored at placement; "live": the page as published now; "missing": neither. */
  origin: "accepted" | "live" | "missing";
  /** Only for a live fallback: the printed text differs from the version the buyer confirmed. */
  changedSinceAcceptance: boolean;
}

/**
 * The text a document prints. A stored body is used only when it still matches
 * the hash stored with it; otherwise (older orders, a damaged record) the live
 * page is printed with today's changed-since-acceptance marker.
 */
export function legalTextSource(document: LegalTextDocument): LegalTextSource {
  const accepted = document.accepted;
  if (accepted?.sha256 && typeof accepted.body === "string" && sha256Hex(accepted.body) === accepted.sha256) {
    const updatedAt = accepted.updatedAt ? new Date(accepted.updatedAt) : null;
    return {
      title: accepted.title || document.page?.title || document.title,
      body: accepted.body,
      updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
      origin: "accepted",
      changedSinceAcceptance: false,
    };
  }
  if (document.page) {
    return {
      title: document.page.title,
      body: document.page.body,
      updatedAt: document.page.updatedAt,
      origin: "live",
      // The body is compared, not the timestamp: a re-save without changes keeps the confirmed text.
      changedSinceAcceptance: !!accepted?.sha256 && sha256Hex(document.page.body) !== accepted.sha256,
    };
  }
  return { title: document.title, body: null, updatedAt: null, origin: "missing", changedSinceAcceptance: false };
}

export async function generateLegalTextsPdf(input: { orderNumber: string; preparedAt: Date; documents: LegalTextDocument[] }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50, font: PDF_FONT_PATH, info: { Title: `${copy.title} — ${input.orderNumber}` } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(16).text(copy.title);
  doc.moveDown(0.3);
  doc.fontSize(9).text(copy.order(input.orderNumber));
  doc.text(copy.preparedAt(input.preparedAt));
  doc.text(copy.intro);

  input.documents.forEach((document, index) => {
    if (index > 0) doc.addPage();
    else doc.moveDown(1.5);
    const source = legalTextSource(document);
    doc.fontSize(14).text(source.title);
    doc.fontSize(8).text(document.url);
    if (source.updatedAt) doc.text(copy.updatedAt(source.updatedAt));
    if (document.accepted?.sha256) {
      doc.text(copy.accepted(document.accepted.sha256));
      if (source.origin === "accepted") doc.text(copy.acceptedCopy);
      if (source.changedSinceAcceptance) doc.text(copy.changedSinceAcceptance);
    }
    doc.moveDown();
    if (source.body === null) {
      doc.fontSize(10).text(copy.missing(document.url));
      return;
    }
    for (const block of htmlToTextBlocks(source.body)) {
      if (block.kind === "heading") {
        doc.moveDown(0.4);
        doc.fontSize(11).text(block.text);
        doc.moveDown(0.2);
      } else if (block.kind === "item") {
        doc.fontSize(9.5).text(`•  ${block.text}`, { indent: 10 });
      } else {
        doc.fontSize(9.5).text(block.text);
        doc.moveDown(0.4);
      }
    }
  });

  doc.end();
  return done;
}
