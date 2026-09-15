import { describe, expect, it, vi } from "vitest";

/** Phase 9 step 4 review (U8): an operator override can neither hide nor wrap the required block. */

vi.mock("@/lib/db", () => ({ db: { emailTemplate: { findUnique: vi.fn() } } }));

import { sanitizeEmailHtml, sanitizeInlineStyle, sanitizedText } from "@/lib/email/sanitize";
import { renderTemplate } from "@/lib/email/templates/render";
import { EMAIL_TEMPLATE_DEFS, EMAIL_TEMPLATE_KEYS, substitutePlaceholders } from "@/lib/email/template-defs";

const REQUIRED = `<div data-required><p>Obvezno besedilo</p></div>`;

/** The body a mail client sees before the required block, and whether the block starts outside every operator element. */
function render(body: string) {
  const html = renderTemplate("verifyAccount", "Zadeva", body, { confirmUrl: "https://nasmeh.si/potrdi-racun/abc" }, REQUIRED).html;
  const before = html.slice(0, html.indexOf(REQUIRED));
  return { html, before };
}

function expectNothingOpen(markup: string) {
  const stack: string[] = [];
  for (const match of markup.matchAll(/<(\/?)([a-z0-9]+)[^>]*?(\/?)>/gi)) {
    const [, closing, name, selfClosing] = match;
    if (selfClosing || ["br", "hr", "img", "col"].includes(name)) continue;
    if (closing) expect(stack.pop()).toBe(name);
    else stack.push(name);
  }
  expect(stack).toEqual([]);
}

describe("sanitizeEmailHtml", () => {
  it("drops an unclosed comment with everything after it instead of commenting out the required block", () => {
    const { html, before } = render("<p>Pozdrav</p><!-- skrito <p>ostanek</p>");
    expect(html).toContain(REQUIRED);
    expect(before).not.toContain("<!--");
    expect(before).toContain("<p>Pozdrav</p>");
    expect(before).not.toContain("ostanek");
    expect(sanitizeEmailHtml("a<!-- x -->b<!--[if mso]><p>mso</p><![endif]-->c")).toBe("abc");
  });

  it("removes style, script, title and head elements with their content, closed or not", () => {
    for (const body of [
      "<style>[data-required]{display:none}</style><p>Hvala</p>",
      "<p>Hvala</p><style>div{display:none!important}",
      "<p>Hvala</p><title>",
      "<head><style>*{display:none}</style></head><p>Hvala</p>",
      "<p>Hvala</p><script>document.body.remove()</script>",
      "<p>Hvala</p><textarea>",
      "<p>Hvala</p><svg><style>div{display:none}</style></svg>",
      "<p>Hvala</p><noscript><p>x</p></noscript><xmp>",
    ]) {
      const { html, before } = render(body);
      expect(html, body).toContain(REQUIRED);
      expect(before, body).toContain("Hvala");
      expect(before, body).not.toMatch(/<(style|script|title|head|textarea|svg|noscript|xmp)/i);
      expect(before, body).not.toContain("display:none");
    }
  });

  it("closes every open element and drops stray closing tags, so no wrapper reaches the required block", () => {
    for (const body of [
      `<div style="display:none">`,
      `<table><tr><td style="color:red"><div><span>`,
      `<p>a</td></tr></tbody></table></body></html><div>`,
      `<a href="https://nasmeh.si">povezava`,
      `<p title="nezaprt`,
      `<b><i>x</b>y</i>`,
    ]) {
      const sanitized = sanitizeEmailHtml(body);
      expectNothingOpen(sanitized);
      expect(render(body).html, body).toContain(`${sanitized}${REQUIRED}`);
    }
    expect(sanitizeEmailHtml(`<div style="display:none"><p>x`)).toBe("<div><p>x</p></div>");
    expect(sanitizeEmailHtml("<p>a</td></tr></table>b")).toBe("<p>ab</p>");
    expect(sanitizeEmailHtml("<b><i>x</b>y</i>")).toBe("<b><i>x</i></b>y");
  });

  it("strips hiding, moving and overlapping inline styles and keeps ordinary formatting", () => {
    expect(sanitizeInlineStyle("display:none")).toBe("");
    expect(sanitizeInlineStyle("DISPLAY : NONE !important")).toBe("");
    expect(sanitizeInlineStyle("visibility:hidden;opacity:0;position:absolute;top:-9999px;overflow:hidden;height:0;max-height:0;mso-hide:all;clip:rect(0 0 0 0);transform:scale(0)")).toBe("");
    expect(sanitizeInlineStyle("font-size:0;line-height:0")).toBe("line-height:0;");
    expect(sanitizeInlineStyle("font-size:1px")).toBe("");
    expect(sanitizeInlineStyle("margin-bottom:-500px;padding-bottom:99999px;margin:0 0 -2rem")).toBe("");
    expect(sanitizeInlineStyle("background-color:rgb(1,2,3);background:url(https://x/y.png)")).toBe("background-color:rgb(1,2,3);");
    expect(sanitizeInlineStyle("color:red;width:expression(alert(1))")).toBe("color:red;");
    expect(sanitizeInlineStyle("disp\\6c ay:none")).toBe("");
    expect(sanitizeInlineStyle("display:inline-block;background-color:rgb(28,28,30);color:rgb(255,255,255);text-decoration:none;padding:0.9rem 2rem;border-radius:3rem;font-size:1rem;font-weight:500;"))
      .toBe("display:inline-block;background-color:rgb(28,28,30);color:rgb(255,255,255);text-decoration:none;padding:0.9rem 2rem;border-radius:3rem;font-size:1rem;font-weight:500;");
    expect(sanitizeEmailHtml(`<p style="display:&#110;one">x</p>`)).toBe("<p>x</p>");
    expect(sanitizeEmailHtml(`<p style="color:red;display:none">x</p>`)).toBe(`<p style="color:red;">x</p>`);
  });

  it("keeps only allow-listed tags and attributes: no class, id, hidden, data-* or unsafe links", () => {
    expect(sanitizeEmailHtml(`<div class="legal" id="x" hidden aria-hidden="true" data-order-legal-abc="1" onclick="x()">t</div>`)).toBe("<div>t</div>");
    expect(sanitizeEmailHtml(`<details><summary>s</summary>vsebina</details><dialog>d</dialog><form><input type="hidden" value="v">f</form>`)).toBe("svsebinadf");
    expect(sanitizeEmailHtml(`<a href="javascript:alert(1)">a</a><a href="java&#115;cript:x">b</a><a href=" https://nasmeh.si/x?a=1&b=2 " target="_blank">c</a>`))
      .toBe(`<a>a</a><a>b</a><a href="https://nasmeh.si/x?a=1&amp;b=2" target="_blank">c</a>`);
    expect(sanitizeEmailHtml(`<a href="{{accountUrl}}">p</a><a href="{{ javascript:x }}">q</a><img src="data:image/png;base64,x" alt="a"><img src="https://nasmeh.si/a.png" alt="b">`))
      .toBe(`<a href="{{accountUrl}}">p</a><a>q</a><img alt="a" /><img src="https://nasmeh.si/a.png" alt="b" />`);
    expect(sanitizeEmailHtml(`<meta http-equiv="refresh" content="0"><base href="https://evil"><link rel="stylesheet" href="https://x">ok`)).toBe("ok");
  });

  it("escapes stray markup characters in text and keeps entities as written", () => {
    expect(sanitizeEmailHtml(`1 < 2 > 0 & "q" &amp; &euro; &#8364; <3 </ x>`)).toBe(`1 &lt; 2 &gt; 0 &amp; "q" &amp; &euro; &#8364; &lt;3 `);
    expect(sanitizeEmailHtml(`<p title='a"b>c'>x</p>`)).toBe(`<p title="a&quot;b&gt;c">x</p>`);
    expect(sanitizedText(sanitizeEmailHtml(`<p title="Predviden rok">x</p>`))).toBe("x");
  });

  it("leaves every default template body's content and the prepared placeholder blocks intact", () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const def = EMAIL_TEMPLATE_DEFS[key];
      const rendered = substitutePlaceholders(key, def.defaultBody, def.sample, "html");
      const sanitized = sanitizeEmailHtml(rendered);
      expect(sanitizedText(sanitized).replace(/\s+/g, " "), key).toBe(sanitizedText(rendered).replace(/\s+/g, " "));
      expect(sanitized.match(/style="/g)?.length ?? 0, key).toBe(rendered.match(/style="/g)?.length ?? 0);
      expect(sanitized.match(/href="/g)?.length ?? 0, key).toBe(rendered.match(/href="/g)?.length ?? 0);
      expect(sanitizeEmailHtml(sanitized), key).toBe(sanitized);
    }
  });

  it("handles a maximum-size body of unbalanced tags and attributes quickly", () => {
    const hostile = `<div style="display:none" a=b c='d' e>`.repeat(1500) + "<!--";
    expect(hostile.length).toBeLessThanOrEqual(60_000);
    const started = performance.now();
    const sanitized = sanitizeEmailHtml(hostile);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(sanitized).toBe("<div>".repeat(1500) + "</div>".repeat(1500));
  });

  it("passes the substituted, sanitized body to a required-block function", () => {
    const seen: string[] = [];
    const html = renderTemplate("resetPassword", "x", `<p>{{resetUrl}}</p><!-- {{resetUrl}}`, { resetUrl: "https://nasmeh.si/r" }, (body) => { seen.push(body); return REQUIRED; }).html;
    expect(seen).toEqual(["<p>https://nasmeh.si/r</p>"]);
    expect(html).toContain(`<p>https://nasmeh.si/r</p>${REQUIRED}`);
  });
});
